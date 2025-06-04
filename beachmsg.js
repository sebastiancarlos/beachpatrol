#!/usr/bin/env node

import { connect } from 'net';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const DATA_DIR = process.env.XDG_DATA_HOME || path.join(HOME_DIR, '.local/share');
const SOCKET_PATH = `${DATA_DIR}/beachpatrol/beachpatrol.sock`;

// if there are no arguments, bail out
if (process.argv.length < 3) {
  console.error('Error: No command specified.');
  process.exit(1);
}

const [,, commandName, ...args] = process.argv;

// Check if command script exists
const COMMANDS_DIR = 'commands';
const projectRoot = new URL('.', import.meta.url).pathname;
const commandFilePath = path.join(projectRoot, COMMANDS_DIR, `${commandName}.js`);
if (!fs.existsSync(commandFilePath)) {
  console.error(`Error: Command script ${commandName}.js does not exist.`);
  process.exit(1);
}

// Send command and args
let endpoint;
if (process.platform !== "win32") {
  const DATA_DIR = process.env.XDG_DATA_HOME || path.join(process.env.HOME, ".local/share");
  endpoint = `${DATA_DIR}/beachpatrol/beachpatrol.sock`;
} else {
  endpoint = String.raw`\\.\pipe\beachpatrol`;
}
const client = connect(endpoint, () => {
  client.write([commandName, ...args].join(' ')); 
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
