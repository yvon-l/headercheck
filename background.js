// HeaderCheck · background
// Captures response headers for main-frame requests and serves the latest per tab.
//
// Headers live in chrome.storage.session: memory only, cleared when the browser
// closes, and removed as soon as the tab closes. Cookie headers are never kept.

const TAB_PREFIX = "tab_";
const DROP = new Set(["set-cookie", "set-cookie2"]);

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
      headersMap[key] = Array.isArray(h.value) ? h.value.join("; ") : h.value;
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "getLatestForActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: "no-active-tab" });
        return;
      }

      const tabKey = TAB_PREFIX + tab.id;
      chrome.storage.session.get(tabKey, data => {
        sendResponse({ ok: true, data: data[tabKey] || null });
      });
    });
    return true; // async response
  }
});
