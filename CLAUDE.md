# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development and Testing:**
- `npm test` - Runs E2E tests using Node.js built-in test runner
- `npm install` - Install dependencies and triggers browser installation
- `make install` - Creates symlinks in `/usr/local/bin` (Unix/Linux/macOS)
- `npm install -g .` - Global installation alternative (Windows)

**Running the Application:**
- `beachpatrol` - Launch browser server (Chromium by default)
- `beachpatrol --profile <name>` - Launch with specific profile
- `beachpatrol --browser firefox` - Launch with Firefox instead of Chromium
- `beachpatrol --incognito` - Launch in incognito mode
- `beachpatrol --headless` - Launch in headless mode
- `beachmsg <command> [args...]` - Send commands to running browser server
- `beachmsg smoke-test` - Run the built-in test command

## Architecture Overview

Beachpatrol is a **client-server CLI tool** for browser automation that bridges everyday browsing with programmable automation.

### Core Components

**Server Process (`beachpatrol.js`):**
- Launches persistent browser with stealth capabilities to avoid automation detection
- Uses `patchright` (Chromium) or `playwright-extra` + stealth plugins (Firefox) 
- Creates UNIX socket (Unix/macOS) or named pipe (Windows) for inter-process communication
- Dynamically loads and executes command scripts from `/commands/` directory
- Manages browser profiles, downloads, and lifecycle

**Client Process (`beachmsg.js`):**
- Connects to server socket and sends JSON-formatted commands
- Lightweight command sender that communicates with the persistent browser

**Command System:**
- Commands are ES modules in `/commands/` directory
- Each command exports `export default async (context, ...args) => { }`
- `context` is Playwright's BrowserContext API
- Commands are hot-reloadable without server restart
- Built-in example: `commands/smoke-test.js`

### Key Technical Details

**Browser Engine Selection:**
- **Chromium** (default): Uses `patchright` for enhanced stealth
- **Firefox**: Uses `playwright-extra` with `puppeteer-extra-plugin-stealth`

**Profile Management:**
- Profiles stored in `~/.config/beachpatrol/profiles/`
- Persistent sessions maintain login state between launches
- Cross-platform profile isolation

**Stealth Features:**
- Carefully configured to mimic regular browser behavior
- Avoids automation detection for daily browsing use
- Custom Playwright options hide automation indicators

## Development Patterns

**Command Development:**
```javascript
// commands/example.js
export default async (context, ...args) => {
  // Work with existing tabs
  const pages = context.pages();
  const currentPage = pages[0];
  
  // Or create new tab
  const page = await context.newPage();
  await page.goto('https://example.com');
  
  // Use full Playwright API
  await page.click('button');
};
```

**Testing:**
- E2E tests use Node.js built-in test runner
- Test files in `/test/` directory with `*.js` extension
- No specific test framework - uses native Node.js testing

**Project Structure:**
- `/beachpatrol.js` - Main server executable
- `/beachmsg.js` - Client command sender
- `/commands/` - Automation command scripts (extensible)
- `/test/` - E2E test files
- `/.internal-scripts/` - Build and setup utilities

## Requirements and Constraints

- **Node.js**: v22+ required (ES modules, modern API usage)
- **npm**: v10+ required
- **Browsers**: Chromium and Firefox (auto-installed via Playwright)
- **Platforms**: Linux (Wayland/X11), macOS, Windows
- **Socket Communication**: UNIX domain sockets (Unix) / named pipes (Windows)