(() => {
  const MAX_INPUT_LEN = 4096;
  const MAX_DECODE_STEPS = 4;

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value.replace(/\+/g, "%20"));
    } catch {
      return null;
    }
  }

  function isLikelyUrlEncoded(value) {
    return /%[0-9a-fA-F]{2}/.test(value) || /\+/.test(value);
  }

  function isLikelyHex(value) {
    return /^[0-9a-fA-F]+$/.test(value) && value.length >= 8 && value.length % 2 === 0;
  }

  function isLikelyBase64(value) {
    if (!value || value.length < 8) return false;
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return /^[A-Za-z0-9+/=]+$/.test(normalized) && normalized.length % 4 !== 1;
  }

  function isLikelyJwt(value) {
    const parts = (value || "").split(".");
    if (parts.length !== 3) return false;
    return parts[0].length > 0 && parts[1].length > 0;
  }

  function bytesToUtf8(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return "";
    }
  }

  function printableRatio(text) {
    if (!text) return 0;
    let printable = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) printable += 1;
    }
    return printable / text.length;
  }

  function tryParseJson(value) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  function base64ToBytes(value) {
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  function decodeHex(value) {
    try {
      const bytes = new Uint8Array(value.length / 2);
      for (let i = 0; i < value.length; i += 2) {
        bytes[i / 2] = parseInt(value.slice(i, i + 2), 16);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  function extractPrintableFragments(bytes) {
    if (!bytes || !bytes.length) return [];
    const fragments = [];
    let current = "";
    for (const code of bytes) {
      if (code >= 32 && code <= 126) {
        current += String.fromCharCode(code);
      } else {
        if (current.length >= 2) fragments.push(current);
        current = "";
      }
    }
    if (current.length >= 2) fragments.push(current);
    return [...new Set(fragments)].slice(0, 8);
  }

  function decodeJwt(value) {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const headerBytes = base64ToBytes(parts[0]);
    const payloadBytes = base64ToBytes(parts[1]);
    if (!headerBytes || !payloadBytes) return null;

    const headerText = bytesToUtf8(headerBytes);
    const payloadText = bytesToUtf8(payloadBytes);
    const headerJson = tryParseJson(headerText);
    const payloadJson = tryParseJson(payloadText);

    return {
      headerText,
      payloadText,
      headerJson,
      payloadJson
    };
  }

  function looksBinaryLike(value) {
    if (!value) return false;
    const ratio = printableRatio(value);
    return ratio < 0.65;
  }

  function decode(value) {
    const original = String(value || "").slice(0, MAX_INPUT_LEN);
    let current = original;
    const steps = [];
    let jsonObject = null;
    let binaryHint = false;
    let binaryFragments = [];

    if (isLikelyJwt(current)) {
      const jwt = decodeJwt(current);
      if (jwt) {
        steps.push("jwt");
        jsonObject = jwt.payloadJson || jwt.headerJson || null;
        current = jwt.payloadText || current;
      }
    }

    for (let i = 0; i < MAX_DECODE_STEPS; i += 1) {
      let changed = false;

      if (isLikelyUrlEncoded(current)) {
        const decoded = safeDecodeURIComponent(current);
        if (decoded && decoded !== current) {
          current = decoded;
          steps.push("url");
          changed = true;
        }
      }

      if (isLikelyBase64(current)) {
        const bytes = base64ToBytes(current);
        if (bytes) {
          const text = bytesToUtf8(bytes);
          const ratio = printableRatio(text);
          if (ratio >= 0.75 && text) {
            current = text;
            steps.push("base64");
            changed = true;
          } else {
            steps.push("base64-binary");
            binaryHint = true;
            binaryFragments = extractPrintableFragments(bytes);
            break;
          }
        }
      }

      if (isLikelyHex(current)) {
        const bytes = decodeHex(current);
        if (bytes) {
          const text = bytesToUtf8(bytes);
          if (printableRatio(text) >= 0.75 && text) {
            current = text;
            steps.push("hex");
            changed = true;
          }
        }
      }

      const parsed = tryParseJson(current);
      if (parsed) {
        jsonObject = parsed;
        steps.push("json");
        break;
      }

      if (!changed) break;
    }

    if (!binaryHint && looksBinaryLike(current)) {
      binaryHint = true;
    }

    const isLikelyProto = binaryHint && steps.includes("base64-binary");
    const encodingChain = steps.length ? steps.join(" -> ") : "plain";
    const preview = current.slice(0, 300);

    return {
      original,
      decoded: current,
      preview,
      steps,
      encodingChain,
      jsonObject,
      flags: {
        binaryLike: binaryHint,
        probableProtocolBuffers: isLikelyProto
      },
      binaryFragments
    };
  }

  self.CookieDecoder = {
    decode
  };
})();
