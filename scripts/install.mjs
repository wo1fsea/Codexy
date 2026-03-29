#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const nodeModulesMarker = path.join(repoRoot, "node_modules", ".package-lock.json");
const buildMarker = path.join(repoRoot, ".next-runtime", "BUILD_ID");

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function parseMajor(rawVersion) {
  const match = rawVersion.trim().match(/^v?(?<major>\d+)/);
  if (!match?.groups?.major) {
    return null;
  }

  return Number.parseInt(match.groups.major, 10);
}

function runCommand(name, args, options = {}) {
  const commandLine = [name, ...args].join(" ");
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
          cwd: options.cwd,
          stdio: options.stdio ?? "inherit",
          windowsHide: true
        })
      : spawnSync(name, args, {
          cwd: options.cwd,
          stdio: options.stdio ?? "inherit",
          windowsHide: true
        });

  if (result.error) {
    return {
      ok: false,
      error: result.error
    };
  }

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout?.toString("utf8") ?? ""
  };
}

function versionCheck(name, minimumMajor) {
  const result = runCommand(name, ["--version"], {
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (!result.ok) {
    return {
      ok: false,
      detail: `${name} is not available on PATH`
    };
  }

  const major = parseMajor(result.stdout);
  if (!major || major < minimumMajor) {
    return {
      ok: false,
      detail: `${name} ${result.stdout.trim()} is too old`
    };
  }

  return {
    ok: true,
    detail: result.stdout.trim()
  };
}

function warnIfMissing(name) {
  const result = runCommand(name, ["--version"], {
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.ok) {
    log(`OK ${name}: ${result.stdout.trim()}`);
    return;
  }

  log(`WARN ${name}: not found on PATH`);
}

function needsDependencyInstall() {
  if (!existsSync(nodeModulesMarker)) {
    return true;
  }

  const markerMtime = statSync(nodeModulesMarker).mtimeMs;
  const packageJsonMtime = statSync(path.join(repoRoot, "package.json")).mtimeMs;
  const packageLockMtime = statSync(path.join(repoRoot, "package-lock.json")).mtimeMs;

  return markerMtime < packageJsonMtime || markerMtime < packageLockMtime;
}

function needsBuild() {
  return !existsSync(buildMarker);
}

log("Checking local setup prerequisites...");

const nodeCheck = versionCheck("node", 20);
if (!nodeCheck.ok) {
  fail(`FAIL node: ${nodeCheck.detail}`);
}
log(`OK node: ${nodeCheck.detail}`);

const npmCheck = versionCheck("npm", 10);
if (!npmCheck.ok) {
  fail(`FAIL npm: ${npmCheck.detail}`);
}
log(`OK npm: ${npmCheck.detail}`);

warnIfMissing(process.env.CODEXY_CODEX_BIN || "codex");
warnIfMissing(process.env.CODEXY_TAILSCALE_BIN || "tailscale");

if (needsDependencyInstall()) {
  log("Installing Codexy dependencies...");
  const installResult = runCommand("npm", ["install"], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (!installResult.ok) {
    process.exit(installResult.status ?? 1);
  }
} else {
  log("OK dependencies: already installed");
}

if (needsBuild()) {
  log("Preparing initial Codexy runtime build...");
  const buildResult = runCommand("node", ["scripts/next-build.mjs"], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (!buildResult.ok) {
    process.exit(buildResult.status ?? 1);
  }
} else {
  log("OK runtime build: already present");
}

log("Codexy setup is ready.");
