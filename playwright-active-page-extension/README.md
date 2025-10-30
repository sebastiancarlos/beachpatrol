# Playwright Active Page Extension

A browser extension that reports the active page to Playwright via network
interception.

## Overview

Playwright doesn't provide an API to detect which browser tab is currently
active/focused. All pages are treated equally, making it impossible to know
which tab the user is interacting with.

- Source: https://github.com/microsoft/playwright/issues/3570

This extension:
1. Detects when a tab becomes active (via browser APIs)
2. Makes a fake `fetch()` request to `https://playwright-active-page`
3. Playwright should then intercept this request with `page.route()`
4. The route handler knows which page sent the request = the active page!

This approach is:
- Cross-browser (Chromium and Firefox with proper setup)
  - Indeed, the `manifest.json` follows best cross-browser practices as per
    [Firefox Manifest V3
    Docs](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- No CSP issues (fetch requests aren't blocked from extensions)

**Note:** The following example uses Chromium. For full firefox support, you
would need to use a more advanced setup to load the extension, as Firefox
extension are not natively supported in Playwright.
- Sources:
  - https://playwright.dev/docs/chrome-extensions
  - https://github.com/ueokande/playwright-webextext

**Note:** This extension is part of the
[beachpatrol](https://github.com/sebastiancarlos/beachpatrol) project, but has
no external dependencies. You can use it standalone with any Playwright
project.

## Example

```javascript
#!/usr/bin/env node
import { chromium } from 'playwright'; // or 'patchright'
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// Track the active page
let activePage = null;

// Launch Chromium with the extension
// - This assumes the extension folder is located on the same level as this script
const extensionPath = path.join(SCRIPT_DIR, 'playwright-active-page-extension');
const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ]
});

// Setup route handler for each page
async function setupPage(page) {
  await page.route('https://playwright-active-page', async (route) => {
    // This page became active!
    activePage = page;
    console.log(`Active page: ${page.url()}`);

    // Fulfill the request
    await route.fulfill({ status: 200 });
  });
}

// Setup existing and new pages
for (const page of context.pages()) {
  await setupPage(page);
}
context.on('page', setupPage);

// Create test pages
await context.newPage().then(p => p.goto('https://example.com'));
await context.newPage().then(p => p.goto('https://github.com'));
await context.newPage().then(p => p.goto('https://google.com'));

console.log('Switch tabs manually to see detection working!');
console.log(`Current active page: ${activePage?.url() || 'none'}`);

// Keep browser open
await new Promise(() => {});
```
