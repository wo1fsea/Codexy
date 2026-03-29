#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const serviceScript = path.join(repoRoot, "scripts", "service.mjs");

function helpText() {
  return `Codexy first-run CLI

Usage:
  codexy help
  codexy doctor
  codexy start [--port 3000]
  codexy stop
  codexy status
  codexy logs
  codexy open
  codexy cloud start [--port 3400]
  codexy cloud stop
  codexy cloud status
  codexy cloud logs
  codexy cloud open
  codexy link <cloud-url> [--code 123456]
  codexy unlink

This CLI is installed from the current checkout. If you move the checkout,
rerun install.cmd or install.sh from the new location.`;
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function ensureServiceScript() {
  if (!existsSync(serviceScript)) {
    fail(
      `Codexy service script is missing at ${serviceScript}.\n` +
        "Make sure this checkout is intact and rerun the install script if this checkout moved."
    );
  }
}

function delegate(command, args) {
  ensureServiceScript();
  const result = spawnSync(process.execPath, [serviceScript, command, ...args], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.error) {
    fail(String(result.error));
  }

  process.exit(result.status ?? 1);
}

const [command = "help", ...args] = process.argv.slice(2);

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(`${helpText()}\n`);
    break;
  case "doctor":
  case "start":
  case "stop":
  case "status":
  case "logs":
  case "open":
  case "link":
  case "unlink":
    delegate(command, args);
    break;
  case "cloud":
    delegate(command, args);
    break;
  default:
    fail(`Unknown command: ${command}\n\n${helpText()}`);
}
