# Cookie Analysis Browser Extension

A privacy-focused browser extension pipeline that analyses, decodes, and explains cookies entirely offline with no cookie values ever sent to external services.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Modules](#modules)
  - [Decoder](#decoder)
  - [Pattern Recognition & Classifier](#pattern-recognition--classifier)
  - [Knowledge Base](#knowledge-base)
  - [Explanation Generator](#explanation-generator)
- [Integration Points](#integration-points)
- [Performance & Privacy](#performance--privacy)
- [Unknown Cookie Handling](#unknown-cookie-handling)
- [Output Format](#output-format)
- [Validation Guide](#validation-guide)

---

## Overview

The cookie analysis pipeline provides:

- Decoding of common cookie encodings
- Signal extraction from raw and decoded values
- Purpose classification by category
- A local knowledge base for well-known cookies
- Plain-language explanations and recommendations for end users

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `extension/analysis/knowledge-base.js` | Known cookie database and pattern rules |
| `extension/analysis/decoder.js` | Encoding detection and iterative decoding |
| `extension/analysis/classifier.js` | Signal extraction and category classification |
| `extension/analysis/explainer.js` | Human-readable explanation generation |

### Modified Files

| File | Changes |
|------|---------|
| `extension/background.js` | Loads analysis modules; adds `analysis` object to cookie reports; exposes `getAnalyzerStats` |
| `extension/popup/popup.js` | Displays category, risk, purpose, decoded preview, and explanation |
| `extension/popup/popup.css` | Styles for analysis UI elements |
| `extension/options/options.html` | Adds diagnostics section |
| `extension/options/options.js` | Renders analyzer diagnostics and capabilities |

---

## Modules

### Decoder

**File:** `extension/analysis/decoder.js`

Detects and decodes cookie values using an iterative chain of up to 4 steps.

**Supported encodings:**

- URL encoding
- Base64 and Base64url
- Hex
- JWT (header and payload extraction)
- JSON object detection
- Binary payload detection with Protocol Buffers hint

**Example decode chain:** `url → base64 → json`

**Output fields:**

| Field | Description |
|-------|-------------|
| `encodingChain` | Ordered list of detected encodings |
| `steps` | Intermediate decoding steps |
| `decoded` | Final decoded value |
| `preview` | Truncated human-readable preview |
| `jsonObject` | Parsed JSON, if applicable |
| `binaryLike` | Flag: value appears to be binary data |
| `probableProtocolBuffers` | Flag: heuristic protobuf detection |

> **Note:** Field-level protobuf decoding is not guaranteed without a known message schema.

---

### Pattern Recognition & Classifier

**File:** `extension/analysis/classifier.js`

Extracts signals from the cookie name, raw value, decoded text, and decoded JSON, then scores them to assign a category and risk level.

**Extracted signals:**

- User / device identifiers
- UUIDs
- Analytics IDs (e.g. Google Analytics format)
- Timestamps (epoch in seconds or milliseconds)
- Geographic indicators (country / timezone markers)
- A/B test assignments
- Preferences (language, theme)

**Classification categories:**

| Category | Description |
|----------|-------------|
| `functional` | Required for core site operation |
| `analytics` | Usage tracking and measurement |
| `advertising` | Ad targeting and frequency capping |
| `social` | Social media integrations |
| `performance` | Caching and load optimisation |
| `unknown` | Cannot be confidently classified |

**Additional output fields:**

| Field | Values |
|-------|--------|
| `privacyRisk` | `low` / `medium` / `high` |
| `thirdPartyAccess` | `true` / `false` |
| `lifespan` | Human-readable duration |
| `suspiciousFlags` | Array of flag strings |
| `confidence` | Classification confidence score |

**Scoring inputs:** knowledge-base match, cookie name/domain patterns, SameSite attribute, first- vs third-party status, and lifespan heuristics.

---

### Knowledge Base

**File:** `extension/analysis/knowledge-base.js`

Provides fast lookups for common cookies.

**Contains:**

- **Exact entries** — e.g. `_ga`, `_gid`, `_fbp`, `fr`, `_gcl_au`, `PHPSESSID`, `JSESSIONID`, `cf_clearance`, `SOCS`
- **Name-based pattern rules** — regex patterns matched against cookie names
- **Domain-based pattern rules** — rules scoped to specific domains

**Diagnostics:** Send the `getAnalyzerStats` runtime message to retrieve knowledge-base statistics.

---

### Explanation Generator

**File:** `extension/analysis/explainer.js`

Produces a plain-language summary suitable for non-technical users, shown in the popup detail panel.

**Output includes:**

- Category and risk level
- Purpose description
- Encoding interpretation
- Likely contained information
- Matched knowledge-base entry (if any)
- Actionable recommendation

---

## Integration Points

### Background (`background.js`)

- Loads all analysis modules via `importScripts(...)`
- Attaches an `analysis` object to each cookie in `getReportForTab`
- Adds `category` and `risk` to cookie change events
- Exposes `getAnalyzerStats` message handler for diagnostics

### Popup (`popup.js`)

- Cookie list rows show: **category**, **risk**, **purpose**
- Cookie detail panel shows: **full explanation**, **decoded preview**, **exact raw value**

### Options (`options.js`)

- Displays analyzer diagnostics and a summary of capabilities

---

## Performance & Privacy

| Property | Detail |
|----------|--------|
| Network calls | None — fully offline analysis |
| Input size limit | Values truncated at **4,096 characters** before decoding |
| Decode iteration cap | Maximum **4 steps** per value |
| Report log cap | Existing cap unchanged |

---

## Unknown Cookie Handling

When no exact knowledge-base match exists, the analyser falls back to heuristics:

- Infers likely purpose from name and value patterns
- Sets category to `unknown` when confidence is weak
- Adds suspicious flags (e.g. very long lifespan, cross-site capability)
- Issues a recommendation to review or block, proportional to risk level

---

## Output Format

**Example input:**

| Field | Value |
|-------|-------|
| Name | `SOCS` |
| Domain | `youtube.com` |
| Value | `CAESEwgDEgk4NjczNDcwNDEaAmVuIAEaBgiAsLTMBg` |
| Expires | `2027-03-14` |
| Secure | `true` |
| SameSite | `None` |

**Example output:**

```json
{
  "name": "SOCS",
  "purpose": "Stores consent and policy status metadata",
  "category": "functional",
  "contains": [
    "Consent state",
    "Possible language/region metadata",
    "Binary metadata likely encoded as Protocol Buffers"
  ],
  "encoding": "base64-binary (possible Protocol Buffers payload)",
  "privacyRisk": "low",
  "explanation": "This appears to be a first-party cookie ...",
  "thirdPartyAccess": false,
  "lifespan": "1 year",
  "recommendations": "Safe to keep for normal site functionality"
}
```

---

## Validation Guide

1. Open `chrome://extensions` and reload the extension.
2. Visit sites with well-known cookies such as `_ga`, `_fbp`, or session cookies.
3. Open the extension popup and click a cookie row.
4. Confirm that:
   - **Category** and **risk** are displayed in the list row
   - **Decoded preview** appears where applicable
   - **Explanation** is understandable to a non-technical user
5. Open the options page and confirm that **analyzer diagnostics** are present.


