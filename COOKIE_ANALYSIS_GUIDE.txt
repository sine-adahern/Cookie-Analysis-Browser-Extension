Cookie Analysis System Guide
============================

Overview
--------
This extension now includes an offline cookie analysis pipeline that:
- Decodes common cookie encodings.
- Extracts meaningful signals from raw/decoded values.
- Classifies purpose categories.
- Uses a local knowledge base for known cookies.
- Generates plain-language explanations and recommendations.

No cookie values are sent to external services.

Architecture
------------
Files added:
- extension/analysis/knowledge-base.js
- extension/analysis/decoder.js
- extension/analysis/classifier.js
- extension/analysis/explainer.js

Integration points:
- extension/background.js
  - Loads modules using importScripts(...)
  - Adds `analysis` object to each cookie returned in `getReportForTab`
  - Adds basic analysis category/risk to cookie change events
  - Exposes `getAnalyzerStats` message for diagnostics
- extension/popup/popup.js
  - Shows category, risk, purpose in cookie list
  - Shows full explanation, decoded preview, and exact cookie in details panel
- extension/options/options.js
  - Displays analyzer diagnostics and capabilities

Deliverable 1: Decoder module
-----------------------------
Implemented in `extension/analysis/decoder.js`.

Supported decoding/detection:
- URL encoding
- Base64 and base64url
- Hex
- JWT payload/header extraction
- JSON object detection
- Binary payload detection and probable Protocol Buffers hint

Nested decoding:
- Runs iterative decoding up to 4 steps.
- Example chain: `url -> base64 -> json`

Output from decoder:
- `encodingChain`
- `steps`
- `decoded` and `preview`
- `jsonObject` (if parseable)
- flags:
  - `binaryLike`
  - `probableProtocolBuffers`

Deliverable 2: Pattern recognition system
-----------------------------------------
Implemented in `extension/analysis/classifier.js`.

Extracts signals for:
- User/device IDs
- UUIDs
- Analytics IDs (e.g., GA format)
- Timestamps (seconds or milliseconds epoch)
- Geographic indicators (country/timezone style markers)
- A/B test assignments
- Preferences (language, theme)

Signal extraction sources:
- cookie name
- raw cookie value
- decoded text
- decoded JSON

Deliverable 3: Classification algorithm
---------------------------------------
Implemented in `extension/analysis/classifier.js`.

Categories:
- functional
- analytics
- advertising
- social
- performance
- unknown

Scoring inputs:
- Knowledge-base exact or pattern match
- Cookie name/domain patterns
- SameSite behavior
- Third-party vs first-party status
- Lifespan heuristics

Also generates:
- `privacyRisk` (low/medium/high)
- `thirdPartyAccess`
- `lifespan`
- `suspiciousFlags`
- `confidence`

Deliverable 4: Knowledge base
-----------------------------
Implemented in `extension/analysis/knowledge-base.js`.

Includes:
- Exact cookie entries (e.g., _ga, _gid, _fbp, fr, _gcl_au, PHPSESSID, JSESSIONID, cf_clearance, SOCS)
- Name-based pattern rules
- Domain-based pattern rules

Diagnostics available with:
- runtime message `getAnalyzerStats`

Deliverable 5: Human-readable explanation generator
---------------------------------------------------
Implemented in `extension/analysis/explainer.js`.

Produces plain language text with:
- category and risk
- purpose
- encoding interpretation
- likely contained information
- known pattern match (if any)
- recommendation

Displayed in popup cookie detail panel.

Deliverable 6: Chrome extension integration
-------------------------------------------
Implemented in:
- extension/background.js
- extension/popup/popup.js
- extension/popup/popup.css
- extension/options/options.html
- extension/options/options.js

Performance and privacy
-----------------------
- Local, offline analysis only.
- No network calls for decoding/classification.
- Bounded decode size (input truncated at 4096 chars).
- Iteration capped for nested decoding.
- Existing report log cap still applies.

Unknown cookie handling
-----------------------
If no exact match exists:
- Uses heuristics to infer likely purpose.
- Marks category as `unknown` when confidence is weak.
- Adds suspicious flags (e.g., very long lifespan, cross-site capability).
- Provides recommendation to review/block based on risk.

Example (Target Format)
-----------------------
Input:
- Name: SOCS
- Domain: youtube.com
- Value: CAESEwgDEgk4NjczNDcwNDEaAmVuIAEaBgiAsLTMBg
- Expires: 2027-03-14
- Secure: true
- SameSite: None

Typical analyzer output shape:
{
  \"name\": \"SOCS\",
  \"purpose\": \"Stores consent and policy status metadata\",
  \"category\": \"functional\",
  \"contains\": [
    \"Consent state\",
    \"Possible language/region metadata\",
    \"Binary metadata likely encoded as Protocol Buffers\"
  ],
  \"encoding\": \"base64-binary (possible Protocol Buffers payload)\",
  \"privacyRisk\": \"low\",
  \"explanation\": \"This appears to be a first-party cookie ...\",
  \"thirdPartyAccess\": false,
  \"lifespan\": \"1 years\",
  \"recommendations\": \"Safe to keep for normal site functionality\"
}

Notes:
- Protocol Buffers are flagged heuristically unless schema is known.
- Exact field-level protobuf decoding is not guaranteed without the protobuf message schema.

How to validate
---------------
1. Reload extension in `chrome://extensions`.
2. Visit sites with known cookies (_ga, _fbp, session cookies).
3. Open popup and click a cookie row.
4. Verify:
   - category and risk are shown
   - decoded preview appears when possible
   - explanation is understandable for non-technical users
5. Open options page and confirm analyzer diagnostics are present.
