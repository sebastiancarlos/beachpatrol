#!/usr/bin/env node

import { connect } from "net";
import { createInterface } from "readline";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HOME_DIR = os.homedir();
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

const ERROR_SENTINEL = "BEACHPATROL_ERROR:";

const DATA_HOME =
  process.env.XDG_DATA_HOME || path.join(HOME_DIR, ".local/share");
const DATA_DIR = `${DATA_HOME}/beachpatrol`;
const SOCKET_DIR = DATA_DIR;
const USER_COMMANDS_DIR = `${DATA_DIR}/commands`;
const PROJECT_COMMANDS_DIR = `${PROJECT_ROOT}/commands`;
const isWindows = process.platform === "win32";

// Endpoint for an instance, given its socket name (`<browser>-<profile>[-incognito]`).
const instanceEndpoint = (socketName) =>
  isWindows
    ? String.raw`\\.\pipe\beachpatrol-${socketName}`
    : `${SOCKET_DIR}/${socketName}.sock`;


// Error thrown by sendCommand. `kind` classifies the failure
// "timeout" the server accepted but never finished within timeout
// "error"   the server replied with an error (sentinel line)
// "dead"    the socket cannot be reached
class CommandError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// Connect to an instance endpoint, send a command, and stream the output
// lines as an async generator. Each yield is one output line as it arrives.
// A failure throws a CommandError.
const sendCommand = async function* (endpoint, command, { timeout } = {}) {
  const client = connect(endpoint, () => {
    client.write(JSON.stringify(command));
  });
  const rl = createInterface({ input: client });

  // Stop iteration after timeout, if any.
  let timedOut = false;
  let timer;
  if (timeout) {
    timer = setTimeout(() => {
      timedOut = true;
      rl.close();
    }, timeout);
  }

  try {
    for await (const line of rl) {
      if (line.startsWith(ERROR_SENTINEL)) {
        throw new CommandError("error", line.slice(ERROR_SENTINEL.length).trim());
      }
      yield line;
    }
    if (timedOut) {
      throw new CommandError("timeout", "timed out");
    }
  } catch (error) {
    if (error instanceof CommandError) throw error;
    // A connect/read failure on a live or dead socket.
    throw new CommandError("dead", error.message);
  } finally {
    clearTimeout(timer);
    client.destroy();
  }
};

// if --help/-h, print usage
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: beachmsg [ROUTE FLAGS] <command> [args...]

- Sends a command to the beachpatrol server controlling the browser.
- Commands live in the user commands home ($XDG_DATA_HOME/beachpatrol/commands/)
  or the bundled "commands" directory of beachpatrol.

ROUTE FLAGS:
  --browser <name>          Target browser. Default: chromium
      Supported browsers: chromium, firefox
  --profile <name>          Target profile. Default: default
  --incognito               Target the incognito instance.

Options:
  --list                    List all running instances and their open tabs.
  --help                    Show this help message.
  --version                 Show version.
`.trimStart());
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

// if --list, list all running instances and their open tabs, then exit.
// Route flags are ignored when --list is present.
if (process.argv.includes("--list")) {
  let instanceNames = [];
  try {
    if (isWindows) {
      instanceNames = fs
        .readdirSync("\\\\.\\pipe\\")
        .filter((p) => p.startsWith("beachpatrol-"))
        .map((p) => p.slice("beachpatrol-".length));
    } else {
      instanceNames = fs
        .readdirSync(SOCKET_DIR)
        .filter((f) => f.endsWith(".sock"))
        .map((f) => f.slice(0, -".sock".length));
    }
  } catch {
    // SOCKET_DIR maybe does not exist yet. There is nothing to list.
  }
  instanceNames.sort();

  if (instanceNames.length === 0) {
    console.log("No instances running.");
    process.exit(0);
  }

  // Ask each instance (concurrently) to list its tabs, keeping each result
  // bound to its instance.
  const listTabsFor = async (name) => {
    const lines = [];
    try {
      for await (const line of sendCommand(instanceEndpoint(name), ["list-tabs"], {
        timeout: 5000,
      })) {
        lines.push(line);
      }
      return { kind: "ok", lines };
    } catch (error) {
      return error.kind === "dead"
        ? { kind: "dead" }
        : { kind: "error", message: error.message };
    }
  };

  const instances = await Promise.all(
    instanceNames.map(async (name) => ({
      name,
      result: await listTabsFor(name),
    })),
  );

  // Header for an instance, from its socket name (`<browser>-<profile>[-incognito]`).
  const getInstanceHeader = (socketName) => {
    const [, browserName, profile, incognito] =
      socketName.match(/^([^-]+)-(.+?)(-incognito)?$/);
    return `BROWSER: ${browserName}, PROFILE: ${profile}${incognito ? " (incognito)" : ""}`;
  };

  for (const { name, result } of instances) {
    console.log(getInstanceHeader(name));
    if (result.kind === "ok") {
      console.log(result.lines.length ? result.lines.join("\n") : "(no tabs)");
    } else if (result.kind === "dead") {
      console.log("(not running)");
    } else {
      console.log(`(error: ${result.message})`);
    }
    console.log();
  }
  process.exit(0);
}

// Parse routing flags
let browser = "chromium";
let profileName = "default";
let incognito = false;
let i = 2;
while (i < process.argv.length) {
  if (process.argv[i] === "--browser") {
    browser = process.argv[++i];
  } else if (process.argv[i] === "--profile") {
    profileName = process.argv[++i];
  } else if (process.argv[i] === "--incognito") {
    incognito = true;
  } else {
    // Everything from here on is the command and its args.
    break;
  }
  i++;
}

// extract command and args
const [commandName, ...args] = process.argv.slice(i);

// if there are no arguments, bail out
if (!commandName) {
  console.error("Error: No command specified.");
  process.exit(1);
}

// Check if command script exists.
const commandFiles = [
  path.join(USER_COMMANDS_DIR, `${commandName}.js`),
  path.join(PROJECT_COMMANDS_DIR, `${commandName}.js`),
];
if (!commandFiles.some(fs.existsSync)) {
  console.error(`Error: Command script ${commandName}.js does not exist.`);
  process.exit(1);
}

// Send command and args, streaming lines to stdout as they arrive (so
// generator commands show progress), and report the outcome.
const socketName = `${browser}-${profileName}${incognito ? "-incognito" : ""}`;
const endpoint = instanceEndpoint(socketName);
try {
  for await (const line of sendCommand(endpoint, [commandName, ...args])) {
    process.stdout.write(`${line}\n`);
  }
} catch (error) {
  if (error.kind === "dead") {
    console.error(
      "Error: Could not connect to the beachpatrol socket. Have you started beachpatrol?",
    );
    process.exit(1);
  }
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
