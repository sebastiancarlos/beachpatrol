/**
 * Content Script for Playwright Active Page Extension
 *
 * - Listens for "active page" messages from the extension's service worker.
 * - Notifies Playwright when the page becomes active via a fake fetch request.
 * - Works on both Chrome and Firefox.
 *   - Note that it uses the 'chrome' API even in Firefox, which provides compatibility.
 *   - Manifest v3 compatible.
 */

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PLAYWRIGHT_PAGE_ACTIVATED") {
    // Use fetch to signal page activation - this will be intercepted by Playwright
    // Using a fake internal URL that we'll intercept with page.route()
    // Use HTTPS to avoid mixed content blocking on HTTPS pages
    fetch("https://playwright-active-page").catch(() => {
      // Ignore errors. The request should be intercepted successfully anyway.
    });
  }
});
