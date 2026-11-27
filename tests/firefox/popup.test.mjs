// End-to-end tests in real Firefox: the Firefox build, a local server with
// known headers. Needs Firefox and geckodriver (GitHub's Ubuntu runners have
// both); skipped where Firefox isn't installed.
//
//   npm run test:firefox
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { startServer, EXT } from "../helpers.mjs";
import { FIREFOX_ID } from "../../scripts/package.mjs";

function which(cmd) {
  try { return execFileSync("which", [cmd], { encoding: "utf8" }).trim() || null; } catch { return null; }
}

const FIREFOX = process.env.FIREFOX_BIN || which("firefox");
const GECKODRIVER = process.env.GECKOWEBDRIVER ? join(process.env.GECKOWEBDRIVER, "geckodriver") : which("geckodriver");
const skip = !FIREFOX || !GECKODRIVER ? "Firefox or geckodriver not installed" : false;

const UUID = "4e1c5a0e-6b1f-4d8a-9c55-2f6a1b7d3e90";
const POPUP = `moz-extension://${UUID}/popup.html`;
const version = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).version;
const XPI = join(EXT, "dist", `headercheck-${version}-firefox.zip`);

let srv, driver, webTab, helperTab;
const pause = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  if (skip) return;
  execFileSync("node", [join(EXT, "scripts", "package.mjs")]);
  assert.ok(existsSync(XPI));
  srv = await startServer();
  const options = new firefox.Options()
    .setBinary(FIREFOX)
    .addArguments("-headless")
    // A fixed internal ID, so the tests know the extension's page addresses.
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [FIREFOX_ID]: UUID }));
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(new firefox.ServiceBuilder(GECKODRIVER).addArguments("--allow-system-access"))
    .build();
  await driver.installAddon(XPI, true);
  await pause(1000);
  webTab = await driver.getWindowHandle();
  // An extension page that stays open, used to talk to the extension.
  const before = new Set(await driver.getAllWindowHandles());
  await openExtensionTab(POPUP);
  await pause(1000);
  helperTab = (await driver.getAllWindowHandles()).find(h => !before.has(h));
  assert.ok(helperTab, "extension page opened");
  await driver.switchTo().window(webTab);
});

after(async () => {
  await driver?.quit();
  srv?.server.close();
});

async function goto(path) {
  await driver.switchTo().window(webTab);
  await driver.get(srv.base + path);
  await pause(300);
}

async function inHelper(fn, ...args) {
  await driver.switchTo().window(helperTab);
  const out = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     (${fn}).apply(null, Array.from(arguments).slice(0, -1)).then(done, e => done({ error: String(e) }));`,
    ...args);
  await driver.switchTo().window(webTab);
  return out;
}

// Open an extension page in a background tab. geckodriver won't navigate to
// extension pages itself, and switching to a tab would make it the active one,
// so the browser opens it without selecting it.
async function openExtensionTab(url) {
  driver.setContext(firefox.Context.CHROME);
  try {
    await driver.executeScript(`gBrowser.addTab(arguments[0], {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() })`, url);
  } finally {
    driver.setContext(firefox.Context.CONTENT);
  }
}

// Open the real popup with the test page as the active tab, let it scan, then
// read what it shows from the helper page.
async function openPopup() {
  await driver.switchTo().window(webTab);
  await openExtensionTab(POPUP);
  await pause(1500);
  return inHelper(() => {
    const view = chrome.extension.getViews({ type: "tab" })
      .find(w => w !== window && w.location.pathname === "/popup.html");
    if (!view) return Promise.resolve({ error: "popup not found" });
    const d = view.document;
    const r = {
      grade: d.querySelector("#gradeChip").textContent,
      score: d.querySelector("#scorePct").textContent,
      passing: d.querySelector("#scoreCount").textContent,
      url: d.querySelector("#currentUrl").textContent,
      status: d.querySelector("#statusMsg").textContent,
      version: d.querySelector("#aboutVersion").textContent,
      grantShown: !d.querySelector("#grantBtn").classList.contains("hidden"),
      rows: Object.fromEntries([...d.querySelectorAll(".header-row-item")].map(e => [
        e.querySelector(".header-name").textContent,
        e.querySelector(".header-status-pill").textContent,
      ])),
    };
    view.close();
    return Promise.resolve(r);
  });
}

test("all six headers set correctly grade A in Firefox", { skip }, async () => {
  await goto("/good");
  const r = await openPopup();
  assert.equal(r.grade, "A");
  assert.equal(r.score, "100%");
  assert.equal(r.passing, "6");
  assert.equal(r.version, "v" + version);
  assert.equal(r.grantShown, false);
});

test("cookie headers are never stored in Firefox", { skip }, async () => {
  await goto("/good");
  const stored = await inHelper(() => chrome.storage.session.get(null));
  assert.ok(JSON.stringify(stored).includes("content-security-policy"));
  assert.ok(!JSON.stringify(stored).includes("SECRET123"));
});

test("weak values fail in Firefox", { skip }, async () => {
  await goto("/weak");
  const r = await openPopup();
  assert.equal(r.rows["Strict-Transport-Security"], "Weak");
  assert.equal(r.grade, "F");
});

test("a tab with nothing captured is re-requested and graded in Firefox", { skip }, async () => {
  await goto("/good");
  await inHelper(() => chrome.storage.session.clear().then(() => true));
  const r = await openPopup();
  assert.equal(r.grade, "A");
});

// Last, since access can't be given back without a click from a person.
test("without access to websites, the popup asks for it", { skip }, async () => {
  const removed = await inHelper(() => chrome.permissions.remove({ origins: ["<all_urls>"] }));
  assert.equal(removed, true);
  await goto("/good");
  const r = await openPopup();
  assert.equal(r.grantShown, true);
  assert.match(r.status, /needs access to websites/);
  assert.equal(r.grade, "–");
});
