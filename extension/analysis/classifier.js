(() => {
  const CATEGORIES = ["functional", "analytics", "advertising", "social", "performance", "unknown"];

  function normalizeDomain(input) {
    return (input || "").trim().toLowerCase().replace(/^\./, "");
  }

  function domainMatches(hostname, targetDomain) {
    if (!hostname || !targetDomain) return false;
    return hostname === targetDomain || hostname.endsWith(`.${targetDomain}`);
  }

  function summarizeLifespan(expirationDate, isSession) {
    if (isSession || !expirationDate) {
      return { text: "Session", days: 0 };
    }
    const nowSec = Date.now() / 1000;
    const diffDays = Math.max(0, Math.round((expirationDate - nowSec) / 86400));
    if (diffDays < 1) return { text: "Less than 1 day", days: diffDays };
    if (diffDays < 30) return { text: `${diffDays} days`, days: diffDays };
    const months = Math.round(diffDays / 30);
    if (months < 24) return { text: `${months} months`, days: diffDays };
    const years = Math.round(diffDays / 365);
    return { text: `${years} years`, days: diffDays };
  }

  function pushUnique(target, value) {
    if (!value) return;
    if (!target.includes(value)) target.push(value);
  }

  function extractFromText(text, contains, signals) {
    if (!text) return;

    const idMatches = text.match(/\b(?:uid|user_id|userid|visitor|device|client|member|account)[=:._-]*([A-Za-z0-9._-]{4,})\b/gi) || [];
    if (idMatches.length) {
      pushUnique(contains, "User/device identifier");
      signals.ids += idMatches.length;
    }

    const uuidMatch = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
    if (uuidMatch) {
      pushUnique(contains, `UUID: ${uuidMatch[0]}`);
      signals.ids += 1;
    }

    const gaMatch = text.match(/\bGA\d\.\d\.(\d+\.\d+)\b/);
    if (gaMatch) {
      pushUnique(contains, `Google Analytics ID: ${gaMatch[1]}`);
      signals.analytics += 2;
    }

    const abMatch = text.match(/\b(?:ab|a_b|experiment|variant|bucket|group)[=:._-]*([A-Za-z0-9_-]{1,20})\b/i);
    if (abMatch) {
      pushUnique(contains, `A/B test group: ${abMatch[1]}`);
      signals.experiment += 1;
    }

    const languageMatch = text.match(/\b(?:lang|locale)[=:._-]*([a-z]{2}(?:-[A-Z]{2})?)\b/i);
    if (languageMatch) {
      pushUnique(contains, `Language preference: ${languageMatch[1]}`);
      signals.preferences += 1;
    }

    const themeMatch = text.match(/\btheme[=:._-]*([a-z0-9_-]{3,20})\b/i);
    if (themeMatch) {
      pushUnique(contains, `Theme preference: ${themeMatch[1]}`);
      signals.preferences += 1;
    }

    const tzMatch = text.match(/\b(?:timezone|tz)[=:._-]*([A-Za-z_+\-/0-9]{2,40})\b/i);
    if (tzMatch) {
      pushUnique(contains, `Timezone indicator: ${tzMatch[1]}`);
      signals.geo += 1;
    }

    const countryMatch = text.match(/\b(?:country|region)[=:._-]*([A-Z]{2})\b/);
    if (countryMatch) {
      pushUnique(contains, `Country indicator: ${countryMatch[1]}`);
      signals.geo += 1;
    }

    const unixMatch = text.match(/\b(1[6-9]\d{8}|2\d{9})\b/);
    if (unixMatch) {
      const sec = Number(unixMatch[1]);
      const date = new Date(sec * 1000);
      if (!Number.isNaN(date.getTime())) {
        pushUnique(contains, `Timestamp metadata: ${date.toISOString()}`);
        signals.time += 1;
      }
    }

    const msMatch = text.match(/\b(1[6-9]\d{11}|2\d{12})\b/);
    if (msMatch) {
      const ms = Number(msMatch[1]);
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) {
        pushUnique(contains, `Timestamp metadata: ${date.toISOString()}`);
        signals.time += 1;
      }
    }
  }

  function classify(cookie, context) {
    const name = (cookie.name || "").toLowerCase();
    const domain = normalizeDomain(cookie.domain);
    const value = cookie.value || "";
    const tabHost = normalizeDomain(context?.tabHost || "");
    const known = context?.known || null;
    const decoded = context?.decoded || null;

    const scores = {
      functional: 0,
      analytics: 0,
      advertising: 0,
      social: 0,
      performance: 0,
      unknown: 0
    };

    if (known?.category && CATEGORIES.includes(known.category)) {
      scores[known.category] += 5;
    }

    if (/(sess|sid|auth|token|csrf|cart|checkout|consent|pref|lang|locale|theme)/i.test(name)) scores.functional += 2;
    if (/(_ga|_gid|analytics|collect|segment|mixpanel|amplitude|matomo)/i.test(name)) scores.analytics += 3;
    if (/(ad|ads|trk|track|pixel|fbp|fbc|gcl|campaign|target|doubleclick)/i.test(name)) scores.advertising += 3;
    if (/(twitter|instagram|linkedin|pinterest|snap|tt_)/i.test(name)) scores.social += 2;
    if (/(cache|cdn|lb|loadbal|edge|perf)/i.test(name)) scores.performance += 2;

    const thirdParty = tabHost ? !domainMatches(tabHost, domain) : false;
    const lifespan = summarizeLifespan(cookie.expirationDate, cookie.session);

    if (cookie.sameSite === "no_restriction" || cookie.sameSite === "None" || cookie.sameSite === "unspecified") {
      if (thirdParty) {
        scores.advertising += 2;
        scores.analytics += 1;
      }
    }

    if (lifespan.days >= 180) {
      scores.analytics += 1;
      scores.advertising += 2;
    }

    if (cookie.session) {
      scores.functional += 1;
    }

    const contains = [];
    const signals = {
      ids: 0,
      geo: 0,
      time: 0,
      experiment: 0,
      preferences: 0,
      analytics: 0
    };

    if (known?.contains?.length) {
      for (const item of known.contains) pushUnique(contains, item);
    }

    const textParts = [name, value, decoded?.decoded || "", decoded?.preview || ""];
    if (decoded?.jsonObject) {
      textParts.push(JSON.stringify(decoded.jsonObject));
      pushUnique(contains, "Structured JSON metadata");
    }

    if (decoded?.binaryFragments?.length) {
      textParts.push(decoded.binaryFragments.join(" "));
      pushUnique(contains, `Readable binary fragments: ${decoded.binaryFragments.join(", ")}`);
    }

    for (const part of textParts) {
      extractFromText(part, contains, signals);
    }

    if (decoded?.flags?.probableProtocolBuffers) {
      pushUnique(contains, "Binary metadata likely encoded as Protocol Buffers");
    }

    const scoreEntries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = scoreEntries[0];
    const second = scoreEntries[1];
    const category = top[1] <= 0 ? "unknown" : top[0];
    const confidence = top[1] <= 0 ? 0.3 : Math.min(0.95, 0.45 + (top[1] - second[1]) * 0.08 + top[1] * 0.03);

    let privacyRisk = "low";
    if (category === "advertising") privacyRisk = "high";
    if (category === "analytics") privacyRisk = "medium";
    if (thirdParty && lifespan.days >= 180) privacyRisk = "high";
    if (signals.ids > 0 && thirdParty) privacyRisk = "high";
    if (category === "functional" && !thirdParty && lifespan.days < 120) privacyRisk = "low";
    if (category === "unknown" && thirdParty) privacyRisk = "medium";

    const suspiciousFlags = [];
    if (lifespan.days >= 365) suspiciousFlags.push("Very long lifespan");
    if (thirdParty && (cookie.sameSite === "no_restriction" || cookie.sameSite === "None" || cookie.sameSite === "unspecified")) {
      suspiciousFlags.push("Cross-site capable cookie");
    }
    if (category === "unknown") suspiciousFlags.push("Unknown purpose");
    if (signals.ids > 0 && thirdParty) suspiciousFlags.push("Contains identifier and is third-party");

    let purpose = known?.purpose || "Purpose inferred from cookie structure and behavior";
    if (category === "functional" && !known) purpose = "Keeps the site working (login, settings, or session state)";
    if (category === "analytics" && !known) purpose = "Measures usage and visit behavior";
    if (category === "advertising" && !known) purpose = "Supports ad tracking, targeting, or attribution";
    if (category === "social" && !known) purpose = "Supports social media integrations";
    if (category === "performance" && !known) purpose = "Improves loading or traffic balancing";

    const encoding = decoded?.flags?.probableProtocolBuffers
      ? `${decoded.encodingChain || "unknown"} (possible Protocol Buffers payload)`
      : (decoded?.encodingChain || "plain");

    let recommendations = known?.recommendation || "Review this cookie before deciding to keep or block it";
    if (privacyRisk === "high") recommendations = "Consider blocking this cookie if you want stronger privacy";
    if (category === "functional" && privacyRisk === "low") recommendations = "Safe to keep for normal site functionality";

    return {
      purpose,
      category,
      contains,
      encoding,
      privacyRisk,
      thirdPartyAccess: thirdParty,
      lifespan: lifespan.text,
      recommendations,
      suspiciousFlags,
      confidence
    };
  }

  self.CookieClassifier = {
    classify
  };
})();
