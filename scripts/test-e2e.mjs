import { createServer } from "node:net";
import { readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const testsDir = path.join(repoRoot, "tests");
const PLAYWRIGHT_RUNTIME_PREFIX = ".next-runtime-playwright-";

function getE2eSpecFiles() {
  return readdirSync(testsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
    .map((entry) => path.posix.join("tests", entry.name))
    .sort();
}

function cleanupStalePlaywrightRuntimeDirs() {
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (!entry.name.startsWith(PLAYWRIGHT_RUNTIME_PREFIX)) {
      continue;
    }

    rmSync(path.join(repoRoot, entry.name), {
      recursive: true,
      force: true
    });
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve a free port.")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function runPlaywrightTest(args, env) {
  return new Promise((resolve) => {
    const command =
      process.platform === "win32"
        ? {
            file: "cmd.exe",
            args: ["/d", "/s", "/c", ["npx", "playwright", "test", ...args].join(" ")]
          }
        : {
            file: "npx",
            args: ["playwright", "test", ...args]
          };

    const child = spawn(command.file, command.args, {
      cwd: repoRoot,
      env,
      shell: false,
      stdio: "inherit"
    });

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  cleanupStalePlaywrightRuntimeDirs();
  const allSpecs = getE2eSpecFiles();
  const cloudSpecs = allSpecs.filter((file) => file.endsWith("/cloud-mode.spec.ts"));
  const remainingSpecs = allSpecs.filter((file) => !file.endsWith("/cloud-mode.spec.ts"));
  const createdRuntimeDirs = [];

  try {
    for (const [index, specGroup] of [cloudSpecs, remainingSpecs].entries()) {
      if (!specGroup.length) {
        continue;
      }

      const port = await getFreePort();
      const distDir = `${PLAYWRIGHT_RUNTIME_PREFIX}${process.pid}-${index + 1}`;
      createdRuntimeDirs.push(distDir);
      const exitCode = await runPlaywrightTest(specGroup, {
        ...process.env,
        PLAYWRIGHT_REUSE_EXISTING_SERVER: "false",
        PLAYWRIGHT_WEB_PORT: String(port),
        NEXT_DIST_DIR: distDir
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    }
  } finally {
    for (const dir of createdRuntimeDirs) {
      rmSync(path.join(repoRoot, dir), {
        recursive: true,
        force: true
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
