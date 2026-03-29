import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function sanitizeDevEnv() {
  const env = {
    ...process.env,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || ".next"
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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
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

const trackedSnapshots = repoManagedPaths.map(captureManagedFile);
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: sanitizeDevEnv(),
  stdio: "inherit",
  shell: false
});
let restored = false;

function restoreOnce() {
  if (restored) {
    return;
  }

  restored = true;
  restoreManagedFiles(trackedSnapshots);
}

function stopChild(signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    child.kill(signal);
  } catch {}
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stopChild(signal);
    restoreOnce();
    process.exit(0);
  });
}

child.on("exit", (code, signal) => {
  restoreOnce();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  restoreOnce();
  console.error(error);
  process.exit(1);
});
