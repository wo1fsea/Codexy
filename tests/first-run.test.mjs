import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const cliScript = path.join(repoRoot, "scripts", "codexy.mjs");

function runProcess(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env
    },
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    windowsHide: true
  });

  return {
    ...result,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function runNodeCli(args, options = {}) {
  return runProcess(process.execPath, [cliScript, ...args], options);
}

function runCmd(command, options = {}) {
  return runProcess("cmd.exe", ["/d", "/c", command], options);
}

function runBash(command, options = {}) {
  return runProcess("bash", ["-lc", command], options);
}

function makeTempDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a test port.")));
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
  });
}

function bashNodeAvailable() {
  if (process.platform === "win32") {
    return false;
  }

  const result = runBash("command -v node >/dev/null 2>&1");
  return result.status === 0;
}

test("codexy help prints the first-run command surface", () => {
  const result = runNodeCli(["help"], {
    timeout: 10_000
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codexy help/);
  assert.match(result.stdout, /codexy doctor/);
  assert.match(result.stdout, /codexy start/);
  assert.match(result.stdout, /codexy stop/);
});

test("install.cmd creates a launcher that dispatches to the current checkout", { skip: process.platform !== "win32" }, () => {
  const tempHome = makeTempDir("codexy-install-home-");
  const installResult = runCmd("call install.cmd", {
    cwd: repoRoot,
    env: {
      USERPROFILE: tempHome,
      CODEXY_SKIP_PATH_UPDATE: "1"
    },
    timeout: 180_000
  });

  try {
    assert.equal(installResult.status, 0, installResult.stdout + installResult.stderr);
    const shimPath = path.join(tempHome, ".codexy", "bin", "codexy.cmd");
    const shim = readFileSync(shimPath, "utf8");

    assert.match(shim, /CODEXY_INSTALL_DIR=/);
    assert.match(shim, /scripts\\codexy\.mjs/);

    const helpResult = runCmd("call codexy.cmd help", {
      cwd: path.dirname(shimPath),
      env: {
        USERPROFILE: tempHome
      },
      timeout: 10_000
    });

    assert.equal(helpResult.status, 0, helpResult.stdout + helpResult.stderr);
    assert.match(helpResult.stdout, /Codexy first-run CLI/);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("launcher fails fast when the install directory no longer exists", { skip: process.platform !== "win32" }, () => {
  const tempHome = makeTempDir("codexy-broken-home-");
  const installResult = runCmd("call install.cmd", {
    cwd: repoRoot,
    env: {
      USERPROFILE: tempHome,
      CODEXY_SKIP_PATH_UPDATE: "1"
    },
    timeout: 180_000
  });

  try {
    assert.equal(installResult.status, 0, installResult.stdout + installResult.stderr);
    const shimPath = path.join(tempHome, ".codexy", "bin", "codexy.cmd");
    const brokenShimPath = path.join(tempHome, ".codexy", "bin", "codexy-broken.cmd");
    const missingInstallDir = path.join(tempHome, "missing-install");
    const shim = readFileSync(shimPath, "utf8").replace(repoRoot, missingInstallDir);

    writeFileSync(brokenShimPath, shim, "utf8");

    const result = runCmd("call codexy-broken.cmd help", {
      cwd: path.dirname(brokenShimPath),
      timeout: 10_000
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Rerun install\.cmd/);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("install.sh creates a launcher that dispatches to the current checkout", { skip: !bashNodeAvailable() }, () => {
  const tempHome = makeTempDir("codexy-install-sh-home-");
  const installResult = runBash(`cd "${repoRoot}" && HOME="${tempHome}" CODEXY_SKIP_PATH_UPDATE=1 ./install.sh`, {
    timeout: 180_000
  });

  try {
    assert.equal(installResult.status, 0, installResult.stdout + installResult.stderr);
    const shimPath = path.join(tempHome, ".codexy", "bin", "codexy");
    const shim = readFileSync(shimPath, "utf8");

    assert.match(shim, /CODEXY_INSTALL_DIR=/);
    assert.match(shim, /scripts\/codexy\.mjs/);

    const helpResult = runBash(`HOME="${tempHome}" "${shimPath}" help`, {
      timeout: 10_000
    });

    assert.equal(helpResult.status, 0, helpResult.stdout + helpResult.stderr);
    assert.match(helpResult.stdout, /Codexy first-run CLI/);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("codexy lifecycle commands can start, report, and stop the local service", async () => {
  const codexyHome = makeTempDir("codexy-test-home-");
  const port = await getFreePort();

  try {
    const startResult = runNodeCli(["start", "--port", String(port)], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 180_000
    });

    assert.equal(startResult.status, 0, startResult.stdout + startResult.stderr);
    assert.match(startResult.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}`));

    const statusResult = runNodeCli(["status"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 20_000
    });

    assert.equal(statusResult.status, 0, statusResult.stdout + statusResult.stderr);
    assert.match(statusResult.stdout, /Codexy is running/);
    assert.match(statusResult.stdout, new RegExp(`URL: http://127\\.0\\.0\\.1:${port}`));

    const stopResult = runNodeCli(["stop"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 20_000
    });

    assert.equal(stopResult.status, 0, stopResult.stdout + stopResult.stderr);
    assert.match(stopResult.stdout, /Codexy stopped/);

    const stoppedStatus = runNodeCli(["status"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 10_000
    });

    assert.notEqual(stoppedStatus.status, 0);
    assert.match(stoppedStatus.stdout + stoppedStatus.stderr, /Codexy is stopped/);
  } finally {
    runNodeCli(["stop"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 20_000
    });
    rmSync(codexyHome, { recursive: true, force: true });
  }
});
