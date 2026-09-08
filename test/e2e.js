import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, exec as execCallback } from "node:child_process";
import { once, on } from "node:events";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const exec = promisify(execCallback);

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const BEACHPATROL_PATH = path.resolve(projectRoot, "..", "beachpatrol.js");
const BEACHMSG_PATH = path.resolve(projectRoot, "..", "beachmsg.js");

const SERVER_READY_MARKER = "beachpatrol listening on";
const SMOKE_TEST_RESULT = "Message is: Received!";

const SERVER_TIMEOUT = 8_000;

// If set, use browser in env var TEST_BROWSERS (used by CI)
const browser = process.env.TEST_BROWSER || "chromium";

// Test profiles are prefixed with "test-", so that they never touch a real profile
function testProfile(suffix) {
  return `test-${process.pid}-${suffix}`;
}

// Profile dir for a test profile
function testProfileDir(profile) {
  return path.join(
    os.homedir(),
    `.config/beachpatrol/profiles/${browser}/${profile}`,
  );
}

// Spawn a beachpatrol server that is killed on test cleanup, and resolve once
// it announces it is listening. Each server gets its own throwaway download
// dir (via XDG_DOWNLOAD_DIR).
function startServer(args, t) {
  const profile = args[args.indexOf("--profile") + 1];
  const downloadDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "beachpatrol-test-downloads-"),
  );
  const beachpatrolProcess = spawn("node", [
    BEACHPATROL_PATH,
    "--headless",
    "--browser",
    browser,
    ...args,
  ], {
    env: { ...process.env, XDG_DOWNLOAD_DIR: downloadDir },
  });

  let exitExpected = false;
  t.after(async () => {
    exitExpected = true;
    // SIGTERM triggers cleanup() (server removes its own socket).
    beachpatrolProcess.kill("SIGTERM");

    // wait for exit before removing dirs
    if (beachpatrolProcess.exitCode === null) {
      await once(beachpatrolProcess, "exit");
    }

    // Remove leftover test dirs.
    for (const dir of [testProfileDir(profile), downloadDir]) {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 100,
        retryDelay: 200,
      });
    }
  });

  // accumulate stdout
  const serverStdout = [];
  beachpatrolProcess.stdout.on("data", (data) => {
    serverStdout.push(data.toString());
  });
  const readStdout = () => serverStdout.join("");

  // wait for expected output, or timeout, or unexpected exit
  let clearTimeoutId;
  const waitForReady = Promise.race([
    (async () => {
      for await (const data of on(beachpatrolProcess.stdout, "data")) {
        if (data.toString().includes(SERVER_READY_MARKER)) {
          return;
        }
      }
    })(),
    (async () => {
      await new Promise((resolve) => {
        clearTimeoutId = setTimeout(resolve, SERVER_TIMEOUT);
      });
      throw new Error("Timeout waiting for server ready.");
    })(),
    (async () => {
      await once(beachpatrolProcess, "exit");
      if (!exitExpected) {
        throw new Error("Beachpatrol process exited unexpectedly");
      }
    })(),
  ]).finally(() => clearTimeout(clearTimeoutId));

  return { beachpatrolProcess, waitForReady, readStdout, downloadDir };
}

test("Beachpatrol E2E Smoke Test", async (t) => {
  console.log(">>> Starting beachpatrol server for test...");
  const profile = testProfile("smoke");
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  // Run the beachmsg
  console.log("   Running beachmsg smoke-test...");
  const clientResult = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} smoke-test`,
  );

  // Check beachmsg output
  assert.strictEqual(
    clientResult.stderr,
    "",
    "beachmsg stderr should be empty.",
  );
  assert.ok(
    clientResult.stdout.includes(SMOKE_TEST_RESULT),
    `Expected beachmsg stdout to include the smoke-test result: "${SMOKE_TEST_RESULT}"`,
  );
  console.log("   beachmsg output OK.");
});

test("Beachpatrol E2E Command Error Propagation", async (t) => {
  console.log(">>> Starting beachpatrol server for test...");
  const profile = testProfile("err");
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  // Throwaway command that always throws
  const COMMANDS_DIR = path.resolve(projectRoot, "..", "commands");
  const throwCommandPath = path.join(COMMANDS_DIR, "error-test.js");
  fs.writeFileSync(
    throwCommandPath,
    'export default async () => { throw new Error("kaboom"); };\n',
  );
  t.after(() => {
    fs.rmSync(throwCommandPath, { force: true });
  });

  console.log("   Running beachmsg error-test...");
  const clientResult = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} error-test`,
  ).catch((err) => err);

  assert.strictEqual(
    clientResult.code,
    1,
    "beachmsg should exit with code 1 on a command error.",
  );
  assert.strictEqual(
    clientResult.stdout,
    "",
    "beachmsg stdout should be empty on a command error.",
  );
  assert.ok(
    clientResult.stderr.includes("Error: kaboom"),
    "beachmsg stderr should carry the command error.",
  );
  console.log("   error propagation OK.");
});

test("Beachpatrol E2E Plain Function Command", async (t) => {
  console.log(">>> Starting beachpatrol server for test...");
  const profile = testProfile("plain");
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  // A plain (non-generator) function returning a string must be written as a
  // single value.
  const COMMANDS_DIR = path.resolve(projectRoot, "..", "commands");
  const plainCommandPath = path.join(COMMANDS_DIR, "plain-test.js");
  fs.writeFileSync(
    plainCommandPath,
    'export default async () => "single-value-output";\n',
  );
  t.after(() => {
    fs.rmSync(plainCommandPath, { force: true });
  });

  console.log("   Running beachmsg plain-test...");
  const clientResult = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} plain-test`,
  );

  assert.strictEqual(
    clientResult.stdout,
    "single-value-output\n",
    "plain function return value should be written as a single line.",
  );
  assert.strictEqual(
    clientResult.stderr,
    "",
    "beachmsg stderr should be empty for a successful command.",
  );
  console.log("   plain function output OK.");
});

test("Beachpatrol E2E Download Mechanic", async (t) => {
  console.log(">>> Starting beachpatrol server and download fixture for test...");
  const profile = testProfile("dl");

  // Simple local HTTP server serving an HTML page with two download buttons.
  // The command presses the first one twice, so the second download of the
  // same file exercises the filename-collision path in the custom handler.
  const FILES = new Map([
    ["alpha.txt", "alpha contents"],
    ["beta.txt", "beta contents"],
  ]);
  const httpServer = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<button id="alpha" onclick="location.href='/alpha.txt'">alpha</button>
<button id="beta" onclick="location.href='/beta.txt'">beta</button>`,
      );
      return;
    }
    const body = FILES.get(req.url.slice(1));
    if (body === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(body);
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => httpServer.close());
  const fixtureUrl = `http://127.0.0.1:${httpServer.address().port}/`;

  const { waitForReady, downloadDir } = startServer(["--profile", profile], t);
  await waitForReady;

  // Throwaway command: open the fixture page and trigger three downloads by
  // pressing the two buttons, one of them twice (the repeat is what hits the
  // filename-collision path in the custom download handler).
  const COMMANDS_DIR = path.resolve(projectRoot, "..", "commands");
  const downloadCommandPath = path.join(COMMANDS_DIR, "download-test.js");
  fs.writeFileSync(
    downloadCommandPath,
    `export default async ({ context }, url) => {
  const page = await context.newPage();
  await page.goto(url);
  for (const id of ["#alpha", "#beta", "#alpha"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(id).click(),
    ]);
    await download.path();
  }
};\n`,
  );
  t.after(() => {
    fs.rmSync(downloadCommandPath, { force: true });
  });

  console.log("   Running beachmsg download-test...");
  await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} download-test ${fixtureUrl}`,
  );

  // The handler renames to "suggestedFilename()" and, on collision, appends
  // " (1)", " (2)", etc. Poll for the downloaded files to appear.
  const waitForFile = async (name) => {
    const expected = path.join(downloadDir, name);
    for (let i = 0; i < 40; i++) {
      if (fs.existsSync(expected)) return expected;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Downloaded file not found: ${name}`);
  };
  assert.ok(
    fs.readFileSync(await waitForFile("alpha.txt"), "utf-8").includes("alpha contents"),
    "First alpha.txt download should be saved with its suggested filename.",
  );
  assert.ok(
    fs.readFileSync(await waitForFile("alpha (1).txt"), "utf-8").includes("alpha contents"),
    "Second alpha.txt download should be renamed with a collision counter.",
  );
  assert.ok(
    fs.readFileSync(await waitForFile("beta.txt"), "utf-8").includes("beta contents"),
    "beta.txt download should be saved with its suggested filename.",
  );
  console.log("   download mechanic OK.");
});

test("Beachpatrol E2E Concurrent Routing", async (t) => {
  console.log(">>> Starting two beachpatrol servers for test...");
  const profileA = testProfile("a");
  const profileB = testProfile("b");
  const serverA = startServer(["--profile", profileA], t);
  await serverA.waitForReady;
  const serverB = startServer(["--profile", profileB], t);
  await serverB.waitForReady;

  // Send smoke-test to A and verify only A receives it. Routing is proven by
  // the per-server "Received command" marker.
  console.log("   Routing smoke-test to server A...");
  const resultA = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profileA} smoke-test`,
  );
  assert.ok(
    serverA.readStdout().includes("Received command: smoke-test"),
    "server A should receive the command",
  );
  assert.ok(
    !serverB.readStdout().includes("Received command: smoke-test"),
    "server B should not receive A's command",
  );
  assert.ok(
    resultA.stdout.includes(SMOKE_TEST_RESULT),
    `Expected beachmsg stdout to include the smoke-test result: "${SMOKE_TEST_RESULT}"`,
  );

  // Route smoke-test to B and verify only B receives it.
  console.log("   Routing smoke-test to server B...");
  const resultB = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profileB} smoke-test`,
  );
  assert.ok(
    serverB.readStdout().includes("Received command: smoke-test"),
    "server B should receive the command",
  );
  assert.ok(
    resultB.stdout.includes(SMOKE_TEST_RESULT),
    `Expected beachmsg stdout to include the smoke-test result: "${SMOKE_TEST_RESULT}"`,
  );
});

test("Beachpatrol E2E Refuses Duplicate Instance", async (t) => {
  console.log(">>> Starting beachpatrol server for test...");
  const profile = testProfile("dup");
  const { waitForReady, readStdout } = startServer(["--profile", profile], t);
  await waitForReady;

  // A second instance for the same slot must refuse to bind, before launching
  // a browser, and leave the running instance untouched.
  const second = await exec(
    `node "${BEACHPATROL_PATH}" --headless --browser ${browser} --profile ${profile}`,
  ).catch((err) => err);
  assert.strictEqual(second.code, 1, "second instance should exit with code 1");
  assert.ok(
    second.stderr.includes(`already running for ${browser}-${profile}`),
    "stderr should report the occupied slot",
  );

  // The original instance is still serving.
  await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} smoke-test`,
  );
  assert.ok(
    readStdout().includes("Received command: smoke-test"),
    "original instance should still receive commands",
  );
});

test("Beachpatrol E2E beachmsg Missing Server", async (t) => {
  const profile = testProfile("noserver");
  const result = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} smoke-test`,
  ).catch((err) => err);

  assert.strictEqual(result.code, 1, "beachmsg should exit with code 1");
  assert.ok(
    result.stderr.includes(
      "Could not connect to the beachpatrol socket. Have you started beachpatrol?",
    ),
    "stderr should explain that the server is not running",
  );
  assert.ok(
    !result.stderr.includes("Unhandled 'error' event"),
    "beachmsg should not crash with an unhandled error",
  );
  console.log("   missing server gone... OK.");
});
