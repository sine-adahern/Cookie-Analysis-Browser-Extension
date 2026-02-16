(() => {
  const EXACT_MATCHES = {
    "_ga": {
      label: "Google Analytics Client ID",
      category: "analytics",
      purpose: "Distinguishes unique users for analytics reporting",
      contains: ["Persistent analytics user identifier"],
      recommendation: "Usually optional unless site owner relies on analytics"
    },
    "_gid": {
      label: "Google Analytics Session ID",
      category: "analytics",
      purpose: "Distinguishes users for short-term analytics windows",
      contains: ["Short-lived analytics identifier"],
      recommendation: "Usually optional"
    },
    "_gat": {
      label: "Google Analytics Throttle",
      category: "analytics",
      purpose: "Controls analytics request rate",
      contains: ["Rate-limit marker"],
      recommendation: "Optional"
    },
    "_fbp": {
      label: "Meta Browser ID",
      category: "advertising",
      purpose: "Tracks browser visits for advertising attribution",
      contains: ["Browser-level tracking ID"],
      recommendation: "Consider blocking if you prefer less ad tracking"
    },
    "fr": {
      label: "Meta Ad Cookie",
      category: "advertising",
      purpose: "Supports ad delivery and measurement",
      contains: ["Advertising identifier"],
      recommendation: "Consider blocking for privacy"
    },
    "_gcl_au": {
      label: "Google Ads Conversion Cookie",
      category: "advertising",
      purpose: "Measures ad conversion effectiveness",
      contains: ["Ad campaign/conversion ID"],
      recommendation: "Optional"
    },
    "phpsessid": {
      label: "PHP Session Cookie",
      category: "functional",
      purpose: "Maintains session state on PHP sites",
      contains: ["Session token"],
      recommendation: "Keep if site login/cart must work"
    },
    "jsessionid": {
      label: "Java Session Cookie",
      category: "functional",
      purpose: "Maintains session state on Java servers",
      contains: ["Session token"],
      recommendation: "Keep if site login/cart must work"
    },
    "cf_clearance": {
      label: "Cloudflare Clearance",
      category: "functional",
      purpose: "Confirms security challenge completion",
      contains: ["Anti-bot challenge state"],
      recommendation: "Keep to avoid repeated security checks"
    },
    "socs": {
      label: "Google/YouTube Consent State",
      category: "functional",
      purpose: "Stores consent and policy status metadata",
      contains: ["Consent state", "Possible language/region metadata"],
      recommendation: "Usually safe to keep for site functionality"
    }
  };

  const NAME_PATTERNS = [
    {
      regex: /^(sess|session|sid|auth|token|csrf|xsrf|login)/i,
      category: "functional",
      purpose: "Maintains login or secure session state"
    },
    {
      regex: /(_ga|_gid|analytics|collect|segment|mixpanel|amplitude|matomo)/i,
      category: "analytics",
      purpose: "Measures visits and user behavior"
    },
    {
      regex: /(ad|ads|doubleclick|pixel|trk|track|fbp|fbc|campaign|target)/i,
      category: "advertising",
      purpose: "Supports ad measurement and targeting"
    },
    {
      regex: /(lang|locale|theme|pref|consent|settings|currency)/i,
      category: "functional",
      purpose: "Stores user preferences"
    },
    {
      regex: /(cdn|cache|lb|loadbal|akamai|edge)/i,
      category: "performance",
      purpose: "Improves site delivery and load balancing"
    },
    {
      regex: /(twitter|x_|instagram|linkedin|pinterest|snap|tt_)/i,
      category: "social",
      purpose: "Supports social integrations"
    }
  ];

  const DOMAIN_PATTERNS = [
    { regex: /(google-analytics|googletagmanager|analytics\.google)/i, category: "analytics" },
    { regex: /(doubleclick|adservice|facebook|meta|ads|taboola|outbrain|criteo)/i, category: "advertising" },
    { regex: /(cloudflare|akamai|fastly|cdn)/i, category: "performance" },
    { regex: /(twitter|linkedin|instagram|pinterest|tiktok)/i, category: "social" }
  ];

  function normalizeDomain(input) {
    return (input || "").trim().toLowerCase().replace(/^\./, "");
  }

  function lookup(name, domain) {
    const normalizedName = (name || "").trim().toLowerCase();
    const normalizedDomain = normalizeDomain(domain);

    if (EXACT_MATCHES[normalizedName]) {
      return {
        source: "exact_name",
        confidence: 0.98,
        ...EXACT_MATCHES[normalizedName]
      };
    }

    for (const pattern of NAME_PATTERNS) {
      if (pattern.regex.test(normalizedName)) {
        return {
          source: "name_pattern",
          confidence: 0.72,
          label: "Heuristic name match",
          category: pattern.category,
          purpose: pattern.purpose,
          contains: [],
          recommendation: "Review based on your privacy preference"
        };
      }
    }

    for (const pattern of DOMAIN_PATTERNS) {
      if (pattern.regex.test(normalizedDomain)) {
        return {
          source: "domain_pattern",
          confidence: 0.68,
          label: "Heuristic domain match",
          category: pattern.category,
          purpose: "Inferred from service domain",
          contains: [],
          recommendation: "Review based on your privacy preference"
        };
      }
    }

    return null;
  }

  self.CookieKnowledgeBase = {
    lookup,
    stats: {
      exactEntries: Object.keys(EXACT_MATCHES).length,
      namePatterns: NAME_PATTERNS.length,
      domainPatterns: DOMAIN_PATTERNS.length
    }
  };
})();
