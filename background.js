// HeaderCheck · background
// Captures response headers for main-frame requests and serves the latest per tab.
//
// Headers live in chrome.storage.session: memory only, cleared when the browser
// closes, and removed as soon as the tab closes. Cookie headers are never kept.
//
// The headers of the real page load are always preferred: they're what the
// browser actually got. Only if nothing was captured for the tab (it was open
// before HeaderCheck started, or came back from the back/forward cache) are the
// headers read by requesting the page again, without cookies. If the site
// redirects that request somewhere else (a login or bot check, say), the result
// is flagged so the popup can say so.

const TAB_PREFIX = "tab_";
const DROP = new Set(["set-cookie", "set-cookie2"]);
const FETCH_TIMEOUT_MS = 10000;

// Versions up to 0.3.0 wrote every page's headers to chrome.storage.local and
// never removed them. Clear those leftovers on install or update.
chrome.runtime.onInstalled.addListener(async () => {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter(k => k.startsWith(TAB_PREFIX));
  if (stale.length) await chrome.storage.local.remove(stale);
});

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.type !== "main_frame") return;

    const tabId = details.tabId;
    if (tabId < 0) return;

    const headersMap = {};
    for (const h of details.responseHeaders || []) {
      const key = h.name.toLowerCase();
      if (DROP.has(key)) continue;
      const val = Array.isArray(h.value) ? h.value.join("; ") : (h.value ?? "");
      // A header sent more than once is combined, as the HTTP spec says to.
      headersMap[key] = key in headersMap ? headersMap[key] + ", " + val : val;
    }

    chrome.storage.session.set({
      [TAB_PREFIX + tabId]: { url: details.url, headers: headersMap, ts: Date.now() }
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(TAB_PREFIX + tabId);
});

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

// Request the page again and read its response headers. No cookies are sent,
// the body is not read, and nothing is sent anywhere except to the site itself.
async function fetchHeaders(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal
    });
    const headers = {};
    res.headers.forEach((value, key) => {
      if (!DROP.has(key.toLowerCase())) headers[key.toLowerCase()] = value;
    });
    try { await res.body?.cancel(); } catch { /* body not needed */ }
    return { url: res.url || url, headers, ts: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

function samePage(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch { return false; }
}

async function getForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { ok: false, error: "no-active-tab" };

  const url = tab.url || "";
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "unsupported-page" };

  const tabKey = TAB_PREFIX + tab.id;
  const stored = (await chrome.storage.session.get(tabKey))[tabKey] || null;
  if (stored && originOf(stored.url) === originOf(url)) return { ok: true, data: stored };

  try {
    const rec = await fetchHeaders(url);
    if (!samePage(rec.url, url)) {
      // Don't keep it: a reload will capture the real page instead.
      return { ok: true, data: { ...rec, redirected: true } };
    }
    await chrome.storage.session.set({ [tabKey]: rec });
    return { ok: true, data: rec };
  } catch {
    return { ok: false, error: "fetch-failed" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg && msg.type === "getLatestForActiveTab") {
    getForActiveTab()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "scan-failed" }));
    return true; // async response
  }
});
