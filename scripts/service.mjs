#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
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

import {
  clearCloudLink,
  ensureLocalNodeIdentity,
  getCloudLinkState,
  normalizeCloudUrl,
  writeCloudLink
} from "./cloud-link.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const runtimeKey = createHash("sha1").update(repoRoot).digest("hex").slice(0, 12);
const codexyHome = process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");

const SERVICE_MODES = {
  node: {
    key: "node",
    runtimeMode: "node",
    label: "Codexy",
    lowerLabel: "codexy",
    defaultPort:
      Number.parseInt(process.env.PORT ?? process.env.CODEXY_WEB_PORT ?? "3000", 10) || 3000,
    distDir: ".next-runtime-node",
    needsCodexBinary: true
  },
  cloud: {
    key: "cloud",
    runtimeMode: "cloud",
    label: "Codexy cloud",
    lowerLabel: "codexy cloud",
    defaultPort:
      Number.parseInt(process.env.PORT ?? process.env.CODEXY_CLOUD_PORT ?? "3400", 10) || 3400,
    distDir: ".next-runtime-cloud",
    needsCodexBinary: false
  }
};

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function getModeConfig(modeName) {
  const mode = SERVICE_MODES[modeName];
  if (!mode) {
    fail(`Unknown runtime mode: ${modeName}`);
  }

  return mode;
}

function parseArgs(argv, mode) {
  const result = {
    port: mode.defaultPort
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

function getStateDir(mode) {
  return path.join(codexyHome, "state", runtimeKey, mode.key);
}

function getLogDir(mode) {
  return path.join(codexyHome, "logs", mode.key);
}

function getMetadataPath(mode) {
  return path.join(getStateDir(mode), "service.json");
}

function getConnectorStateDir() {
  return path.join(codexyHome, "state", runtimeKey, "node");
}

function getConnectorMetadataPath() {
  return path.join(getConnectorStateDir(), "cloud-connector.json");
}

function getConnectorLogDir() {
  return path.join(codexyHome, "logs", "cloud-connector");
}

function ensureModeDirs(mode) {
  mkdirSync(getStateDir(mode), { recursive: true });
  mkdirSync(getLogDir(mode), { recursive: true });
}

function readMetadata(mode) {
  const metadataPath = getMetadataPath(mode);
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
}

function writeMetadata(mode, metadata) {
  ensureModeDirs(mode);
  writeFileSync(
    getMetadataPath(mode),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
}

function clearMetadata(mode) {
  rmSync(getMetadataPath(mode), { force: true });
}

function readConnectorMetadata() {
  const metadataPath = getConnectorMetadataPath();
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
}

function writeConnectorMetadata(metadata) {
  mkdirSync(getConnectorStateDir(), { recursive: true });
  mkdirSync(getConnectorLogDir(), { recursive: true });
  writeFileSync(
    getConnectorMetadataPath(),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
}

function clearConnectorMetadata() {
  rmSync(getConnectorMetadataPath(), { force: true });
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

function sanitizeRuntimeEnv(port, mode) {
  const env = {
    ...process.env,
    CODEXY_RUNTIME_MODE: mode.runtimeMode,
    NODE_ENV: "production",
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || mode.distDir,
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

function buildRuntime(mode, port) {
  const buildScript = path.join(repoRoot, "scripts", "next-build.mjs");
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: repoRoot,
    env: sanitizeRuntimeEnv(port, mode),
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

function parseJson(text) {
  if (!text?.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeTotpCode(rawCode) {
  const normalized = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    fail("Enter a valid 6-digit Google Authenticator code.");
  }

  return normalized;
}

async function promptForTotpCode() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("A 6-digit authenticator code is required. Rerun `codexy link <cloud-url> --code 123456`.");
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const code = await rl.question("Enter the current Codexy cloud 6-digit code: ");
    return normalizeTotpCode(code);
  } finally {
    rl.close();
  }
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

async function tryReclaimPort(port) {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique`
      ],
      { encoding: "utf8", windowsHide: true }
    );

    const pids = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);

    for (const pid of pids) {
      await stopPid(pid);
    }
  } else {
    const result = spawnSync("lsof", ["-ti", `:${port}`], {
      encoding: "utf8"
    });

    const pids = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);

    for (const pid of pids) {
      await stopPid(pid);
    }
  }
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

function printCloudState(prefix = "Cloud") {
  const cloud = getCloudLinkState();
  if (cloud.error) {
    process.stdout.write(`${prefix}: invalid config (${cloud.error})\n`);
    process.stdout.write(`Config: ${cloud.configPath}\n`);
    return cloud;
  }

  if (!cloud.linked || !cloud.url) {
    process.stdout.write(`${prefix}: not linked\n`);
    process.stdout.write(`Config: ${cloud.configPath}\n`);
    return cloud;
  }

  process.stdout.write(`${prefix}: linked to ${cloud.url}\n`);
  if (cloud.nodeName || cloud.nodeId) {
    process.stdout.write(
      `Node: ${cloud.nodeName || "codexy-node"}${cloud.nodeId ? ` (${cloud.nodeId})` : ""}\n`
    );
  }
  if (cloud.linkedAt) {
    process.stdout.write(`Linked at: ${cloud.linkedAt}\n`);
  }
  process.stdout.write(`Config: ${cloud.configPath}\n`);
  return cloud;
}

async function runDoctor() {
  const mode = getModeConfig("node");
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

  const cloud = getCloudLinkState();
  if (cloud.error) {
    failures += 1;
    printCheck("fail", "cloud", cloud.error);
  } else if (cloud.linked && cloud.url) {
    printCheck(
      "ok",
      "cloud",
      `${cloud.url}${cloud.nodeId ? ` (${cloud.nodeId})` : ""}`
    );
  } else {
    printCheck("warn", "cloud", "not linked to a self-hosted cloud");
  }

  const buildIdPath = path.join(repoRoot, mode.distDir, "BUILD_ID");
  if (existsSync(buildIdPath)) {
    printCheck("ok", "runtime build", `${mode.distDir} is present`);
  } else {
    printCheck(
      "warn",
      "runtime build",
      `missing; \`codexy start\` will build ${mode.distDir} before launching`
    );
  }

  const metadata = readMetadata(mode);
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

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
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

    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

async function stopNodeConnector() {
  const metadata = readConnectorMetadata();
  if (!metadata?.pid) {
    clearConnectorMetadata();
    return false;
  }

  await stopPid(metadata.pid);
  clearConnectorMetadata();
  return true;
}

async function startNodeConnectorIfLinked() {
  const nodeMetadata = readMetadata(getModeConfig("node"));
  if (!nodeMetadata?.pid || !isProcessRunning(nodeMetadata.pid)) {
    await stopNodeConnector();
    return null;
  }

  const cloud = getCloudLinkState();
  if (
    cloud.error ||
    !cloud.linked ||
    !cloud.url ||
    !cloud.nodeId ||
    !cloud.connectorToken
  ) {
    await stopNodeConnector();
    return null;
  }

  const current = readConnectorMetadata();
  if (current?.pid && isProcessRunning(current.pid)) {
    return current;
  }

  clearConnectorMetadata();

  mkdirSync(getConnectorLogDir(), { recursive: true });
  const logPath = path.join(
    getConnectorLogDir(),
    `cloud-connector-${runtimeKey}-${Date.now()}.log`
  );
  const logFd = openSync(logPath, "w");
  const connectorScript = path.join(repoRoot, "scripts", "cloud-connector.mjs");
  const child = spawn(process.execPath, [connectorScript], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      CODEXY_HOME_DIR: codexyHome
    },
    stdio: ["ignore", logFd, logFd],
    windowsHide: true
  });

  child.unref();

  const metadata = {
    pid: child.pid,
    logPath,
    startedAt: new Date().toISOString()
  };
  writeConnectorMetadata(metadata);
  return metadata;
}

function printNodeConnectorState() {
  const metadata = readConnectorMetadata();
  if (!metadata?.pid || !isProcessRunning(metadata.pid)) {
    clearConnectorMetadata();
    process.stdout.write("Connector: stopped\n");
    return;
  }

  process.stdout.write(`Connector: running (PID ${metadata.pid})\n`);
  if (metadata.logPath) {
    process.stdout.write(`Connector log: ${metadata.logPath}\n`);
  }
}

async function runStart(argv, modeName) {
  const mode = getModeConfig(modeName);
  const options = parseArgs(argv, mode);
  const current = readMetadata(mode);

  if (current?.pid && isProcessRunning(current.pid)) {
    if (mode.key === "node") {
      await startNodeConnectorIfLinked();
    }

    if (current.port !== options.port) {
      fail(
        `${mode.label} is already running on port ${current.port}. Stop it before starting on port ${options.port}.`
      );
    }

    process.stdout.write(`${mode.label} is already running at ${serviceUrl(current.port)}.\n`);
    process.stdout.write(`Log file: ${current.logPath}\n`);
    process.exit(0);
  }

  clearMetadata(mode);

  if (!dependencyInstalled()) {
    fail(
      "Codexy dependencies are not installed.\nRun `cd repos/codexy-app && npm install` and retry."
    );
  }

  if (!(await isPortAvailable(options.port))) {
    process.stdout.write(`Port ${options.port} is in use. Attempting to reclaim...\n`);
    await tryReclaimPort(options.port);
    if (!(await isPortAvailable(options.port))) {
      fail(`Port ${options.port} is still in use after cleanup. Choose another port or stop the existing listener.`);
    }
  }

  if (mode.needsCodexBinary && !checkBinary(process.env.CODEXY_CODEX_BIN || "codex")) {
    process.stdout.write("WARN codex not found on PATH. The web UI may start, but bridge features will fail.\n");
  }

  buildRuntime(mode, options.port);
  ensureModeDirs(mode);

  const logPath = path.join(
    getLogDir(mode),
    `${mode.key}-${runtimeKey}-${options.port}-${Date.now()}.log`
  );
  const logFd = openSync(logPath, "w");
  const child = spawn(
    process.execPath,
    [getNextBin(), "start", "--hostname", "0.0.0.0", "--port", String(options.port)],
    {
      cwd: repoRoot,
      detached: true,
      env: sanitizeRuntimeEnv(options.port, mode),
      stdio: ["ignore", logFd, logFd],
      windowsHide: true
    }
  );

  child.unref();

  writeMetadata(mode, {
    pid: child.pid,
    port: options.port,
    logPath,
    repoRoot,
    runtimeMode: mode.runtimeMode,
    startedAt: new Date().toISOString()
  });

  const ready = await waitForReady(options.port);
  if (!ready) {
    await stopPid(child.pid);
    clearMetadata(mode);
    fail(`${mode.label} did not become ready. Check ${logPath} for details.`);
  }

  process.stdout.write(`${mode.label} is running at ${serviceUrl(options.port)}.\n`);
  process.stdout.write(`Log file: ${logPath}\n`);

  if (mode.key === "node") {
    const connector = await startNodeConnectorIfLinked();
    if (connector?.pid) {
      process.stdout.write(`Connector PID: ${connector.pid}\n`);
      process.stdout.write(`Connector log: ${connector.logPath}\n`);
    }
  }
}

async function runStop(modeName) {
  const mode = getModeConfig(modeName);
  const metadata = readMetadata(mode);
  if (!metadata?.pid) {
    process.stdout.write(`${mode.label} is not running.\n`);
    clearMetadata(mode);
    return;
  }

  await stopPid(metadata.pid);
  clearMetadata(mode);
  if (mode.key === "node") {
    await stopNodeConnector();
  }
  process.stdout.write(`${mode.label} stopped.\n`);
}

async function runStatus(modeName) {
  const mode = getModeConfig(modeName);
  const metadata = readMetadata(mode);
  if (!metadata?.pid || !isProcessRunning(metadata.pid)) {
    clearMetadata(mode);
    process.stdout.write(`${mode.label} is stopped.\n`);
    if (mode.key === "node") {
      printCloudState();
      printNodeConnectorState();
    }
    process.exit(1);
  }

  const health = await httpGetStatus(metadata.port);
  const statusPayload = parseJson(health?.body ?? "");
  process.stdout.write(`${mode.label} is running.\n`);
  process.stdout.write(`PID: ${metadata.pid}\n`);
  process.stdout.write(`URL: ${serviceUrl(metadata.port)}\n`);
  process.stdout.write(`Health: ${health?.ok ? "ready" : "starting"}\n`);
  process.stdout.write(`Log file: ${metadata.logPath}\n`);

  if (mode.key === "cloud" && statusPayload && typeof statusPayload.nodeCount === "number") {
    process.stdout.write(`Linked nodes: ${statusPayload.nodeCount}\n`);
  }

  if (mode.key === "node") {
    printCloudState();
    printNodeConnectorState();
  }
}

function runLogs(modeName) {
  const mode = getModeConfig(modeName);
  const metadata = readMetadata(mode);
  if (!metadata?.logPath || !existsSync(metadata.logPath)) {
    fail(`No ${mode.lowerLabel} log file is available yet.`);
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

async function runOpen(modeName) {
  const mode = getModeConfig(modeName);
  const metadata = readMetadata(mode);
  if (!metadata?.pid || !isProcessRunning(metadata.pid)) {
    fail(`${mode.label} is not running. Start it first.`);
  }

  openUrl(serviceUrl(metadata.port));
  process.stdout.write(`Opened ${serviceUrl(metadata.port)}.\n`);
}

async function requestCloudJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      text ||
      `Cloud request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

async function registerNodeWithCloud(cloudUrl, node, linkedAt, connectorToken, totpCode) {
  await requestCloudJson(`${cloudUrl}/api/cloud/nodes`, {
    method: "POST",
    body: JSON.stringify({
      cloudUrl,
      linkedAt,
      connectorToken,
      totpCode,
      nodeId: node.nodeId,
      nodeName: node.nodeName
    })
  });
}

async function unregisterNodeFromCloud(cloud) {
  if (!cloud.url || !cloud.nodeId || !cloud.connectorToken) {
    return;
  }

  await requestCloudJson(
    `${cloud.url}/api/cloud/nodes/${encodeURIComponent(cloud.nodeId)}`,
    {
      method: "DELETE",
      headers: {
        "x-codexy-connector-token": cloud.connectorToken
      }
    }
  );
}

async function runLink(argv) {
  const [rawUrl, ...rest] = argv;
  if (!rawUrl) {
    fail("Usage: codexy link <cloud-url> [--code 123456]");
  }

  let totpCode = process.env.CODEXY_TOTP_CODE?.trim() || null;
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (current === "--code") {
      const next = rest[index + 1];
      if (!next) {
        fail("Missing value for --code.");
      }

      totpCode = next;
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${current}`);
  }

  try {
    const cloudUrl = normalizeCloudUrl(rawUrl);
    const node = ensureLocalNodeIdentity();
    const linkedAt = new Date().toISOString();
    const connectorToken = randomUUID();
    const verifiedTotpCode = totpCode ? normalizeTotpCode(totpCode) : await promptForTotpCode();

    await registerNodeWithCloud(
      cloudUrl,
      node,
      linkedAt,
      connectorToken,
      verifiedTotpCode
    );

    const cloud = writeCloudLink(cloudUrl, {
      linkedAt,
      connectorToken
    });
    await startNodeConnectorIfLinked();
    process.stdout.write(`Codexy linked to ${cloud.url}.\n`);
    if (cloud.nodeName || cloud.nodeId) {
      process.stdout.write(
        `Node: ${cloud.nodeName || "codexy-node"}${cloud.nodeId ? ` (${cloud.nodeId})` : ""}\n`
      );
    }
    process.stdout.write(`Config: ${cloud.configPath}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Failed to link Codexy to the self-hosted cloud.");
  }
}

async function runUnlink(argv) {
  if (argv.length) {
    fail(`Unknown argument: ${argv[0]}`);
  }

  const current = getCloudLinkState();
  let unlinkWarning = null;

  if (current.linked && current.url && current.nodeId) {
    try {
      await unregisterNodeFromCloud(current);
    } catch (error) {
      unlinkWarning = error instanceof Error ? error.message : "Unable to notify the self-hosted cloud.";
    }
  }

  try {
    const cloud = clearCloudLink();
    await stopNodeConnector();
    process.stdout.write("Codexy cloud link cleared.\n");
    process.stdout.write(`Config: ${cloud.configPath}\n`);
    if (unlinkWarning) {
      process.stdout.write(`WARN ${unlinkWarning}\n`);
    }
  } catch (error) {
    fail(
      error instanceof Error
        ? error.message
        : "Failed to clear the Codexy self-hosted cloud link."
    );
  }
}

function printHelp() {
  process.stdout.write(
    "Usage: node scripts/service.mjs <doctor|start|stop|status|logs|open|link|unlink|cloud> [--port 3000]\n"
  );
  process.stdout.write(
    "Usage: node scripts/service.mjs cloud <start|stop|status|logs|open> [--port 3400]\n"
  );
  process.stdout.write(
    "Usage: node scripts/service.mjs link <cloud-url> [--code 123456]\n"
  );
}

async function runCloudCommand(argv) {
  const [subcommand = "help", ...rest] = argv;

  switch (subcommand) {
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(
        "Usage: node scripts/service.mjs cloud <start|stop|status|logs|open> [--port 3400]\n"
      );
      break;
    case "start":
      await runStart(rest, "cloud");
      break;
    case "stop":
      await runStop("cloud");
      break;
    case "status":
      await runStatus("cloud");
      break;
    case "logs":
      runLogs("cloud");
      break;
    case "open":
      await runOpen("cloud");
      break;
    default:
      fail(`Unknown cloud command: ${subcommand}`);
  }
}

const [command = "help", ...argv] = process.argv.slice(2);

switch (command) {
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  case "doctor":
    await runDoctor();
    break;
  case "start":
    await runStart(argv, "node");
    break;
  case "stop":
    await runStop("node");
    break;
  case "status":
    await runStatus("node");
    break;
  case "logs":
    runLogs("node");
    break;
  case "open":
    await runOpen("node");
    break;
  case "link":
    await runLink(argv);
    break;
  case "unlink":
    await runUnlink(argv);
    break;
  case "cloud":
    await runCloudCommand(argv);
    break;
  default:
    fail(`Unknown service command: ${command}`);
}
