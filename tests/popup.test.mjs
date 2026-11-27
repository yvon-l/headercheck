// End-to-end tests: real Chromium, the real extension, a local server with known headers.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, launch, openPopup, EXT } from "./helpers.mjs";

let srv, env;
before(async () => { srv = await startServer(); env = await launch(); });
after(async () => { await env?.ctx.close(); srv?.server.close(); });

const goto = async path => { await env.web.goto(srv.base + path); await env.web.waitForTimeout(300); };
const clearCaptured = () => env.helper.evaluate(() => chrome.storage.session.clear());

test("all six headers set correctly grade A", async () => {
  await goto("/good");
  const r = await openPopup(env);
  assert.equal(r.grade, "A");
  assert.equal(r.score, "100%");
  assert.equal(r.passing, "6");
  const version = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).version;
  assert.equal(r.version, "v" + version);
  await r.pop.close();
});

test("cookie headers are never stored", async () => {
  await goto("/good");
  const stored = await env.helper.evaluate(() => chrome.storage.session.get(null));
  assert.ok(!JSON.stringify(stored).includes("SECRET123"));
});

test("headers with useless values show as Weak and fail", async () => {
  await goto("/weak");
  const r = await openPopup(env);
  for (const h of ["Strict-Transport-Security", "X-Frame-Options / frame-ancestors", "X-Content-Type-Options", "Referrer-Policy"]) {
    assert.equal(r.rows[h].status, "Weak", h);
  }
  assert.equal(r.grade, "F");
  await r.pop.close();
});

test("a CSP that doesn't restrict scripts passes with a note", async () => {
  await goto("/csp-no-scripts");
  const r = await openPopup(env);
  assert.equal(r.rows["Content-Security-Policy"].status, "OK");
  assert.match(r.rows["Content-Security-Policy"].note, /doesn't restrict scripts/);
  assert.equal(r.rows["X-Frame-Options / frame-ancestors"].status, "OK"); // via frame-ancestors
  await r.pop.close();
});

test("a header sent twice is combined", async () => {
  await goto("/dup");
  const r = await openPopup(env);
  assert.equal(r.rows["X-Frame-Options / frame-ancestors"].status, "OK"); // frame-ancestors in the second CSP
  await r.pop.close();
});

test("no headers at all grade F", async () => {
  await goto("/bare");
  const r = await openPopup(env);
  assert.equal(r.grade, "F");
  assert.equal(r.score, "0%");
  await r.pop.close();
});

test("a tab with nothing captured is re-requested and still graded", async () => {
  await goto("/good");
  await clearCaptured();
  const r = await openPopup(env);
  assert.equal(r.grade, "A");
  await r.pop.close();
});

test("a re-request sent to a bot check shows no grade and says why", async () => {
  await env.ctx.addCookies([{ name: "pass", value: "1", url: srv.base }]);
  await goto("/login");
  let r = await openPopup(env);
  assert.equal(r.grade, "A", "the real page load is graded");
  await r.pop.close();

  await clearCaptured(); // the cookie-less re-request lands on /pow
  r = await openPopup(env);
  assert.equal(r.grade, "–");
  assert.match(r.status, /different page/);
  await r.pop.close();
  await env.ctx.clearCookies();
});

test("non-web pages get a clear message", async () => {
  await env.web.goto("about:blank");
  const r = await openPopup(env);
  assert.match(r.status, /only scan http and https/);
  await r.pop.close();
});

test("history keeps no query strings", async () => {
  await goto("/good?token=SECRET");
  const r = await openPopup(env);
  await r.pop.close();
  const { hc_history } = await env.helper.evaluate(() => chrome.storage.local.get("hc_history"));
  assert.ok(!JSON.stringify(hc_history).includes("SECRET"));
});

test("Copy report puts a formatted table and Markdown on the clipboard, without the query string", async () => {
  await goto("/weak?token=SECRET");
  const r = await openPopup(env);
  await r.pop.bringToFront();
  await r.pop.evaluate(() => {
    navigator.clipboard.write = async items => { window.__clip = items; };
  });
  await r.pop.click("#copyReportBtn");
  const clip = await r.pop.evaluate(async () => {
    const it = window.__clip[0];
    return { types: it.types, html: await (await it.getType("text/html")).text(), text: await (await it.getType("text/plain")).text() };
  });
  assert.deepEqual(clip.types, ["text/html", "text/plain"]);
  assert.match(clip.html, /<table/);
  assert.match(clip.text, /\| Header \| Result \| Value \|/);
  assert.ok(!(clip.html + clip.text).includes("SECRET"));
  await r.pop.close();
});

test("Copy report keeps each Markdown row in its cells, even with a backslash before a pipe", async () => {
  await goto("/pipes");
  const r = await openPopup(env);
  await r.pop.bringToFront();
  await r.pop.evaluate(() => { navigator.clipboard.write = async items => { window.__clip = items; }; });
  await r.pop.click("#copyReportBtn");
  const text = await r.pop.evaluate(async () => (await window.__clip[0].getType("text/plain")).text());
  const row = text.split("\n").find(l => l.startsWith("| Content-Security-Policy"));
  assert.ok(row, "CSP row present");
  // Unescaped pipes: a pipe preceded by an even number of backslashes. Four means three cells.
  const cuts = [...row.matchAll(/(\\*)\|/g)].filter(m => m[1].length % 2 === 0).length;
  assert.equal(cuts, 4, row);
  await r.pop.close();
});

test("Copy cURL quotes the address so it can't run commands", async () => {
  await goto("/good?x=$(id)");
  const r = await openPopup(env);
  await r.pop.bringToFront();
  await r.pop.evaluate(() => { navigator.clipboard.writeText = async t => { window.__curl = t; }; });
  await r.pop.click("#copyCurlBtn");
  const curl = await r.pop.evaluate(() => window.__curl);
  assert.match(curl, /^curl -sI '.*\$\(id\).*'$/);
  await r.pop.close();
});
