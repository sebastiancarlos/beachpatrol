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

// Create a tmp folder to act as the XDG_DATA_HOME location for the duration of a test.
// Override XDG_DATA_HOME env var with it, and return path.
function isolateDataHome(t) {
  const dataHome = fs.mkdtempSync(path.join(os.tmpdir(), "bp-"));
  const old = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = dataHome;
  t.after(() => {
    if (old === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = old;
    }
    fs.rmSync(dataHome, {
      recursive: true,
      force: true,
      maxRetries: 100,
      retryDelay: 200,
    });
  });
  return dataHome;
}

// Get the user commands dir, for a given XDG_DATA_HOME folder
function userCommandsDir(dataHome) {
  return path.join(dataHome, "beachpatrol", "commands");
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

  // accumulate stdout and stderr
  const serverStdout = [];
  beachpatrolProcess.stdout.on("data", (data) => {
    serverStdout.push(data.toString());
  });
  const readStdout = () => serverStdout.join("");
  const serverStderr = [];
  beachpatrolProcess.stderr.on("data", (data) => {
    serverStderr.push(data.toString());
  });

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
      const [code, signal] = await once(beachpatrolProcess, "exit");
      if (!exitExpected) {
        const stderr = serverStderr.join("").trim();
        throw new Error(
          `Beachpatrol process exited unexpectedly ` +
            `(code ${code}, signal ${signal})${stderr ? `: ${stderr}` : ""}`,
        );
      }
    })(),
  ]).finally(() => clearTimeout(clearTimeoutId));

  return { beachpatrolProcess, waitForReady, readStdout, downloadDir };
}

test("Beachpatrol E2E Smoke Test", async (t) => {
  console.log(">>> Starting beachpatrol server for test...");
  const profile = testProfile("smoke");
  isolateDataHome(t);
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
  const dataHome = isolateDataHome(t);
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  // Throwaway command: always throws.
  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
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
  const dataHome = isolateDataHome(t);
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  // A plain (non-generator) function returning a string must be written as a
  // single value.
  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
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
  const dataHome = isolateDataHome(t);

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

  // Throwaway command: open the fixture page and trigger three downloads 
  // by pressing the two buttons, one of them twice (the repeat is what hits 
  // the filename-collision path in the custom download handler).
  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
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
  isolateDataHome(t);
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
  isolateDataHome(t);
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
  isolateDataHome(t);
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

test("Beachpatrol E2E beachmsg Unknown Command", async (t) => {
  isolateDataHome(t);
  const result = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${testProfile("nope")} ayy`,
  ).catch((err) => err);

  assert.strictEqual(result.code, 1, "beachmsg should exit with code 1");
  assert.strictEqual(
    result.stdout,
    "",
    "beachmsg stdout should be empty for an unknown command",
  );
  assert.ok(
    result.stderr.includes("Error: Command script ayy does not exist."),
    "stderr should report the unknown command",
  );
  console.log("   unknown command OK.");
});

test("Beachpatrol E2E beachmsg No Command", async (_) => {
  const invocations = ["", "--profile foo"];

  for (const args of invocations) {
    const result = await exec(
      `node "${BEACHMSG_PATH}" ${args}`.trim(),
    ).catch((err) => err);
    assert.strictEqual(
      result.code,
      1,
      `beachmsg with args "${args}" should exit with code 1`,
    );
    assert.strictEqual(
      result.stdout,
      "",
      `beachmsg with args "${args}" should not write to stdout`,
    );
    assert.ok(
      result.stderr.includes("Error: No command specified."),
      `beachmsg with args "${args}" should report the missing command`,
    );
  }
  console.log("   no command OK.");
});

test("Beachpatrol E2E User Command Shadows Bundled", async (t) => {
  console.log(">>> Starting beachpatrol server for shadow test...");
  const profile = testProfile("shadow");
  const dataHome = isolateDataHome(t);
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  // A user command named like a bundled one must win resolution.
  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  const shadowPath = path.join(COMMANDS_DIR, "smoke-test.js");
  fs.writeFileSync(shadowPath, 'export default async () => "shadowed-by-user";\n');
  t.after(() => {
    fs.rmSync(shadowPath, { force: true });
  });

  console.log("   Running beachmsg smoke-test (shadowed)...");
  const clientResult = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} smoke-test`,
  );

  assert.ok(
    clientResult.stdout.includes("shadowed-by-user"),
    "the user command should shadow the bundled one",
  );
  assert.ok(
    !clientResult.stdout.includes(SMOKE_TEST_RESULT),
    "the bundled smoke-test must not run when shadowed",
  );
  console.log("   shadowing OK.");
});

test("Beachpatrol E2E User Command in TypeScript", async (t) => {
  // Native type stripping (Node >=22.18.0) is what makes .ts commands run.
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 18)) {
    t.skip("native TS type stripping needs Node >=22.18.0");
    return;
  }

  console.log(">>> Starting beachpatrol server for TypeScript test...");
  const profile = testProfile("ts");
  const dataHome = isolateDataHome(t);
  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  const tsCommandPath = path.join(COMMANDS_DIR, "ts-test.ts");
  fs.writeFileSync(
    tsCommandPath,
    'export default async (): Promise<string> => "ts-works";\n',
  );
  t.after(() => {
    fs.rmSync(tsCommandPath, { force: true });
  });

  console.log("   Running beachmsg ts-test...");
  const clientResult = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} ts-test`,
  );

  assert.strictEqual(
    clientResult.stdout,
    "ts-works\n",
    "a .ts command should run via native type stripping.",
  );
  assert.strictEqual(
    clientResult.stderr,
    "",
    "beachmsg stderr should be empty for a successful .ts command.",
  );
  console.log("   TypeScript command OK.");
});

test("Beachpatrol E2E User Command with Installed Dependency", async (t) => {
  console.log(">>> Starting beachpatrol server for dependency test...");
  const profile = testProfile("dep");
  const dataHome = isolateDataHome(t);

  // The user commands dir is an npm package that depends on a test helper
  // dependency. `npm pack` builds it offline into a tarball, then `npm install`
  // extracts it into node_modules as a real package directory. 
  // The command imports it, proving dependency resolution works from the command.
  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  const helperPkgDir = path.join(dataHome, "throwaway-helpers");
  fs.mkdirSync(helperPkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(helperPkgDir, "package.json"),
    '{"name": "throwaway-helpers", "version": "1.0.0", ' +
      '"type": "module", "main": "index.js"}\n',
  );
  fs.writeFileSync(
    path.join(helperPkgDir, "index.js"),
    'export const decorate = (s) => `deptest:${s}`;\n',
  );
  await exec("npm pack --silent", { cwd: helperPkgDir });
  const helperTarball = path.join(helperPkgDir, "throwaway-helpers-1.0.0.tgz");
  fs.writeFileSync(
    path.join(COMMANDS_DIR, "package.json"),
    JSON.stringify({
      name: "user-commands-dir",
      private: true,
      type: "module",
      dependencies: { "throwaway-helpers": `file:${helperTarball}` },
    }),
  );
  await exec(
    "npm install --no-audit --no-fund --ignore-scripts --loglevel=error",
    { cwd: COMMANDS_DIR, timeout: 30_000 },
  );

  // Now implement the actual command usind the dependency
  const depCommandPath = path.join(COMMANDS_DIR, "dep-test.js");
  fs.writeFileSync(
    depCommandPath,
    'import { decorate } from "throwaway-helpers";\n' +
      'export default async () => decorate("ok");\n',
  );
  t.after(() => {
    fs.rmSync(depCommandPath, { force: true });
  });

  const { waitForReady } = startServer(["--profile", profile], t);
  await waitForReady;

  console.log("   Running beachmsg dep-test...");
  const clientResult = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profile} dep-test`,
  );

  assert.strictEqual(
    clientResult.stdout,
    "deptest:ok\n",
    "the command should import and use its installed dependency.",
  );
  assert.strictEqual(
    clientResult.stderr,
    "",
    "beachmsg stderr should be empty for a successful command.",
  );
  console.log("   dependency resolution OK.");
});

test("Beachpatrol E2E beachmsg --list", async (t) => {
  const dataHome = isolateDataHome(t);

  // With an empty registry, --list reports no instances and still exits 0.
  const emptyResult = await exec(`node "${BEACHMSG_PATH}" --list`);
  assert.ok(
    emptyResult.stdout.includes("No instances running."),
    "empty --list should report no instances",
  );
  console.log("   empty --list OK.");

  // Local fixture page with a stable title, so the listing has something to show.
  const httpServer = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<title>list-tabs-fixture</title>");
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => httpServer.close());
  const fixtureUrl = `http://127.0.0.1:${httpServer.address().port}/`;

  // Throwaway command.
  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  const openCommandPath = path.join(COMMANDS_DIR, "list-open-test.js");
  fs.writeFileSync(
    openCommandPath,
    `export default async ({ context }, url) => {
  const page = await context.newPage();
  await page.goto(url);
};\n`,
  );
  t.after(() => {
    fs.rmSync(openCommandPath, { force: true });
  });

  console.log(">>> Starting two beachpatrol servers for --list test...");
  const profileA = testProfile("lista");
  const profileB = testProfile("listb");
  const serverA = startServer(["--profile", profileA], t);
  await serverA.waitForReady;
  const serverB = startServer(["--profile", profileB], t);
  await serverB.waitForReady;

  // Run command on instance A. Leave instance B untouched (it still has its default blank tab).
  console.log("   Opening a fixture tab in instance A...");
  await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile ${profileA} list-open-test ${fixtureUrl}`,
  );

  // --list must compose both instances, ignoring any route flags present.
  console.log("   Running beachmsg --list...");
  const result = await exec(
    `node "${BEACHMSG_PATH}" --browser ${browser} --profile nonsensical --list`,
  );

  const instanceAHdr = `BROWSER: ${browser}, PROFILE: ${profileA}`;
  const instanceBHdr = `BROWSER: ${browser}, PROFILE: ${profileB}`;
  assert.ok(
    result.stdout.includes(instanceAHdr),
    `stdout should include instance A header ${instanceAHdr}`,
  );
  assert.ok(
    result.stdout.includes(instanceBHdr),
    `stdout should include instance B header ${instanceBHdr}`,
  );
  // A's fixture tab is listed. B also appears (it always has its default blank tab)
  assert.ok(
    result.stdout.includes("list-tabs-fixture"),
    "stdout should include A's open tab title",
  );
  console.log("   --list OK.");
});

test("Beachpatrol E2E beachmsg --commands", async (t) => {
  const dataHome = isolateDataHome(t);

  const bundledResult = await exec(`node "${BEACHMSG_PATH}" --commands`);
  const bundledLines = bundledResult.stdout.trim().split("\n");
  assert.ok(bundledLines.includes("list-tabs"), "list-tabs should be listed");
  assert.ok(bundledLines.includes("smoke-test"), "smoke-test should be listed");
  console.log("   bundled commands OK.");

  const COMMANDS_DIR = userCommandsDir(dataHome);
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  fs.writeFileSync(path.join(COMMANDS_DIR, "zzz.js"), "export default () => {};\n");
  fs.writeFileSync(path.join(COMMANDS_DIR, "aaa.ts"), "export default () => {};\n");
  fs.writeFileSync(path.join(COMMANDS_DIR, "smoke-test.js"), "export default () => {};\n");
  fs.writeFileSync(path.join(COMMANDS_DIR, "not-a-command.txt"), "");
  t.after(() => {
    fs.rmSync(COMMANDS_DIR, { recursive: true, force: true });
  });

  const result = await exec(`node "${BEACHMSG_PATH}" --commands`);
  const lines = result.stdout.trim().split("\n");
  assert.ok(lines.includes("aaa"), "user .ts command should be listed");
  assert.ok(lines.includes("zzz"), "user command should be listed");
  assert.deepEqual(
    lines.filter((line) => line === "smoke-test"),
    ["smoke-test"],
    "user command should shadow the bundled one (listed once)",
  );
  assert.ok(!lines.includes("not-a-command"), "non-.js/.ts files should be ignored");
  assert.deepEqual(lines, [...lines].sort(), "commands should be sorted");
  console.log("   --commands OK.");
});
