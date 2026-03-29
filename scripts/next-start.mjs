import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function sanitizeRuntimeEnv() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || ".next-runtime"
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

function resolvePort(argv) {
  const args = [...argv];

  while (args.length > 0) {
    const current = args.shift();
    if (!current) {
      continue;
    }

    if (current === "--port") {
      const next = args.shift();
      if (next) {
        return next;
      }
      break;
    }

    if (!current.startsWith("-")) {
      return current;
    }
  }

  return process.env.PORT?.trim() || "3000";
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = resolvePort(process.argv.slice(2));

const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "0.0.0.0", "--port", port],
  {
    cwd: repoRoot,
    env: sanitizeRuntimeEnv(),
    stdio: "inherit",
    shell: false
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
