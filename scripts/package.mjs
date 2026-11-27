// Builds the store zips in dist/: one for the Chrome Web Store and one for
// Firefox Add-ons. The code is the same in both; only the manifest differs.
//
//   node scripts/package.mjs
//
// Needs the zip command (macOS and most Linux systems have it).
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["manifest.json", "background.js", "popup.html", "popup.js", "styles.css", "icons", "LICENSE"];

export const FIREFOX_ID = "headercheck@kimberly-wood.com";

// Firefox runs background code as a background script, not a service worker,
// and needs an add-on ID and a statement that the extension collects no data.
export function firefoxManifest(chrome) {
  const m = structuredClone(chrome);
  delete m.minimum_chrome_version;
  m.background = { scripts: ["background.js"] };
  m.browser_specific_settings = {
    gecko: {
      id: FIREFOX_ID,
      strict_min_version: "140.0",
      data_collection_permissions: { required: ["none"] }
    },
    // Firefox for Android only reads the data statement from 142 on.
    gecko_android: { strict_min_version: "142.0" }
  };
  return m;
}

function build(name, manifest) {
  const dir = mkdtempSync(join(tmpdir(), "headercheck-"));
  try {
    for (const f of FILES) cpSync(join(ROOT, f), join(dir, f), { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    const out = join(ROOT, "dist", name);
    rmSync(out, { force: true });
    execFileSync("zip", ["-q", "-r", "-X", out, ...FILES], { cwd: dir });
    console.log("dist/" + name);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chrome = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  mkdirSync(join(ROOT, "dist"), { recursive: true });
  build(`headercheck-${chrome.version}-chrome.zip`, chrome);
  build(`headercheck-${chrome.version}-firefox.zip`, firefoxManifest(chrome));
}
