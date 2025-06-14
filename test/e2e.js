import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, exec as execCallback } from "node:child_process";
import { once, on } from "node:events";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execCallback);

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const BEACHPATROL_PATH = path.resolve(projectRoot, "..", "beachpatrol.js");
const BEACHMSG_PATH = path.resolve(projectRoot, "..", "beachmsg.js");

const SERVER_READY_MARKER = "beachpatrol listening on";
const BEACHMSG_EXPECTED_STDOUT = "Command executed successfully.";

const SERVER_TIMEOUT = 8_000;

test("Beachpatrol E2E Smoke Test", async (t) => {
  console.log(">>> Starting beachpatrol server for test...");
  const beachpatrolProcess = spawn("node", [
    BEACHPATROL_PATH,
    "--headless",
    "--incognito",
    "--browser",
    "chromium",
  ]);

  // on cleanup, kill process and notify handlers with flag
  let exitExpected = false;
  t.after(() => {
    console.log(">>> Cleaning up beachpatrol server...");
    exitExpected = true;
    beachpatrolProcess.kill("SIGKILL");
  });

  // wait for expected output, or timout, or unexpected exit
  let clearTimeoutId;
  try {
    await Promise.race([
      (async () => {
        for await (const data of on(beachpatrolProcess.stdout, "data")) {
          if (data.toString().includes(SERVER_READY_MARKER)) {
            console.log(">>> Beachpatrol server started successfully.");
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
    ]);
  } finally {
    clearTimeout(clearTimeoutId);
  }

  // Run the client command
  console.log("   Running beachmsg smoke-test...");
  let clientResult;
  try {
    clientResult = await exec(`node "${BEACHMSG_PATH}" smoke-test`);
  } catch (err) {
    throw err;
  }

  // Check beachmsg (client) output
  assert.strictEqual(
    clientResult.stderr,
    "",
    "beachmsg stderr should be empty.",
  );
  assert.ok(
    clientResult.stdout.includes(BEACHMSG_EXPECTED_STDOUT),
    `Expected beachmsg stdout to include: "${BEACHMSG_EXPECTED_STDOUT}"`,
  );
  console.log("   beachmsg output OK.");
});
