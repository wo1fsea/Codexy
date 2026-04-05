import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const playwrightWebPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "3100");
const playwrightBaseUrl = `http://127.0.0.1:${playwrightWebPort}`;
const shouldReuseExistingServer =
  process.env.CI !== "true" &&
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "false";
const repoManagedPaths = [
  path.join(repoRoot, "next-env.d.ts"),
  path.join(repoRoot, "tsconfig.json")
];

function captureManagedFile(filePath) {
  if (!existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      contents: null
    };
  }

  return {
    filePath,
    exists: true,
    contents: readFileSync(filePath, "utf8")
  };
}

function restoreManagedFiles(snapshots) {
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      rmSync(snapshot.filePath, { force: true });
      continue;
    }

    writeFileSync(snapshot.filePath, snapshot.contents, "utf8");
  }
}

function isReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve((response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 500);
    });

    request.on("error", () => {
      resolve(false);
    });

    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReady(url)) {
      return true;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  return false;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("close", onClose);
      child.off("error", onError);
    }

    function onExit() {
      cleanup();
      resolve(true);
    }

    function onClose() {
      cleanup();
      resolve(true);
    }

    function onError() {
      cleanup();
      resolve(true);
    }

    child.on("exit", onExit);
    child.on("close", onClose);
    child.on("error", onError);
  });
}

async function stopManagedServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {}

  if (await waitForExit(child, 5000)) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  try {
    child.kill("SIGKILL");
  } catch {}
}

async function main() {
  const managedSnapshots = repoManagedPaths.map(captureManagedFile);
  const managedEnv = {
    ...process.env,
    PLAYWRIGHT_DISABLE_WEBSERVER: "true",
    PLAYWRIGHT_REUSE_EXISTING_SERVER: "true",
    PLAYWRIGHT_WEB_PORT: String(playwrightWebPort)
  };

  let managedServer = null;

  try {
    const ready = shouldReuseExistingServer && (await isReady(playwrightBaseUrl));
    if (!ready) {
      managedServer = spawn(
        process.execPath,
        [path.join("scripts", "next-dev.mjs"), "--hostname", "127.0.0.1", "--port", String(playwrightWebPort)],
        {
          cwd: repoRoot,
          env: managedEnv,
          stdio: "inherit",
          shell: false
        }
      );

      const serverReady = await waitForReady(playwrightBaseUrl, 120_000);
      if (!serverReady) {
        throw new Error(`Playwright dev server did not become ready at ${playwrightBaseUrl}.`);
      }
    }

    const playwright = spawn(
      process.execPath,
      [playwrightCli, "test", ...process.argv.slice(2)],
      {
        cwd: repoRoot,
        env: managedEnv,
        stdio: "inherit",
        shell: false
      }
    );

    const exitCode = await new Promise((resolve, reject) => {
      playwright.on("error", reject);
      playwright.on("close", (code) => {
        resolve(code ?? 1);
      });
    });

    process.exitCode = exitCode;
  } finally {
    await stopManagedServer(managedServer);
    restoreManagedFiles(managedSnapshots);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
