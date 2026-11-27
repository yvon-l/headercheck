// Shared test setup: a local web server with known headers, and Chromium with
// the unpacked extension loaded.
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");

const GOOD = [
  ["Content-Security-Policy", "default-src 'self'"],
  ["Strict-Transport-Security", "max-age=31536000"],
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
  ["Permissions-Policy", "camera=()"],
  ["Set-Cookie", "session=SECRET123; HttpOnly"],
];

export const PAGES = {
  "/good": GOOD,
  "/weak": [
    ["Content-Security-Policy", "default-src 'self'"],
    ["Strict-Transport-Security", "max-age=0"],
    ["X-Frame-Options", "ALLOWALL"],
    ["X-Content-Type-Options", "sniff"],
    ["Referrer-Policy", "unsafe-url"],
    ["Permissions-Policy", "camera=()"],
  ],
  "/csp-no-scripts": [
    ["Content-Security-Policy", "frame-ancestors 'self'; upgrade-insecure-requests"],
    ["Strict-Transport-Security", "max-age=31536000"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=()"],
  ],
  "/dup": [
    ["Content-Security-Policy", "default-src 'self'"],
    ["Content-Security-Policy", "frame-ancestors 'none'"],
    ["Strict-Transport-Security", "max-age=1"],
  ],
  "/bare": [],
};

export function startServer() {
  const server = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    // /login behaves like a site with a bot check: no cookie, no page.
    if (path === "/login" && !(req.headers.cookie || "").includes("pass=1")) {
      res.writeHead(302, { Location: "/pow" });
      return res.end();
    }
    const headers = PAGES[path === "/login" ? "/good" : path] || [];
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    const grouped = {};
    for (const [k, v] of headers) (grouped[k] ||= []).push(v);
    for (const [k, v] of Object.entries(grouped)) res.setHeader(k, v.length > 1 ? v : v[0]);
    res.end("<html><body>test</body></html>");
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () =>
    resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

export async function launch() {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "hc-")), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  const extId = new URL(sw.url()).host;
  // An extension page that stays open, used to talk to the extension.
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${extId}/popup.html`);
  const web = ctx.pages()[0];
  await web.bringToFront();
  return { ctx, extId, helper, web };
}

// Open the real popup for whatever tab is in front, and read what it shows.
export async function openPopup({ ctx, extId, helper, web }) {
  await web.bringToFront();
  const [pop] = await Promise.all([
    ctx.waitForEvent("page"),
    helper.evaluate(id => chrome.tabs.create({ url: `chrome-extension://${id}/popup.html`, active: false }), extId),
  ]);
  await pop.waitForTimeout(1200);
  const rows = await pop.$$eval(".header-row-item", els => Object.fromEntries(els.map(e => [
    e.querySelector(".header-name").textContent,
    { status: e.querySelector(".header-status-pill").textContent, note: e.querySelector(".header-note")?.textContent || null },
  ])));
  return {
    pop,
    rows,
    grade: await pop.textContent("#gradeChip"),
    score: await pop.textContent("#scorePct"),
    passing: await pop.textContent("#scoreCount"),
    url: await pop.textContent("#currentUrl"),
    status: await pop.textContent("#statusMsg"),
    version: await pop.textContent("#aboutVersion"),
  };
}
