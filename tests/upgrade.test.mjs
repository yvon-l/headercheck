// The upgrade from 0.3.0: old header data on disk is deleted, and old history
// moves to the new keys without query strings. Runs against mocked chrome APIs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXT } from "./helpers.mjs";

test("upgrading from 0.3.0 cleans up old data", async () => {
  const store = { local: {}, session: {} };
  const area = n => ({
    get: async k => k === null ? { ...store[n] }
      : Object.fromEntries((Array.isArray(k) ? k : [k]).filter(x => x in store[n]).map(x => [x, store[n][x]])),
    set: async o => { Object.assign(store[n], o); },
    remove: async k => { (Array.isArray(k) ? k : [k]).forEach(x => delete store[n][x]); },
  });
  let onInstalled;
  globalThis.chrome = {
    storage: { local: area("local"), session: area("session") },
    runtime: { id: "x", onInstalled: { addListener: f => { onInstalled = f; } }, onMessage: { addListener: () => {} } },
    webRequest: { onHeadersReceived: { addListener: () => {} } },
    tabs: { onRemoved: { addListener: () => {} } },
  };
  store.local = {
    tab_111: { url: "https://old.example/", headers: { "set-cookie": "sid=SECRET" } },
    yl_theme: "light",
    yl_history: [{ url: "https://shop.example/reset?token=SECRET#x", ts: 1, scoreInfo: { percent: 50 } }],
  };

  await import(join(EXT, "background.js"));
  await onInstalled({ reason: "update" });

  // Pull historyUrl and migrateKeys out of popup.js and run them.
  const src = readFileSync(join(EXT, "popup.js"), "utf8");
  const grab = name => {
    const i = src.indexOf("function " + name);
    let depth = 0;
    for (let k = src.indexOf("{", i); k < src.length; k++) {
      if (src[k] === "{") depth++;
      if (src[k] === "}" && --depth === 0) return src.slice(src.lastIndexOf("\n", i) + 1, k + 1);
    }
  };
  const migrate = new Function(`${grab("historyUrl")}\n${grab("migrateKeys")}\nreturn migrateKeys;`)();
  await migrate();

  assert.deepEqual(Object.keys(store.local).sort(), ["hc_history", "hc_theme"]);
  assert.equal(store.local.hc_theme, "light");
  assert.equal(store.local.hc_history[0].url, "https://shop.example/reset");
});
