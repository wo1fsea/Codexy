#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const runtimeKey = createHash("sha1").update(repoRoot).digest("hex").slice(0, 12);
const codexyHome = process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");
const stateDir = path.join(codexyHome, "state", runtimeKey);
const logDir = path.join(codexyHome, "logs");
const metadataPath = path.join(stateDir, "service.json");
const defaultPort =
  Number.parseInt(process.env.PORT ?? process.env.CODEXY_WEB_PORT ?? "3000", 10) || 3000;

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const result = {
    port: defaultPort
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--port") {
      const next = argv[index + 1];
      if (!next) {
        fail("Missing value for --port.");
      }

      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        fail(`Invalid port: ${next}`);
      }

      result.port = parsed;
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${current}`);
  }

  return result;
}

function ensureStateDir() {
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
}

function readMetadata() {
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
}

function writeMetadata(metadata) {
  ensureStateDir();
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function clearMetadata() {
  rmSync(metadataPath, { force: true });
}

function isProcessRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sanitizeRuntimeEnv(port) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || ".next-runtime",
    PORT: String(port)
  };

  for (const key of Object.keys(env)) {
    if (key === "TURBOPACK" || key === "NEXT_RUNTIME") {
      delete env[key];
      continue;
    }

    if (key.startsWith("__NEXT_") || key.startsWith("NEXT_PRIVATE_")) {
      delete env[key];
    }
  }

  return env;
}

function dependencyInstalled() {
  return existsSync(path.join(repoRoot, "node_modules", "next", "package.json"));
}

function buildRuntime(port) {
  const buildScript = path.join(repoRoot, "scripts", "next-build.mjs");
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: repoRoot,
    env: sanitizeRuntimeEnv(port),
    stdio: "inherit"
  });

  if (result.error) {
    fail(String(result.error));
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getNextBin() {
  const require = createRequire(import.meta.url);
  return require.resolve("next/dist/bin/next");
}

function httpGetStatus(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/api/status",
        timeout: 1000
      },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => {
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve({
            ok: (res.statusCode ?? 0) === 200,
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out."));
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "127.0.0.1");
  });
}

async function waitForReady(port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await httpGetStatus(port);
    if (status?.ok) {
      return true;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  return false;
}

function checkBinary(name, args = ["--version"]) {
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", [name, ...args].join(" ")], {
          stdio: "ignore",
          windowsHide: true
        })
      : spawnSync(name, args, {
          stdio: "ignore",
          windowsHide: true
        });

  return !result.error && result.status === 0;
}

function printCheck(kind, label, detail) {
  const prefix = kind === "ok" ? "OK" : kind === "warn" ? "WARN" : "FAIL";
  process.stdout.write(`${prefix} ${label}`);
  if (detail) {
    process.stdout.write(`: ${detail}`);
  }
  process.stdout.write("\n");
}

async function runDoctor() {
  let failures = 0;

  printCheck("ok", "repo", repoRoot);
  printCheck("ok", "node", process.version);

  if (checkBinary("npm")) {
    printCheck("ok", "npm", "available");
  } else {
    failures += 1;
    printCheck("fail", "npm", "not found on PATH");
  }

  if (dependencyInstalled()) {
    printCheck("ok", "dependencies", "installed");
  } else {
    failures += 1;
    printCheck(
      "fail",
      "dependencies",
      "node_modules is missing. Run `npm install` in this Codexy checkout."
    );
  }

  if (checkBinary(process.env.CODEXY_CODEX_BIN || "codex")) {
    printCheck("ok", "codex", "available");
  } else {
    failures += 1;
    printCheck("fail", "codex", "not found on PATH");
  }

  if (checkBinary(process.env.CODEXY_TAILSCALE_BIN || "tailscale")) {
    printCheck("ok", "tailscale", "available");
  } else {
    printCheck("warn", "tailscale", "not found on PATH");
  }

  const buildIdPath = path.join(repoRoot, ".next-runtime", "BUILD_ID");
  if (existsSync(buildIdPath)) {
    printCheck("ok", "runtime build", ".next-runtime is present");
  } else {
    printCheck("warn", "runtime build", "missing; `codexy start` will build before launching");
  }

  const metadata = readMetadata();
  if (metadata?.pid && isProcessRunning(metadata.pid)) {
    const health = await httpGetStatus(metadata.port);
    printCheck(
      health?.ok ? "ok" : "warn",
      "service",
      `running on http://127.0.0.1:${metadata.port} (${health?.ok ? "healthy" : "not yet healthy"})`
    );
  } else {
    printCheck("warn", "service", "not running");
  }

  process.exit(failures === 0 ? 0 : 1);
}

function serviceUrl(port) {
  return `http://127.0.0.1:${port}`;
}

async function stopPid(pid) {
  if (!isProcessRunning(pid)) {
    return;
  }

  try {
    process.kill(pid);
  } catch {}

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

async function runStart(argv) {
  const options = parseArgs(argv);
  const current = readMetadata();

  if (current?.pid && isProcessRunning(current.pid)) {
    if (current.port !== options.port) {
      fail(
        `Codexy is already running on port ${current.port}. Stop it before starting on port ${options.port}.`
      );
    }

    process.stdout.write(`Codexy is already running at ${serviceUrl(current.port)}.\n`);
    process.stdout.write(`Log file: ${current.logPath}\n`);
    process.exit(0);
  }

  clearMetadata();

  if (!dependencyInstalled()) {
    fail(
      "Codexy dependencies are not installed.\nRun `cd repos/codexy-app && npm install` and retry."
    );
  }

  if (!(await isPortAvailable(options.port))) {
    fail(`Port ${options.port} is already in use. Choose another port or stop the existing listener.`);
  }

  if (!checkBinary(process.env.CODEXY_CODEX_BIN || "codex")) {
    process.stdout.write("WARN codex not found on PATH. The web UI may start, but bridge features will fail.\n");
  }

  buildRuntime(options.port);
  ensureStateDir();

  const logPath = path.join(logDir, `codexy-${runtimeKey}-${options.port}-${Date.now()}.log`);
  const logFd = openSync(logPath, "w");
  const child = spawn(
    process.execPath,
    [getNextBin(), "start", "--hostname", "0.0.0.0", "--port", String(options.port)],
    {
      cwd: repoRoot,
      detached: true,
      env: sanitizeRuntimeEnv(options.port),
      stdio: ["ignore", logFd, logFd],
      windowsHide: true
    }
  );

  child.unref();

  writeMetadata({
    pid: child.pid,
    port: options.port,
    logPath,
    repoRoot,
    startedAt: new Date().toISOString()
  });

  const ready = await waitForReady(options.port);
  if (!ready) {
    await stopPid(child.pid);
    clearMetadata();
    fail(`Codexy did not become ready. Check ${logPath} for details.`);
  }

  process.stdout.write(`Codexy is running at ${serviceUrl(options.port)}.\n`);
  process.stdout.write(`Log file: ${logPath}\n`);
}

async function runStop() {
  const metadata = readMetadata();
  if (!metadata?.pid) {
    process.stdout.write("Codexy is not running.\n");
    clearMetadata();
    return;
  }

  await stopPid(metadata.pid);
  clearMetadata();
  process.stdout.write("Codexy stopped.\n");
}

async function runStatus() {
  const metadata = readMetadata();
  if (!metadata?.pid || !isProcessRunning(metadata.pid)) {
    clearMetadata();
    process.stdout.write("Codexy is stopped.\n");
    process.exit(1);
  }

  const health = await httpGetStatus(metadata.port);
  process.stdout.write("Codexy is running.\n");
  process.stdout.write(`PID: ${metadata.pid}\n`);
  process.stdout.write(`URL: ${serviceUrl(metadata.port)}\n`);
  process.stdout.write(`Health: ${health?.ok ? "ready" : "starting"}\n`);
  process.stdout.write(`Log file: ${metadata.logPath}\n`);
}

function runLogs() {
  const metadata = readMetadata();
  if (!metadata?.logPath || !existsSync(metadata.logPath)) {
    fail("No Codexy log file is available yet.");
  }

  process.stdout.write(readFileSync(metadata.logPath, "utf8"));
}

function openUrl(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function runOpen() {
  const metadata = readMetadata();
  if (!metadata?.pid || !isProcessRunning(metadata.pid)) {
    fail("Codexy is not running. Start it first with `codexy start`.");
  }

  openUrl(serviceUrl(metadata.port));
  process.stdout.write(`Opened ${serviceUrl(metadata.port)}.\n`);
}

const [command = "help", ...argv] = process.argv.slice(2);

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(
      "Usage: node scripts/service.mjs <doctor|start|stop|status|logs|open> [--port 3000]\n"
    );
    break;
  case "doctor":
    await runDoctor();
    break;
  case "start":
    await runStart(argv);
    break;
  case "stop":
    await runStop();
    break;
  case "status":
    await runStatus();
    break;
  case "logs":
    runLogs();
    break;
  case "open":
    await runOpen();
    break;
  default:
    fail(`Unknown service command: ${command}`);
}
