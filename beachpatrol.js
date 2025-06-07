#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import { createServer } from 'net';
import path from 'path';
import { URL } from 'url';

// chromium-related imports
import { chromium } from 'patchright';

// firefox-related imports
import { firefox } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

const HOME_DIR = os.homedir();

const SUPPORTED_BROWSERS = ['chromium', 'firefox'];

// if --help/-h, print usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: beachpatrol [--profile <profile_name>] [--incognito] [--headless]');
  console.log();
  console.log('Launches a browser with the specified profile.');
  console.log('Opens a socket to listen for commands. Commands can be sent with');
  console.log('the \'beachmsg\' command.');
  console.log();
  console.log('Options:');
  console.log('  --profile <profile_name>  Use the specified profile. Default: default');
  console.log('  --browser <browser_name>  Use the specified browser. Default: chromium');
  console.log(`      Supported browsers: ${SUPPORTED_BROWSERS.join(', ')}`);
  console.log('  --incognito               Launch browser in incognito mode');
  console.log('  --headless                Launch browser in headless mode');
  process.exit(0);
}

// Argument parsing
let profileName = 'default';
if (process.argv.includes('--profile')) {
  const profileIndex = process.argv.indexOf('--profile');
  profileName = process.argv[profileIndex + 1];
}
let incognito = false;
if (process.argv.includes('--incognito')) {
  incognito = true;
}
let headless = false;
if (process.argv.includes('--headless')) {
  headless = true;
}
let browser = 'chromium';
if (process.argv.includes('--browser')) {
  const browserIndex = process.argv.indexOf('--browser');
  browser = process.argv[browserIndex + 1];
  // bail out if browser is not supported
  if (!SUPPORTED_BROWSERS.includes(browser)) {
    console.error(`Error: Unsupported browser ${browser}`);
    console.error(`Supported browsers: ${SUPPORTED_BROWSERS.join(', ')}`);
    process.exit(1);
  }
}

// prepare profile directory, create if it doesn't exist
const profileDir = path.join(HOME_DIR, `.config/beachpatrol/profiles/${browser}/${profileName}`);
if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

const browserCommand = browser === 'chromium' ? chromium : firefox;

// prepare launch options and hide automation
const launchOptions = {
  headless: false,
  viewport: null, // Let browser decide viewport
  args: [], 
  ignoreDefaultArgs: ['--enable-automation'], // No "controlled by automation" infobar
};
if (process.env.XDG_SESSION_TYPE === 'wayland') {
  // If running on wayland, add the needed chromium wayland flag
  // Source: https://wiki.archlinux.org/title/Chromium#Force_GPU_acceleration
  launchOptions.args.push(...[
    '--ozone-platform-hint=auto',
    '--enable-features=AcceleratedVideoDecodeLinuxGL',
    '--use-gl=angle',
    '--use-angle=vulkan',
  ]);
};

// firefox uses "puppeteer-extra-plugin-stealth" because "patchright" doesn't support firefox
if (browser === 'firefox') {
  browserCommand.use(StealthPlugin());
}

if (incognito) {
  if (browser === 'chromium') {
    launchOptions.args.push('--incognito');
  } else if (browser === 'firefox') {
    launchOptions.args.push('-private-window');
  }
}

const cleanup = () => {
  console.log('Cleaning up and shutting down...');
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
    console.log(`  - Socket file ${SOCKET_PATH} removed`);
  }
  if (server) {
    server.close();
    console.log('  - Server closed');
  }
  process.exit(0);
};

// Launch browser with specified profile and args
let browserContext;
if (incognito) {
  const browser = await browserCommand.launch(launchOptions);
  browserContext = await browser.newContext();
  // the 'launch' method does not open a page by default, so we need to open one
  await browserContext.newPage();
} else {
  browserContext = await browserCommand.launchPersistentContext(profileDir, launchOptions);
}

// cleanup on browser close
browserContext.on('close', () => {
  console.log('Browser context closed.');
  cleanup();
});

// get directory for downloaded files
const DOWNLOAD_DIR = process.env.XDG_DOWNLOAD_DIR || path.join(HOME_DIR, 'Downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Handler for file downloads.
// - By default, Playwright intercepts native downloads and stores the files with UUID names
//   in the /tmp folder which is deleted after closing the browser.
// - To get a close-to-native behavior, we use our own download handler.
const handleDownload = async (download) => {
  const filename = download.suggestedFilename();
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

  console.log(`Attempting to download: ${filename} (as ${filename}) to ${DOWNLOAD_DIR}`);
  try {
    await download.saveAs(savePath);
    console.log(`  - Successfully downloaded: ${savePath}`);
  } catch (error) {
    console.error(`  - Failed to download: ${error.message}`);
  }
}

// As the download event is triggered by Page objects, we need to attach our handler to existing
// and new pages.
browserContext.pages().forEach(page => {
  page.on('download', handleDownload);
});
browserContext.on('page', async (page) => {
  page.on('download', handleDownload);
});

// prepare UNIX socket to listen for commands
const DATA_DIR = process.env.XDG_DATA_HOME || path.join(HOME_DIR, '.local/share');
const SOCKET_DIR = `${DATA_DIR}/beachpatrol`;
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
}
const SOCKET_PATH = `${SOCKET_DIR}/beachpatrol.sock`;
if (fs.existsSync(SOCKET_PATH)) {
  fs.unlinkSync(SOCKET_PATH);
}

// Listen for commands
const server = createServer((socket) => {
  socket.on('data', async (data) => {
    const message = data.toString().trim().split(' '); // Splitting message into parts
    const [commandName, ...args] = message;
    const COMMANDS_DIR = 'commands';
    const projectRoot = new URL('.', import.meta.url).pathname;
    const commandFilePath = path.join(projectRoot, COMMANDS_DIR, `${commandName}.js`);

    // log command
    console.log(`Received command: ${commandName} ${args.join(' ')}`);

    // Check if command script exists.
    if (!fs.existsSync(commandFilePath)) {
      const ERROR_MESSAGE = `Error: Command script ${commandName}.js does not exist.`;
      console.log(ERROR_MESSAGE);
      socket.write(`${ERROR_MESSAGE}\n`);
    } else {
      // Import and run the command
      try {
        // import with a timestamp to avoid caching
        const modulePath = path.resolve(commandFilePath);
        const {default: command} = await import(`${modulePath}?t=${Date.now()}`);

        await command(browserContext, ...args);
        const SUCCESS_MESSAGE = 'Command executed successfully.';
        console.log(SUCCESS_MESSAGE);
        socket.write(`${SUCCESS_MESSAGE}\n`);
      } catch (error) {
        const ERROR_MESSAGE = `Error: Failed to execute command. ${error.message}`;
        console.log(ERROR_MESSAGE);
        socket.write(`${ERROR_MESSAGE}\n`);
      }
    }
  });
});

server.listen(SOCKET_PATH);
console.log(`beachpatrol listening on ${SOCKET_PATH}`);

// Handle process termination signals
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\nReceived termination signal: ${sig}`);
    cleanup();
  });
}
