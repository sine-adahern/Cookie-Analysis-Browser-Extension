importScripts(
  "analysis/knowledge-base.js",
  "analysis/decoder.js",
  "analysis/classifier.js",
  "analysis/explainer.js"
);

const SETTINGS_KEY = "settings";
const LOG_KEY = "reportLog";
const MAX_LOG_ENTRIES = 2000;
const RULE_IDS = [1001, 1002, 1101, 1102];

const DEFAULT_SETTINGS = {
  blockMode: "thirdParty",
  allowlist: []
};

const DATA_PATTERNS = [
  { category: "location", regex: /(geo|loc|lat|lon|country|city|region|zip|postal)/i },
  { category: "ip", regex: /(ip|ipv4|ipv6|clientip|remoteaddr)/i },
  { category: "time", regex: /(time|timestamp|tz|timezone|expiry|expires|exp)/i },
  { category: "session", regex: /(sess|session|sid|token|auth|jwt|csrf)/i },
  { category: "tracking", regex: /(track|pixel|ga|gid|fbp|fbc|utm|ad|campaign|uid|visitor|device)/i },
  { category: "preferences", regex: /(pref|theme|lang|locale|consent|settings)/i }
];

function normalizeDomain(input) {
  return (input || "").trim().toLowerCase().replace(/^\./, "");
}

function inferDataCategories(name, value) {
  const source = `${name || ""} ${value || ""}`;
  const found = DATA_PATTERNS.filter((p) => p.regex.test(source)).map((p) => p.category);
  return [...new Set(found)];
}

function analyzeCookie(cookie, tabHost) {
  const known = self.CookieKnowledgeBase.lookup(cookie.name, cookie.domain);
  const decoded = self.CookieDecoder.decode(cookie.value || "");
  const classified = self.CookieClassifier.classify(cookie, {
    tabHost,
    known,
    decoded
  });
  const explanation = self.CookieExplainer.generate(classified, { known });

  return {
    ...classified,
    explanation,
    knownPattern: known?.label || null,
    knowledgeSource: known?.source || null,
    decodingSteps: decoded.steps || [],
    decodedPreview: decoded.preview || "",
    decodedJson: decoded.jsonObject || null,
    binaryFragments: decoded.binaryFragments || []
  };
}

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

async function setSettings(next) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
}

async function getLog() {
  const result = await chrome.storage.local.get(LOG_KEY);
  return result[LOG_KEY] || [];
}

async function appendLog(entry) {
  const log = await getLog();
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    log.splice(0, log.length - MAX_LOG_ENTRIES);
  }
  await chrome.storage.local.set({ [LOG_KEY]: log });
}

function buildRules(settings) {
  const allowlist = (settings.allowlist || []).map(normalizeDomain).filter(Boolean);
  const baseCondition = {
    urlFilter: "|http*",
    resourceTypes: [
      "main_frame",
      "sub_frame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xmlhttprequest",
      "ping",
      "media",
      "other"
    ],
    excludedRequestDomains: allowlist
  };

  if (settings.blockMode === "off") {
    return [];
  }

  if (settings.blockMode === "thirdParty") {
    return [
      {
        id: 1001,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "remove" }]
        },
        condition: {
          ...baseCondition,
          domainType: "thirdParty"
        }
      },
      {
        id: 1002,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [{ header: "Set-Cookie", operation: "remove" }]
        },
        condition: {
          ...baseCondition,
          domainType: "thirdParty"
        }
      }
    ];
  }

  return [
    {
      id: 1101,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "Cookie", operation: "remove" }]
      },
      condition: {
        ...baseCondition
      }
    },
    {
      id: 1102,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [{ header: "Set-Cookie", operation: "remove" }]
      },
      condition: {
        ...baseCondition
      }
    }
  ];
}

async function applyBlockingRules() {
  const settings = await getSettings();
  const addRules = buildRules(settings);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: RULE_IDS,
    addRules
  });
}

async function ensureDefaults() {
  const settings = await getSettings();
  await setSettings(settings);
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function domainMatches(hostname, targetDomain) {
  if (!hostname || !targetDomain) return false;
  return hostname === targetDomain || hostname.endsWith(`.${targetDomain}`);
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await applyBlockingRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await applyBlockingRules();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes[SETTINGS_KEY]) {
    await applyBlockingRules();
  }
});

chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const cookie = changeInfo.cookie;
  const analysis = analyzeCookie(
    {
      name: cookie.name,
      value: cookie.value || "",
      domain: normalizeDomain(cookie.domain),
      path: cookie.path,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate || null,
      session: cookie.session
    },
    normalizeDomain(cookie.domain)
  );

  const entry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    type: "cookie_changed",
    removed: changeInfo.removed,
    cause: changeInfo.cause,
    domain: normalizeDomain(cookie.domain),
    path: cookie.path,
    name: cookie.name,
    value: cookie.value || "",
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate || null,
    inferredCategories: inferDataCategories(cookie.name, cookie.value),
    analysisCategory: analysis.category,
    analysisRisk: analysis.privacyRisk
  };
  await appendLog(entry);
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (event) => {
  const request = event.request || {};
  const entry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    type: "cookie_rule_block",
    ruleId: event.rule?.ruleId || null,
    domain: normalizeDomain(safeHostname(request.url || "")),
    method: request.method || null,
    tabId: typeof request.tabId === "number" ? request.tabId : null,
    resourceType: request.resourceType || null,
    url: request.url || null
  };
  await appendLog(entry);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "getSettings") {
      const settings = await getSettings();
      sendResponse({ ok: true, settings });
      return;
    }

    if (message?.type === "getAnalyzerStats") {
      sendResponse({
        ok: true,
        stats: {
          knowledgeBase: self.CookieKnowledgeBase.stats,
          decoder: {
            supported: ["plain", "url", "base64", "hex", "jwt", "json", "base64-binary/probable-protobuf"]
          },
          classifierCategories: ["functional", "analytics", "advertising", "social", "performance", "unknown"]
        }
      });
      return;
    }

    if (message?.type === "setSettings") {
      const current = await getSettings();
      const next = {
        ...current,
        ...message.payload,
        allowlist: [...new Set((message.payload?.allowlist || current.allowlist || []).map(normalizeDomain).filter(Boolean))]
      };
      await setSettings(next);
      sendResponse({ ok: true, settings: next });
      return;
    }

    if (message?.type === "clearLog") {
      await chrome.storage.local.set({ [LOG_KEY]: [] });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "getReportForTab") {
      const tabUrl = message.tabUrl;
      const tabHost = normalizeDomain(safeHostname(tabUrl));
      const [cookies, log, settings] = await Promise.all([
        chrome.cookies.getAll({ url: tabUrl }),
        getLog(),
        getSettings()
      ]);

      const filteredEvents = log.filter((item) => domainMatches(tabHost, normalizeDomain(item.domain)));
      const summary = {
        cookieCount: cookies.length,
        cookieChanges: filteredEvents.filter((e) => e.type === "cookie_changed").length,
        blockedAttempts: filteredEvents.filter((e) => e.type === "cookie_rule_block").length
      };

      const cookieRows = cookies.map((c) => ({
        domain: normalizeDomain(c.domain),
        name: c.name,
        value: c.value || "",
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        hostOnly: c.hostOnly,
        session: c.session,
        storeId: c.storeId,
        expirationDate: c.expirationDate || null,
        inferredCategories: inferDataCategories(c.name, c.value)
      })).map((cookieItem) => ({
        ...cookieItem,
        analysis: analyzeCookie(cookieItem, tabHost)
      }));

      sendResponse({
        ok: true,
        host: tabHost,
        settings,
        summary,
        cookies: cookieRows,
        events: filteredEvents.slice(-100).reverse()
      });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });

  return true;
});
