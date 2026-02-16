async function loadSettings() {
  const result = await chrome.runtime.sendMessage({ type: "getSettings" });
  const target = document.getElementById("settingsDump");
  if (!result.ok) {
    target.textContent = `Error: ${result.error}`;
    return;
  }
  target.textContent = JSON.stringify(result.settings, null, 2);
}

async function loadAnalyzerStats() {
  const result = await chrome.runtime.sendMessage({ type: "getAnalyzerStats" });
  const target = document.getElementById("analyzerDump");
  if (!result.ok) {
    target.textContent = `Error: ${result.error}`;
    return;
  }
  target.textContent = JSON.stringify(result.stats, null, 2);
}

Promise.all([loadSettings(), loadAnalyzerStats()]).catch((error) => {
  document.getElementById("analyzerDump").textContent = `Error: ${error.message}`;
});
