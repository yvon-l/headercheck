// HeaderCheck · popup.js (weighted %, letter grade, pro report, history)
// Works with current HTML; gracefully no-ops if some elements are missing.

// =========================
// Constants
// =========================
const HC_HISTORY_KEY = "hc_history";
const HC_MAX_HISTORY = 10;

// Carry history and theme over from the old storage key names (0.3.0 and earlier).
async function migrateKeys() {
  const old = await chrome.storage.local.get(["yl_history", "yl_theme"]);
  const next = {};
  if (old.yl_history) next.hc_history = old.yl_history;
  if (old.yl_theme) next.hc_theme = old.yl_theme;
  if (Object.keys(next).length) await chrome.storage.local.set(next);
  await chrome.storage.local.remove(["yl_history", "yl_theme"]);

  // Older versions saved full addresses in history. Strip query strings and fragments.
  const { hc_history } = await chrome.storage.local.get("hc_history");
  if (Array.isArray(hc_history)) {
    const cleaned = hc_history.map(e => ({ ...e, url: historyUrl(e.url) }));
    await chrome.storage.local.set({ hc_history: cleaned });
  }
}

// =========================
/* Theme */
// =========================
const bodyEl = document.body;
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIconSpan = document.getElementById("themeIcon");
const themeLabelSpan = document.getElementById("themeLabel");

async function loadTheme() {
  await migrateKeys();
  const stored = await chrome.storage.local.get(["hc_theme"]);
  const mode = stored.hc_theme || "dark";
  if (mode === "light") {
    bodyEl.classList.add("theme-light");
    if (themeIconSpan) themeIconSpan.textContent = "🌙";
    if (themeLabelSpan) themeLabelSpan.textContent = "Dark";
  } else {
    bodyEl.classList.remove("theme-light");
    if (themeIconSpan) themeIconSpan.textContent = "☀";
    if (themeLabelSpan) themeLabelSpan.textContent = "Light";
  }
}

async function toggleTheme() {
  const isLight = bodyEl.classList.contains("theme-light");
  const next = isLight ? "dark" : "light";
  if (next === "light") {
    bodyEl.classList.add("theme-light");
    if (themeIconSpan) themeIconSpan.textContent = "🌙";
    if (themeLabelSpan) themeLabelSpan.textContent = "Dark";
  } else {
    bodyEl.classList.remove("theme-light");
    if (themeIconSpan) themeIconSpan.textContent = "☀";
    if (themeLabelSpan) themeLabelSpan.textContent = "Light";
  }
  await chrome.storage.local.set({ hc_theme: next });
}

themeToggleBtn?.addEventListener("click", toggleTheme);

// =========================
/* External links */
// =========================
document.getElementById("bugBtn")?.addEventListener("click", () =>
  chrome.tabs.create({ url: "https://github.com/yvon-l/headercheck/issues" })
);
document.getElementById("siteBtn")?.addEventListener("click", () =>
  chrome.tabs.create({ url: "https://kimberly-wood.com/tools/" })
);

// =========================
// Header rules with weights and descriptions
//   severity: "bad" (critical) or "warn" (recommended)
//   graded: true  -> counts for score and grade
//           false -> informational only
// =========================
// =========================
// Header validation (scoring model SCM-2026.1)
// =========================
function cspDirectives(csp) {
  return String(csp || "")
    .split(/[;,]/) // ";" separates directives, "," separates repeated policies
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
    .map(d => d.split(/\s+/)[0]);
}

function hstsValid(v) {
  const m = /max-age\s*=\s*"?(\d+)"?/i.exec(String(v || ""));
  return !!m && Number(m[1]) > 0;
}

function xfoValid(v) {
  const t = String(v || "").trim().toLowerCase();
  return t === "deny" || t === "sameorigin";
}

function referrerValid(v) {
  // Browsers use the last policy they recognise in a comma-separated list.
  const tokens = String(v || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return false;
  const last = tokens[tokens.length - 1];
  return last !== "unsafe-url" && last !== "no-referrer-when-downgrade";
}

const REQUIRED_HEADERS = [
  // 1. Core, heavily weighted and graded
  {
    name: "content-security-policy",
    label: "Content-Security-Policy",
    desc: "Mitigates XSS and injection by restricting which resources can load.",
    check: v => !!String(v || "").trim(),
    // Passes on presence, but say so when the policy can't stop injected scripts.
    note: v => {
      const d = cspDirectives(v);
      return d.includes("script-src") || d.includes("default-src")
        ? null
        : "Present, but it doesn't restrict scripts (no script-src or default-src).";
    },
    severityIfMissing: "bad",
    weight: 4,
    graded: true
  },
  {
    name: "strict-transport-security",
    label: "Strict-Transport-Security",
    desc: "Forces HTTPS; protects against downgrade or mitm after first visit.",
    check: v => hstsValid(v),
    severityIfMissing: "bad",
    weight: 4,
    graded: true
  },
  {
    name: "x-frame-options",
    label: "X-Frame-Options / frame-ancestors",
    desc: "Mitigates clickjacking by controlling iframing or embedding.",
    check: (v, headers) =>
      xfoValid(v) || cspDirectives(headers["content-security-policy"]).includes("frame-ancestors"),
    severityIfMissing: "warn",
    weight: 3,
    graded: true
  },

  // 2. Other graded headers
  {
    name: "x-content-type-options",
    label: "X-Content-Type-Options",
    desc: "Prevents MIME sniffing; avoids executing untrusted files as scripts.",
    check: v => String(v || "").trim().toLowerCase() === "nosniff",
    severityIfMissing: "warn",
    weight: 1,
    graded: true
  },
  {
    name: "referrer-policy",
    label: "Referrer-Policy",
    desc: "Reduces referrer leakage when navigating across sites.",
    check: v => referrerValid(v),
    severityIfMissing: "warn",
    weight: 1,
    graded: true
  },
  {
    name: "permissions-policy",
    label: "Permissions-Policy",
    desc: "Controls access to powerful APIs like camera, mic, or geo.",
    check: v => !!String(v || "").trim(),
    severityIfMissing: "warn",
    weight: 1,
    graded: true
  },

  // 3. Informational only (not scored)
  {
    name: "cross-origin-opener-policy",
    label: "Cross-Origin-Opener-Policy",
    desc: "Prevents cross-window data leaks by isolating browsing contexts.",
    check: v => !!v,
    severityIfMissing: "warn",
    weight: 0,
    graded: false
  },
  {
    name: "cross-origin-resource-policy",
    label: "Cross-Origin-Resource-Policy",
    desc: "Blocks other origins from loading your resources unless allowed.",
    check: v => !!v,
    severityIfMissing: "warn",
    weight: 0,
    graded: false
  },
  {
    name: "cross-origin-embedder-policy",
    label: "Cross-Origin-Embedder-Policy",
    desc: "Establishes cross-origin isolation for SharedArrayBuffer and similar APIs.",
    check: v => !!v,
    severityIfMissing: "warn",
    weight: 0,
    graded: false
  }
];

// =========================
// DOM
// =========================
const currentUrlEl   = document.getElementById("currentUrl");
const pageScanTimeEl = document.getElementById("pageScanTime");

const resultsEl      = document.getElementById("results");
const scanBtn        = document.getElementById("scanBtn");

const copyCurlBtn    = document.getElementById("copyCurlBtn");
const copyReportBtn  = document.getElementById("copyReportBtn");

const scoreCountEl   = document.getElementById("scoreCount");
const scoreTotalEl   = document.getElementById("scoreTotal");
const scorePctEl     = document.getElementById("scorePct");
const gradeChipEl    = document.getElementById("gradeChip");

const statusMsgEl    = document.getElementById("statusMsg");

const historyListEl  = document.getElementById("historyList");
const historyEmptyEl = document.getElementById("historyEmpty");
const clearHistoryBtn= document.getElementById("clearHistoryBtn");

let lastUrl = "";
let lastCurl = "";
let lastHeadersMap = {};
let lastScoreInfo = null;
let statusClearTimer = null;

// =========================
// UI helpers
// =========================
function classifyStatus(ok, sev, graded, present) {
  // This only controls styling, not scoring
  if (ok) {
    return { cls: "ok", text: "OK" };
  }

  // Sent, but with a value that doesn't protect anything (e.g. max-age=0)
  if (present) {
    return { cls: "weak", text: "Weak" };
  }

  // Informational headers: softer style but still "Missing"
  if (graded === false) {
    return { cls: "weak", text: "Missing" };
  }

  // Graded headers
  return {
    cls: sev === "bad" ? "missing" : "weak",
    text: "Missing"
  };
}

function renderHeaders(map) {
  resultsEl.innerHTML = "";
  REQUIRED_HEADERS.forEach(h => {
    const ok = h.check(map[h.name], map);
    const graded = h.graded === false ? false : true;
    const s = classifyStatus(ok, h.severityIfMissing, graded, map[h.name] !== undefined);

    const row = document.createElement("div");
    row.className = "header-row-item";

    const left = document.createElement("div");
    left.className = "header-info";

    const t = document.createElement("div");
    t.className = "header-name";
    t.textContent = h.label;

    const d = document.createElement("div");
    d.className = "header-desc";
    d.textContent = h.desc + (graded ? "" : " (informational; not scored)");

    left.appendChild(t);
    left.appendChild(d);

    const note = ok && h.note ? h.note(map[h.name]) : null;
    if (note) {
      const n = document.createElement("div");
      n.className = "header-note";
      n.textContent = note;
      left.appendChild(n);
    }

    const pill = document.createElement("div");
    pill.className = `header-status-pill ${s.cls}`;
    pill.textContent = s.text;

    row.appendChild(left);
    row.appendChild(pill);
    resultsEl.appendChild(row);
  });
}

// Weighted score with critical override.
// Only headers with graded: true affect count and percentage.
function computeWeightedScore(map) {
  let okCount = 0;
  let badMissing = 0;
  let warnMissing = 0;

  let sumWeights = 0;
  let sumOkWeights = 0;
  let gradedCount = 0;

  REQUIRED_HEADERS.forEach(h => {
    const graded = h.graded === false ? false : true;
    const pass = h.check(map[h.name], map);

    if (graded) {
      gradedCount++;
      const w = typeof h.weight === "number" ? h.weight : 1;
      sumWeights += w;

      if (pass) {
        okCount++;
        sumOkWeights += w;
      } else {
        if (h.severityIfMissing === "bad") badMissing++;
        else warnMissing++;
      }
    }
  });

  const percent =
    sumWeights > 0 ? Math.round((sumOkWeights / sumWeights) * 100) : 0;

  return {
    okCount,
    totalCount: gradedCount,
    percent,
    badMissing,
    warnMissing,
  };
}

function gradeFor(percent, badMissing) {
  if (badMissing >= 2) return "F";
  const grade =
    percent >= 85 ? "A" :
    percent >= 70 ? "B" :
    percent >= 55 ? "C" :
    percent >= 40 ? "D" : "F";
  // One critical header failing caps the grade at D. It never raises an F.
  if (badMissing === 1 && grade !== "F") return "D";
  return grade;
}

function gradeClass(grade) {
  return grade === "A" ? "grade-A" :
         grade === "B" ? "grade-B" :
         grade === "C" ? "grade-C" :
         grade === "D" ? "grade-D" : "grade-F";
}

function renderRisk(scoreInfo) {
  lastScoreInfo = scoreInfo;

  if (scoreCountEl) scoreCountEl.textContent = String(scoreInfo.okCount);
  if (scoreTotalEl) scoreTotalEl.textContent = String(scoreInfo.totalCount);

  const grade = gradeFor(scoreInfo.percent, scoreInfo.badMissing);
  if (scorePctEl)  scorePctEl.textContent = `${scoreInfo.percent}%`;
  if (gradeChipEl) {
    gradeChipEl.textContent = grade;
    gradeChipEl.className = `grade-chip ${gradeClass(grade)}`;
  }

}

function shellQuote(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

function buildCurl(url) {
  return `curl -sI ${shellQuote(url)}`;
}

// Escape characters that would let a URL change the Markdown around it.
function mdEscape(str) {
  return String(str).replace(/[\\`*_[\]<>|]/g, ch => "\\" + ch);
}

// =========================
// Report (copied as formatted HTML for Docs, Word and email, plus Markdown text)
// =========================
function htmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function shorten(str, max = 140) {
  const s = String(str).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function reportRows(map) {
  return REQUIRED_HEADERS.map(h => {
    const value = map[h.name];
    const present = value !== undefined;
    const graded = h.graded !== false;
    const ok = h.check(value, map);
    const note = ok && h.note ? h.note(value) : null;
    const result = ok ? (note ? "OK, with a note" : "OK") : present ? "Weak" : "Missing";
    return {
      label: h.label,
      result: graded ? result : `${result} (not scored)`,
      tone: !graded ? "info" : ok ? (note ? "warn" : "ok") : (h.severityIfMissing === "bad" ? "bad" : "warn"),
      note,
      value: present ? shorten(value) : "",
      why: note ? `${h.desc} ${note}` : h.desc
    };
  });
}

function buildReport(url, map, scoreInfo) {
  const when = new Date().toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const grade = gradeFor(scoreInfo.percent, scoreInfo.badMissing);
  // Reports get shared, so leave out query strings, which can hold tokens.
  url = historyUrl(url) || url;
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep url */ }
  const rows = reportRows(map);
  const repo = "https://github.com/yvon-l/headercheck";

  // Plain text / Markdown: renders cleanly on GitHub, Slack and in notes apps.
  const cell = v => String(v).replace(/\|/g, "\\|");
  const text = [
    `# Security headers: ${mdEscape(host)}`,
    "",
    `Grade ${grade} · ${scoreInfo.percent}% · ${scoreInfo.okCount} of ${scoreInfo.totalCount} headers pass`,
    "",
    `URL: ${mdEscape(url)}`,
    `Scanned: ${when}`,
    "",
    "| Header | Result | Value |",
    "|---|---|---|",
    ...rows.map(r => `| ${cell(r.label)} | ${cell(r.result)} | ${r.value ? "`" + cell(r.value).replace(/`/g, "'") + "`" : ""} |`),
    "",
    `Weak means the header is sent but its value doesn't protect anything. Made with HeaderCheck: ${repo}`,
    ""
  ].join("\n");

  // Formatted version: inline styles, because Docs and email clients drop stylesheets.
  const colors = { ok: "#1e7a46", warn: "#9a6700", bad: "#b42318", info: "#5a5f6b" };
  const td = "padding:6px 10px;border:1px solid #d9d6cc;vertical-align:top;";
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#16181d;">
  <h2 style="margin:0 0 4px 0;font-size:16pt;">Security headers: ${htmlEscape(host)}</h2>
  <p style="margin:0 0 10px 0;"><b>Grade ${htmlEscape(grade)}</b> · ${scoreInfo.percent}% · ${scoreInfo.okCount} of ${scoreInfo.totalCount} headers pass</p>
  <p style="margin:0 0 12px 0;color:#5a5f6b;">URL: ${htmlEscape(url)}<br>Scanned: ${htmlEscape(when)}</p>
  <table style="border-collapse:collapse;font-size:10pt;">
    <tr style="background:#f4f3ef;">
      <th style="${td}text-align:left;">Header</th>
      <th style="${td}text-align:left;">Result</th>
      <th style="${td}text-align:left;">Value</th>
      <th style="${td}text-align:left;">Why it matters</th>
    </tr>
    ${rows.map(r => `<tr>
      <td style="${td}white-space:nowrap;"><b>${htmlEscape(r.label)}</b></td>
      <td style="${td}white-space:nowrap;color:${colors[r.tone]};"><b>${htmlEscape(r.result)}</b></td>
      <td style="${td}font-family:Consolas,Menlo,monospace;font-size:9pt;">${htmlEscape(r.value)}</td>
      <td style="${td}">${htmlEscape(r.why)}</td>
    </tr>`).join("")}
  </table>
  <p style="margin:10px 0 0 0;font-size:9pt;color:#5a5f6b;">Weak means the header is sent but its value doesn't protect anything. Made with <a href="${repo}">HeaderCheck</a>.</p>
</div>`;

  return { html, text };
}

async function copyReport(report) {
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([report.html], { type: "text/html" }),
        "text/plain": new Blob([report.text], { type: "text/plain" })
      })
    ]);
  } else {
    await navigator.clipboard.writeText(report.text);
  }
}

function showStatus(msg, ms = 3000) {
  if (statusClearTimer) clearTimeout(statusClearTimer);
  statusMsgEl.textContent = msg;
  statusMsgEl.classList.remove("hidden");
  statusClearTimer = setTimeout(() => statusMsgEl.classList.add("hidden"), ms);
}

function flashButton(btn, orig, txt = "Copied") {
  btn.textContent = txt;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = orig;
    btn.disabled = false;
  }, 1200);
}

function setScanning(b) {
  if (b) {
    scanBtn?.classList.add("is-busy");
    if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = "Scanning…"; }
  } else {
    scanBtn?.classList.remove("is-busy");
    if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = "Scan"; }
  }
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    hour: "2-digit", minute: "2-digit",
    year: "numeric", month: "short", day: "numeric"
  });
}

// =========================
// History
// =========================
// History keeps only the origin and path, never query strings or fragments,
// which can hold tokens (password reset links, session IDs and so on).
function historyUrl(url) {
  try { const u = new URL(url); return u.origin + u.pathname; }
  catch { return ""; }
}

async function loadHistory() {
  const s = await chrome.storage.local.get([HC_HISTORY_KEY]);
  return s[HC_HISTORY_KEY] || [];
}

async function saveHistory(arr) {
  await chrome.storage.local.set({ [HC_HISTORY_KEY]: arr });
}

async function appendHistoryEntry(entry) {
  const hist = await loadHistory();
  const next = [entry, ...(hist || [])];
  if (next.length > HC_MAX_HISTORY) next.length = HC_MAX_HISTORY;
  await saveHistory(next);
}

async function clearHistory() {
  await saveHistory([]);
  renderHistory([]);
  showStatus("History cleared");
}

function renderHistory(arr) {
  if (!historyListEl || !historyEmptyEl) return;

  historyListEl.innerHTML = "";
  if (!arr.length) {
    historyEmptyEl.style.display = "block";
    return;
  }
  historyEmptyEl.style.display = "none";

  arr.forEach(item => {
    const { url, ts, scoreInfo } = item;

    const row = document.createElement("div");
    row.className = "history-item";

    const top = document.createElement("div");
    top.className = "history-topline";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";

    const domainEl = document.createElement("div");
    domainEl.className = "history-domain";
    try { domainEl.textContent = new URL(url).hostname; }
    catch { domainEl.textContent = url; }

    const timeEl = document.createElement("div");
    timeEl.className = "history-time";
    timeEl.textContent = formatTimestamp(ts);

    left.appendChild(domainEl);
    left.appendChild(timeEl);

    const pill = document.createElement("div");
    const hGrade = gradeFor(scoreInfo.percent || 0, scoreInfo.badMissing || 0);
    pill.className = `history-risk-pill ${gradeClass(hGrade)}`;
    pill.textContent = `${hGrade} · ${scoreInfo.percent ?? 0}%`;

    top.appendChild(left);
    top.appendChild(pill);
    row.appendChild(top);

    row.addEventListener("click", () => chrome.tabs.create({ url }));
    historyListEl.appendChild(row);
  });
}

// =========================
// Background comms
// =========================
function fetchLatestFromBackground() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "getLatestForActiveTab" }, resp => {
      resolve(resp || { ok: false, error: "scan-failed" });
    });
  });
}

const SCAN_ERRORS = {
  "unsupported-page": "HeaderCheck can only scan http and https pages.",
  "fetch-failed": "Couldn't reach this page to read its headers.",
  "no-active-tab": "No active tab to scan."
};

// =========================
// UI update cycle
// =========================
async function updateUIFromRecord(record) {
  if (!record) {
    const gradedTotal = REQUIRED_HEADERS.filter(h => h.graded !== false).length;
    if (currentUrlEl) currentUrlEl.textContent = "–";
    if (pageScanTimeEl) pageScanTimeEl.textContent = "Last scanned: –";
    lastUrl = "";
    lastCurl = "";
    lastHeadersMap = {};
    lastScoreInfo = null;
    if (resultsEl) resultsEl.innerHTML = "";
    renderRisk({
      okCount: 0,
      totalCount: gradedTotal,
      percent: 0,
      badMissing: 0,
      warnMissing: 0,
    });
    // Nothing was graded, so don't show a grade or score.
    if (gradeChipEl) { gradeChipEl.textContent = "–"; gradeChipEl.className = "grade-chip"; }
    if (scorePctEl) scorePctEl.textContent = "–";
    if (scoreCountEl) scoreCountEl.textContent = "–";
    lastScoreInfo = null;
    renderHistory(await loadHistory());
    return;
  }

  const { url, headers } = record;
  lastUrl = url;
  lastCurl = buildCurl(url);
  lastHeadersMap = headers || {};

  if (currentUrlEl) currentUrlEl.textContent = url || "–";
  renderHeaders(lastHeadersMap);

  const info = computeWeightedScore(lastHeadersMap);
  renderRisk(info);

  const ts = Date.now();
  if (pageScanTimeEl) pageScanTimeEl.textContent =
    `Last scanned: ${formatTimestamp(ts)}`;

  await appendHistoryEntry({ url: historyUrl(url), ts, scoreInfo: info });
  renderHistory(await loadHistory());
}

async function performScan() {
  setScanning(true);
  if (statusMsgEl) {
    statusMsgEl.classList.remove("hidden");
    statusMsgEl.textContent = "Scanning…";
  }
  try {
    await new Promise(r => setTimeout(r, 150));
    const resp = await fetchLatestFromBackground();
    if (!resp.ok || !resp.data) {
      await updateUIFromRecord(null);
      showStatus(SCAN_ERRORS[resp.error] || "Scan failed");
    } else if (resp.data.redirected) {
      // Grading the login or bot-check page would be wrong, so show no grade.
      await updateUIFromRecord(null);
      showStatus("This site sent the check to a different page (often a login or bot check). Reload the page, then scan.", 10000);
    } else {
      await updateUIFromRecord(resp.data);
      showStatus("Scanned just now");
    }
  } catch {
    showStatus("Scan failed");
  } finally {
    setScanning(false);
  }
}

// =========================
/* Events */
// =========================
scanBtn?.addEventListener("click", () => performScan());

copyCurlBtn?.addEventListener("click", async () => {
  if (!lastCurl) { showStatus("Nothing to copy"); return; }
  try {
    await navigator.clipboard.writeText(lastCurl);
    flashButton(copyCurlBtn, "Copy cURL", "Copied");
    showStatus("cURL copied");
  } catch {
    showStatus("Copy failed");
  }
});

copyReportBtn?.addEventListener("click", async () => {
  if (!lastUrl || !lastHeadersMap || !lastScoreInfo) {
    showStatus("Nothing to copy");
    return;
  }
  try {
    await copyReport(buildReport(lastUrl, lastHeadersMap, lastScoreInfo));
    flashButton(copyReportBtn, "Copy report", "Copied");
    showStatus("Report copied");
  } catch {
    showStatus("Copy failed");
  }
});

clearHistoryBtn?.addEventListener("click", async () => {
  await clearHistory();
});

// =========================
// Init
// =========================
(async function init() {
  const versionEl = document.getElementById("aboutVersion");
  if (versionEl) versionEl.textContent = "v" + chrome.runtime.getManifest().version;
  await loadTheme();
  renderHistory(await loadHistory());
  performScan();
})();
