let selectedCookieKey = null;

function normalizeDomain(input) {
  return (input || "").trim().toLowerCase().replace(/^\./, "");
}

function cookieKey(cookie) {
  return `${cookie.domain}|${cookie.name}|${cookie.path}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExpiry(cookie) {
  if (cookie.session || !cookie.expirationDate) return "Session cookie (deleted when browser closes)";
  return new Date(cookie.expirationDate * 1000).toISOString();
}

function badgeClassForRisk(risk) {
  if (risk === "high") return "risk-high";
  if (risk === "medium") return "risk-medium";
  return "risk-low";
}

function joinList(items, fallback) {
  if (!items || !items.length) return fallback;
  return items.join(", ");
}

function summarizeBasics(cookie) {
  const analysis = cookie.analysis || {};
  return {
    category: analysis.category || "unknown",
    privacyRisk: analysis.privacyRisk || "unknown",
    purpose: analysis.purpose || "Purpose not yet determined",
    recommendation: analysis.recommendations || "Review manually",
    thirdPartyAccess: Boolean(analysis.thirdPartyAccess),
    lifespan: analysis.lifespan || "Unknown",
    encoding: analysis.encoding || "plain",
    contains: analysis.contains || [],
    suspiciousFlags: analysis.suspiciousFlags || [],
    explanation: analysis.explanation || "",
    knownPattern: analysis.knownPattern || null,
    decodedPreview: analysis.decodedPreview || "",
    decodedJson: analysis.decodedJson || null,
    decodingSteps: analysis.decodingSteps || [],
    binaryFragments: analysis.binaryFragments || []
  };
}

async function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function renderCookieDetails(cookie) {
  const target = document.getElementById("cookieDetail");
  if (!cookie) {
    target.textContent = "Select a cookie above to see details.";
    return;
  }

  const summary = summarizeBasics(cookie);
  const exactValue = cookie.value === "" ? "(empty string)" : cookie.value;
  const expiry = formatExpiry(cookie);
  const contains = joinList(summary.contains, "No clear fields extracted from current value");
  const suspicious = joinList(summary.suspiciousFlags, "None");
  const inferredCategories = joinList(cookie.inferredCategories || [], "none");
  const steps = summary.decodingSteps.length ? summary.decodingSteps.join(" -> ") : "plain";
  const decodedJson = summary.decodedJson ? escapeHtml(JSON.stringify(summary.decodedJson, null, 2)) : "";
  const binaryFragments = summary.binaryFragments.length ? summary.binaryFragments.join(", ") : "none";

  target.innerHTML = `
    <h3 class="detail-title">${escapeHtml(cookie.name)}</h3>
    <div class="detail-block">
      <span class="detail-key">Simple explanation:</span>
      <div>${escapeHtml(summary.explanation || summary.purpose)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-key">Classification:</span>
      <div>Category: <strong>${escapeHtml(summary.category)}</strong></div>
      <div>Privacy risk: <span class="risk-chip ${badgeClassForRisk(summary.privacyRisk)}">${escapeHtml(summary.privacyRisk)}</span></div>
      <div>${summary.thirdPartyAccess ? "Third-party access possible" : "First-party only access (same site)"}</div>
      <div>Lifespan: ${escapeHtml(summary.lifespan)}</div>
      <div>Likely purpose: ${escapeHtml(summary.purpose)}</div>
      <div>Recommendation: ${escapeHtml(summary.recommendation)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-key">What data it may contain:</span>
      <div>${escapeHtml(contains)}</div>
      <div class="small">Heuristic tags: ${escapeHtml(inferredCategories)}</div>
      <div class="small">Known pattern: ${escapeHtml(summary.knownPattern || "no exact database match")}</div>
      <div class="small">Suspicious flags: ${escapeHtml(suspicious)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-key">Decoding analysis:</span>
      <div>Encoding chain: ${escapeHtml(summary.encoding)}</div>
      <div class="small">Steps: ${escapeHtml(steps)}</div>
      <div class="small">Decoded preview:</div>
      <pre class="decoded-box">${escapeHtml(summary.decodedPreview || "(no decoded preview)")}</pre>
      ${decodedJson ? `<div class="small">Decoded JSON:</div><pre class="decoded-box">${decodedJson}</pre>` : ""}
      <div class="small">Readable binary fragments: ${escapeHtml(binaryFragments)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-key">Exact cookie captured:</span>
      <div class="small">Name: ${escapeHtml(cookie.name)}</div>
      <div class="small">Value: <code>${escapeHtml(exactValue)}</code></div>
      <div class="small">Domain: ${escapeHtml(cookie.domain)}</div>
      <div class="small">Path: ${escapeHtml(cookie.path)}</div>
      <div class="small">Expires: ${escapeHtml(expiry)}</div>
      <div class="small">Secure: ${escapeHtml(String(cookie.secure))} | HttpOnly: ${escapeHtml(String(cookie.httpOnly))} | SameSite: ${escapeHtml(cookie.sameSite || "unspecified")}</div>
      <div class="small">HostOnly: ${escapeHtml(String(cookie.hostOnly))} | StoreId: ${escapeHtml(cookie.storeId || "n/a")}</div>
    </div>
  `;
}

function renderCookies(cookies) {
  const table = document.getElementById("cookieTable");
  table.innerHTML = "";
  if (!cookies.length) {
    table.innerHTML = `<div class="table-row small">No cookies currently visible for this site.</div>`;
    renderCookieDetails(null);
    selectedCookieKey = null;
    return;
  }

  const selectedExists = cookies.some((cookie) => cookieKey(cookie) === selectedCookieKey);
  if (selectedCookieKey && !selectedExists) {
    selectedCookieKey = null;
  }

  for (const cookie of cookies) {
    const summary = summarizeBasics(cookie);
    const key = cookieKey(cookie);
    const row = document.createElement("div");
    row.className = `table-row${selectedCookieKey === key ? " active" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(cookie.name)}</strong>
      <div class="small">Category: ${escapeHtml(summary.category)} | Risk: <span class="risk-chip ${badgeClassForRisk(summary.privacyRisk)}">${escapeHtml(summary.privacyRisk)}</span></div>
      <div class="small">Domain: ${escapeHtml(cookie.domain)} | ${summary.thirdPartyAccess ? "Third-party" : "First-party"}</div>
      <div class="small">Purpose: ${escapeHtml(summary.purpose)}</div>
    `;
    row.addEventListener("click", () => {
      selectedCookieKey = key;
      renderCookies(cookies);
      renderCookieDetails(cookie);
    });
    table.appendChild(row);
  }

  if (!selectedCookieKey) {
    renderCookieDetails(null);
  } else {
    const selectedCookie = cookies.find((cookie) => cookieKey(cookie) === selectedCookieKey);
    renderCookieDetails(selectedCookie || null);
  }
}

function renderEvents(events) {
  const list = document.getElementById("eventList");
  list.innerHTML = "";
  if (!events.length) {
    list.innerHTML = `<div class="event-row small">No logged events for this site yet.</div>`;
    return;
  }

  for (const event of events.slice(0, 30)) {
    const row = document.createElement("div");
    row.className = "event-row";
    if (event.type === "cookie_rule_block") {
      row.innerHTML = `
        <strong>Blocked cookie traffic</strong>
        <div class="small">Time: ${escapeHtml(event.ts)}</div>
        <div class="small">Rule: ${escapeHtml(String(event.ruleId))} | Resource: ${escapeHtml(event.resourceType || "unknown")}</div>
        <div class="small">URL: ${escapeHtml(event.url || "n/a")}</div>
      `;
    } else {
      row.innerHTML = `
        <strong>Cookie changed: ${escapeHtml(event.name)}</strong>
        <div class="small">Time: ${escapeHtml(event.ts)}</div>
        <div class="small">Cause: ${escapeHtml(event.cause)} | Removed: ${escapeHtml(String(event.removed))}</div>
        <div class="small">Analysis: ${escapeHtml(event.analysisCategory || "n/a")} | Risk: ${escapeHtml(event.analysisRisk || "n/a")}</div>
      `;
    }
    list.appendChild(row);
  }
}

function renderAllowlist(settings) {
  const text = document.getElementById("allowListText");
  const list = settings.allowlist || [];
  text.textContent = list.length ? `Allowlist: ${list.join(", ")}` : "Allowlist: (empty)";
}

function updateModeHint(mode) {
  const hint = document.getElementById("modeHint");
  if (mode === "off") {
    hint.textContent = "Blocking disabled. Monitoring only.";
  } else if (mode === "thirdParty") {
    hint.textContent = "Blocks third-party Cookie and Set-Cookie headers.";
  } else {
    hint.textContent = "Blocks all Cookie and Set-Cookie headers unless allowlisted.";
  }
}

async function loadReport() {
  const tab = await getActiveTab();
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    document.getElementById("hostValue").textContent = "Open a http/https page first.";
    renderCookieDetails(null);
    return;
  }

  const result = await sendMessage({ type: "getReportForTab", tabUrl: tab.url });
  if (!result.ok) {
    document.getElementById("hostValue").textContent = `Error: ${result.error}`;
    renderCookieDetails(null);
    return;
  }

  const host = result.host;
  document.getElementById("hostValue").textContent = host || "(unknown host)";
  document.getElementById("cookieCount").textContent = String(result.summary.cookieCount);
  document.getElementById("changeCount").textContent = String(result.summary.cookieChanges);
  document.getElementById("blockedCount").textContent = String(result.summary.blockedAttempts);

  const modeSelect = document.getElementById("mode");
  modeSelect.value = result.settings.blockMode;
  updateModeHint(result.settings.blockMode);
  renderAllowlist(result.settings);
  renderCookies(result.cookies);
  renderEvents(result.events);

  const allowBtn = document.getElementById("toggleSiteAllow");
  const isAllowlisted = (result.settings.allowlist || []).includes(normalizeDomain(host));
  allowBtn.textContent = isAllowlisted ? "Remove site from allowlist" : "Add site to allowlist";
}

async function getSettings() {
  const result = await sendMessage({ type: "getSettings" });
  if (!result.ok) {
    throw new Error(result.error || "Failed to load settings");
  }
  return result.settings;
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...patch,
    allowlist: [...new Set((patch.allowlist || current.allowlist || []).map(normalizeDomain).filter(Boolean))]
  };
  const result = await sendMessage({ type: "setSettings", payload: next });
  if (!result.ok) {
    throw new Error(result.error || "Failed to save settings");
  }
}

document.getElementById("mode").addEventListener("change", async (event) => {
  const mode = event.target.value;
  await saveSettings({ blockMode: mode });
  updateModeHint(mode);
  await loadReport();
});

document.getElementById("addAllowDomain").addEventListener("click", async () => {
  const input = document.getElementById("allowDomain");
  const domain = normalizeDomain(input.value);
  if (!domain) return;

  const settings = await getSettings();
  settings.allowlist = [...new Set([...(settings.allowlist || []), domain])];
  await saveSettings(settings);
  input.value = "";
  await loadReport();
});

document.getElementById("toggleSiteAllow").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  const host = normalizeDomain(new URL(tab.url).hostname);

  const settings = await getSettings();
  const allow = new Set(settings.allowlist || []);
  if (allow.has(host)) {
    allow.delete(host);
  } else {
    allow.add(host);
  }

  await saveSettings({ allowlist: [...allow] });
  await loadReport();
});

document.getElementById("clearLog").addEventListener("click", async () => {
  await sendMessage({ type: "clearLog" });
  selectedCookieKey = null;
  await loadReport();
});

document.getElementById("refresh").addEventListener("click", async () => {
  await loadReport();
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadReport().catch((error) => {
  document.getElementById("hostValue").textContent = `Error: ${error.message}`;
  renderCookieDetails(null);
});
