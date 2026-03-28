import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function sanitizeBuildEnv() {
  const env = {
    ...process.env,
    NODE_ENV: "production"
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

const child = spawn(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: repoRoot,
  env: sanitizeBuildEnv(),
  stdio: "inherit",
  shell: false
});

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
