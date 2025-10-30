/**
 * Non-persistent service worker (or "background script", on Firefox parlance) for Playwright Active
 * Page Extension.
 *
 * - Listens for tab activation and navigation events, and messages the extension's content script
 *   for the corresponding tab.
 *   - It then forwards it to Playwright to keep track of the active page.
 * - Works on both Chrome and Firefox.
 *   - Note that it uses the 'chrome' API even in Firefox, which provides compatibility.
 *   - Manifest v3 compatible.
 */

// Helper function to send message notifying active page.
function sendMessageToActiveTab(tabId) {
  chrome.tabs.sendMessage(tabId, { type: "PLAYWRIGHT_PAGE_ACTIVATED" });
}

// Listing for tab activation.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  sendMessageToActiveTab(tabId);
});

// Listen for navigation completion in the active tab.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // We only care when the page has finished loading and the tab is active.
  if (changeInfo.status === "complete" && tab.active) {
    sendMessageToActiveTab(tabId);
  }
});
