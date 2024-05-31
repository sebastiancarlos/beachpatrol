#!/usr/bin/env node

import { chromium, firefox } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs';
import { createServer } from 'net';
import path from 'path';
import { URL } from 'url';

const HOME_DIR = process.env.HOME;
if (!HOME_DIR) {
  throw new Error('HOME environment variable not set.');
}

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
  // if running on wayland, add the needed chromium wayland flag
  launchOptions.args.push('--ozone-platform-hint=wayland');
};
browserCommand.use(StealthPlugin());

if (incognito) {
  if (browser === 'chromium') {
    launchOptions.args.push('--incognito');
  } else if (browser === 'firefox') {
    launchOptions.args.push('-private-window');
  }
}

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

// prepare UNIX socket to listen for commands
const SOCKET_PATH = '/tmp/beachpatrol.sock';
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
        const {default: command} = await import(path.resolve(commandFilePath));
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
