#!/usr/bin/env node

import fs from "fs";
import os from "os";
import { createServer } from "net";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// chromium-related imports
import { chromium } from "patchright";

// firefox-related imports
import { firefox } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const HOME_DIR = os.homedir();
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

const SUPPORTED_BROWSERS = ["chromium", "firefox"];

// if --help/-h, print usage
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    `
Usage: beachpatrol [--profile <profile_name>] [--incognito] [--headless]

- Launches a browser with the specified profile.
- Opens a socket to listen for commands. Commands can be sent with the
  'beachmsg' command.

Options:
  --profile <profile_name>  Use the specified profile. Default: default
  --browser <browser_name>  Use the specified browser. Default: chromium
      Supported browsers: ${SUPPORTED_BROWSERS.join(", ")}
  --incognito               Launch browser in incognito mode.
  --headless                Launch browser in headless mode.
  --help                    Show this help message.
  --version                 Show version. 
`.trimStart(),
  );
  process.exit(0);
}

// handle --version/-v
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  // get version from package.json
  const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
  const version = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).version;
  console.log(`v${version}`);
  process.exit(0);
}

// Argument parsing
let profileName = "default";
if (process.argv.includes("--profile")) {
  const profileIndex = process.argv.indexOf("--profile");
  profileName = process.argv[profileIndex + 1];
}
let incognito = false;
if (process.argv.includes("--incognito")) {
  incognito = true;
}
let headless = false;
if (process.argv.includes("--headless")) {
  headless = true;
}
let browser = "chromium";
if (process.argv.includes("--browser")) {
  const browserIndex = process.argv.indexOf("--browser");
  browser = process.argv[browserIndex + 1];
  // bail out if browser is not supported
  if (!SUPPORTED_BROWSERS.includes(browser)) {
    console.error(`Error: Unsupported browser ${browser}`);
    console.error(`Supported browsers: ${SUPPORTED_BROWSERS.join(", ")}`);
    process.exit(1);
  }
}

// prepare profile directory, create if it doesn't exist
const profileDir = path.join(
  HOME_DIR,
  `.config/beachpatrol/profiles/${browser}/${profileName}`,
);
if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

const browserCommand = browser === "chromium" ? chromium : firefox;

// prepare launch options and hide automation
const launchOptions = {
  headless: headless,
  viewport: null, // Let browser decide viewport
  args: [],
  ignoreDefaultArgs: ["--enable-automation"], // No "controlled by automation" infobar
};
if (!process.env.CI) {
  // The Chromium sandbox must be disabled for CI to pass
  launchOptions["chromiumSandbox"] = true;
}
if (browser === "chromium") {
  launchOptions.channel = "chromium"; // Opt in to the new chromium headless mode

  // Playwright doesn't support keeping track of the active browser page.
  // - Source: https://github.com/microsoft/playwright/issues/31890
  //
  // To work around this, we use a custom browser extension that detects active tab
  // changes, and notifies Playwright via a fake fetch request which we intercept (see later).
  //
  // Unfortunately, Playwright doesn't support adding extensions for Firefox.
  // - Source: https://playwright.dev/docs/chrome-extensions
  // - There are workarounds (https://github.com/ueokande/playwright-webextext), but these
  //   don't preserve the stealth features of the StealthPlugin.
  // - Despite that, we eventually plan to support active tab tracking in Firefox. The way to
  //   achieve it would be to incorporate them into our full-fledged
  //   `beachpatrol-browser-extension`, which can then be installed from the browser's
  //   extension store.
  const extensionPath = path.join(PROJECT_ROOT, "playwright-active-page-extension");
  launchOptions.args.push(
    // If we were using plain Playwright, we would also need to pass a 
    // `--disable-extensions-except` flag too, but this is not needed with Patchright as
    // extensions are enabled.
    `--load-extension=${extensionPath}`
  );

  if (process.env.XDG_SESSION_TYPE === "wayland") {
    // If running on wayland, add the needed chromium wayland flag
    // Source: https://wiki.archlinux.org/title/Chromium#Force_GPU_acceleration
    launchOptions.args.push(
      ...["--ozone-platform-hint=auto"],
    );
  }
}

// firefox uses "puppeteer-extra-plugin-stealth" because "patchright" doesn't support firefox
if (browser === "firefox") {
  browserCommand.use(StealthPlugin());
}

if (incognito) {
  if (browser === "chromium") {
    launchOptions.args.push("--incognito");
  } else if (browser === "firefox") {
    launchOptions.args.push("-private-window");
  }
}

const DATA_HOME =
  process.env.XDG_DATA_HOME || path.join(HOME_DIR, ".local/share");
const DATA_DIR = `${DATA_HOME}/beachpatrol`;
const SOCKET_DIR = DATA_DIR;
const SOCKET_NAME = `${browser}-${profileName}${incognito ? "-incognito" : ""}`;
const SOCKET_PATH = `${SOCKET_DIR}/${SOCKET_NAME}.sock`;
const USER_COMMANDS_DIR = `${DATA_DIR}/commands`;
const PROJECT_COMMANDS_DIR = `${PROJECT_ROOT}/commands`;
const WINDOWS_NAMED_PIPE = String.raw`\\.\pipe\beachpatrol-${SOCKET_NAME}`;
const usingUnixDomainSocket = process.platform !== "win32";

let browserContext;
let activePage = null;

// Listen for commands
const server = createServer((socket) => {

  // Wire protocol helpers
  const ERROR_SENTINEL = "BEACHPATROL_ERROR:";
  const writeValue = (value) => {
    // Write value to socket
    let output = typeof value === "string" ? value : JSON.stringify(value);
    if (!output.endsWith("\n")) output += "\n";
    socket.write(output);
  };
  const writeError = (message) => {
    // Log error to server console and to socket (with sentinel line)
    console.log(`Error: ${message}`);
    socket.write(`${ERROR_SENTINEL} ${message.replace(/\n/g, " ")}\n`);
    socket.end();
  };

  socket.on("data", async (data) => {
    const message = JSON.parse(data.toString());
    const [commandName, ...args] = message;

    // Sanitize commandName
    if (commandName.includes("..")) {
      writeError(`Invalid command name '${commandName}'. No path traversal allowed.`);
      return;
    }

    // A command may arrive before the browser is ready. Ask the client to retry.
    if (!browserContext) {
      writeError("Browser is still starting. Please retry.");
      return;
    }

    // identify and log command
    console.log(`Received command: ${commandName} ${args.join(" ")}`);

    // Resolve the command script: user commands (in the XDG data dir) shadow
    // bundled ones.
    const commandCandidates = [USER_COMMANDS_DIR, PROJECT_COMMANDS_DIR].flatMap(
      (dir) =>
        [".js", ".ts"].map((extension) =>
          path.join(dir, `${commandName}${extension}`),
        ),
    );
    const commandFilePath = commandCandidates.find((candidate) =>
      fs.existsSync(candidate),
    );

    // Check if command script exists.
    if (!commandFilePath) {
      writeError(`Command script ${commandName} does not exist.`);
    } else {
      // Import and run the command
      try {
        // import with a timestamp to avoid caching
        const moduleURL = pathToFileURL(commandFilePath).href;
        const { default: command } = await import(
          `${moduleURL}?t=${Date.now()}`
        );

        // Run command, passing `{ context, activePage }` as first argument.
        // A generator command streams its yielded values to the client, and 
        // plain function returns a single value.
        const isGeneratorFn =
          command.constructor.name === "GeneratorFunction" ||
          command.constructor.name === "AsyncGeneratorFunction";
        const result = command({ context: browserContext, activePage }, ...args);
        if (isGeneratorFn) {
          for await (const value of result) {
            writeValue(value);
          }
        } else {
          const value = await result;
          if (value !== undefined) writeValue(value);
        }
        socket.end();
        console.log("Command executed successfully.");
      } catch (error) {
        writeError(error.message);
      }
    }
  });
});

// Claim the socket before launching the browser. If the bind fails, another
// instance owns this profile slot.
const endpoint = usingUnixDomainSocket ? SOCKET_PATH : WINDOWS_NAMED_PIPE;
if (usingUnixDomainSocket) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
}

// Create user commands dir, if it doesn't exist already
fs.mkdirSync(USER_COMMANDS_DIR, { recursive: true });

server.on("error", (err) => {
  // EADDRINUSE on Unix sockets; EEXIST on Windows named pipes
  if (err.code === "EADDRINUSE" || err.code === "EEXIST") {
    console.error(
      `Error: beachpatrol is already running for ${SOCKET_NAME}.`,
    );
    process.exit(1);
  }
  throw err;
});

// Start serer
await new Promise((resolve) => {
  server.once("listening", resolve);
  server.listen(endpoint);
});

let cleanupDone = false;
const cleanup = async () => {
  if (cleanupDone) return;
  cleanupDone = true;
  console.log("Cleaning up and shutting down...");
  if (usingUnixDomainSocket && fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
    console.log(`  - Socket file ${SOCKET_PATH} removed`);
  }
  if (server) {
    server.close();
    console.log("  - Server closed");
  }
  await browserContext?.close();
  process.exit(0);
};

// Launch browser with specified profile and args
if (incognito) {
  const browser = await browserCommand.launch(launchOptions);
  browserContext = await browser.newContext();
  // the 'launch' method does not open a page by default, so we need to open one
  await browserContext.newPage();
} else {
  browserContext = await browserCommand.launchPersistentContext(
    profileDir,
    launchOptions,
  );
}

// cleanup on browser close
browserContext.on("close", () => {
  console.log("Browser context closed.");
  cleanup();
});

// get directory for downloaded files
const DOWNLOAD_DIR =
  process.env.XDG_DOWNLOAD_DIR || path.join(HOME_DIR, "Downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Handler for file downloads.
// - By default, Playwright intercepts native downloads and stores the files with UUID names
//   in the /tmp folder which is deleted after closing the browser.
//   - Source: https://github.com/microsoft/playwright/issues/35415
// - To get a close-to-native behavior, we use this custom download handler.
const handleDownload = async (download) => {
  let filename = download.suggestedFilename();
  console.log(`Got download event for: ${filename}`);

  let savePath = path.join(DOWNLOAD_DIR, filename);
  let counter = 0;

  // Iterate increasing the counter in the filename until there is no name clash.
  while (fs.existsSync(savePath)) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    counter++;
    filename = `${base} (${counter})${ext}`;
    savePath = path.join(DOWNLOAD_DIR, filename);
  }

  console.log(
    `Attempting to download: ${filename} (as ${filename}) to ${DOWNLOAD_DIR}`,
  );
  try {
    await download.saveAs(savePath);
    console.log(`  - Successfully downloaded: ${savePath}`);
  } catch (error) {
    console.error(`  - Failed to download: ${error.message}`);
  }
};

// Setup custom Beachpatrol functionality for each page
const setupPage = async (page) => {
  // Attach download handler
  page.on("download", handleDownload);

  // Intercept fake fetch requests from our web extension to detect page activation.
  // - The extension makes a fetch request when a page becomes active, which we intercept here
  // - This approach works cross-browser and bypasses Patchright's console/evaluate limitations,
  //   which would have been the preferred method for this feature.
  //   - Source: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/issues/30
  await page.route('https://playwright-active-page', async (route) => {
    // This page became active, track it.
    activePage = page;

    // Fulfill the request so it doesn't fail
    await route.fulfill({ status: 200 });
  });

  // Unset activePage when a page closes.
  page.on('close', () => {
    if (activePage === page) {
      activePage = null;
    }
  });
};

// Setup for existing pages
for (const page of browserContext.pages()) {
  await setupPage(page);
}

// Setup for new pages
browserContext.on("page", async (page) => {
  await setupPage(page);
});

console.log(`beachpatrol listening on ${endpoint}`);

// Handle process termination signals
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`\nReceived termination signal: ${sig}`);
    cleanup();
  });
}
