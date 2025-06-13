#!/usr/bin/env node

import { connect } from 'net';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// if --help/-h, print usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: beachmsg <command> [args...]');
  console.log();
  console.log('Sends a command to the beachpatrol server controlling the browser.');
  console.log('The provided command must exist in the "commands" directory of beachpatrol.');
  console.log();
  console.log('Options:');
  console.log('  --help                    Show this help message');
  console.log();
  process.exit(0);
}

// if there are no arguments, bail out
if (process.argv.length < 3) {
  console.error('Error: No command specified.');
  process.exit(1);
}

const [,, commandName, ...args] = process.argv;

// Check if command script exists
const COMMANDS_DIR = 'commands';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const commandFilePath = path.join(projectRoot, COMMANDS_DIR, `${commandName}.js`);
if (!fs.existsSync(commandFilePath)) {
  console.error(`Error: Command script ${commandName}.js does not exist.`);
  process.exit(1);
}

// Send command and args
let endpoint;
if (process.platform !== "win32") {
  const HOME_DIR = os.homedir();
  const DATA_DIR = process.env.XDG_DATA_HOME || path.join(HOME_DIR, ".local/share");
  endpoint = `${DATA_DIR}/beachpatrol/beachpatrol.sock`;
} else {
  endpoint = String.raw`\\.\pipe\beachpatrol`;
}
const client = connect(endpoint, () => {
  client.write(JSON.stringify([commandName, ...args])); 
});

client.on('data', (data) => {
  process.stdout.write(data.toString());
  client.end(); // End connection after response is received
});

client.on('error', (err) => {
  console.error(`Error: Could not connect to the beachpatrol socket. ${err.message}`);
  console.log('Have you started beachpatrol?');
  process.exit(1);
});
