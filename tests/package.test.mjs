// The Firefox build's manifest: same extension, with what Firefox needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXT } from "./helpers.mjs";
import { firefoxManifest, FIREFOX_ID } from "../scripts/package.mjs";

const chrome = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
const ff = firefoxManifest(chrome);

test("Firefox runs background.js as a background script", () => {
  assert.deepEqual(ff.background, { scripts: ["background.js"] });
  assert.ok(!("minimum_chrome_version" in ff));
});

test("Firefox gets an add-on ID and says no data is collected", () => {
  assert.equal(ff.browser_specific_settings.gecko.id, FIREFOX_ID);
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ["none"] });
});

test("everything else matches the Chrome manifest", () => {
  for (const k of ["name", "description", "version", "manifest_version", "icons", "action", "permissions", "host_permissions"]) {
    assert.deepEqual(ff[k], chrome[k], k);
  }
});

test("the Chrome manifest is left unchanged", () => {
  assert.equal(chrome.background.service_worker, "background.js");
  assert.ok(!("browser_specific_settings" in chrome));
});
