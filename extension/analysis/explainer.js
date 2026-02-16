(() => {
  function sentenceCase(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function generate(result, context) {
    const subject = result.thirdPartyAccess ? "This appears to be a third-party cookie." : "This appears to be a first-party cookie.";
    const categoryLine = `It is classified as ${sentenceCase(result.category)} with ${result.privacyRisk} privacy risk.`;
    const purposeLine = result.purpose ? `Likely purpose: ${result.purpose}.` : "";
    const encodingLine = result.encoding ? `The value looks ${result.encoding}.` : "";
    const containsLine = result.contains?.length
      ? `It may include: ${result.contains.slice(0, 4).join(", ")}.`
      : "No clear data fields were extracted from the current value.";
    const recommendationLine = result.recommendations ? `Recommendation: ${result.recommendations}.` : "";
    const knownLine = context?.known?.label ? `Known pattern match: ${context.known.label}.` : "";

    return [subject, categoryLine, purposeLine, encodingLine, containsLine, knownLine, recommendationLine]
      .filter(Boolean)
      .join(" ");
  }

  self.CookieExplainer = {
    generate
  };
})();
