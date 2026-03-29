import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
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

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(input) {
  const normalized = input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[\s-]+/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const next = BASE32_ALPHABET.indexOf(char);
    if (next === -1) {
      throw new Error("Invalid base32 secret.");
    }

    value = (value << 5) | next;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotpCode(secretBase32, now = Date.now()) {
  const counter = Math.floor(now / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secretBase32))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function readCloudAuthFile(homeDir) {
  return JSON.parse(readFileSync(path.join(homeDir, "cloud", "auth.json"), "utf8"));
}

async function setupCloudAuthenticator(cloudUrl, cloudHome, returnTo = "/") {
  const setupResponse = await fetch(`${cloudUrl}/auth/setup`, {
    cache: "no-store",
    redirect: "follow"
  });
  assert.equal(setupResponse.status, 200);
  const setupHtml = await setupResponse.text();
  assert.match(setupHtml, /Bind Google Authenticator/);

  const auth = readCloudAuthFile(cloudHome);
  const bindResponse = await fetch(`${cloudUrl}/api/cloud/auth/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code: generateTotpCode(auth.secretBase32),
      returnTo
    }),
    redirect: "manual"
  });

  assert.equal(bindResponse.status, 303);
  const sessionCookie = bindResponse.headers.get("set-cookie");
  assert.ok(sessionCookie);
  return sessionCookie.split(";", 1)[0];
}

async function loginCloudAuthenticator(cloudUrl, cloudHome, returnTo = "/") {
  const auth = readCloudAuthFile(cloudHome);
  const loginResponse = await fetch(`${cloudUrl}/api/cloud/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code: generateTotpCode(auth.secretBase32),
      returnTo
    }),
    redirect: "manual"
  });

  assert.equal(loginResponse.status, 303);
  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert.ok(sessionCookie);
  return sessionCookie.split(";", 1)[0];
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

async function waitForJson(url, predicate, timeoutMs = 30_000, init = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...init
      });

      if (response.ok) {
        const payload = await response.json();
        if (!predicate || predicate(payload)) {
          return payload;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw (
    lastError ??
    new Error(`Timed out waiting for JSON response from ${url}.`)
  );
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
  assert.match(result.stdout, /codexy cloud start/);
  assert.match(result.stdout, /codexy cloud status/);
  assert.match(result.stdout, /codexy link <cloud-url> \[--code 123456\]/);
  assert.match(result.stdout, /codexy unlink/);
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

test("codexy cloud lifecycle commands can start, report, and stop the local cloud service", async () => {
  const codexyHome = makeTempDir("codexy-cloud-runtime-home-");
  const port = await getFreePort();

  try {
    const startResult = runNodeCli(["cloud", "start", "--port", String(port)], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 180_000
    });

    assert.equal(startResult.status, 0, startResult.stdout + startResult.stderr);
    assert.match(startResult.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}`));

    const statusResult = runNodeCli(["cloud", "status"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 20_000
    });

    assert.equal(statusResult.status, 0, statusResult.stdout + statusResult.stderr);
    assert.match(statusResult.stdout, /Codexy cloud is running/);
    assert.match(statusResult.stdout, new RegExp(`URL: http://127\\.0\\.0\\.1:${port}`));

    const htmlResponse = await fetch(`http://127.0.0.1:${port}`, {
      cache: "no-store"
    });
    const html = await htmlResponse.text();
    assert.equal(htmlResponse.status, 200);
    assert.match(html, /Bind Google Authenticator/);

    const stopResult = runNodeCli(["cloud", "stop"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 20_000
    });

    assert.equal(stopResult.status, 0, stopResult.stdout + stopResult.stderr);
    assert.match(stopResult.stdout, /Codexy cloud stopped/);
  } finally {
    runNodeCli(["cloud", "stop"], {
      env: {
        CODEXY_HOME_DIR: codexyHome
      },
      timeout: 20_000
    });
    rmSync(codexyHome, { recursive: true, force: true });
  }
});

test("cloud auth setup binds an authenticator and login gates dashboard access", async () => {
  const cloudHome = makeTempDir("codexy-cloud-auth-home-");
  const cloudPort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(["cloud", "start", "--port", String(cloudPort)], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 180_000
    });
    assert.equal(cloudStart.status, 0, cloudStart.stdout + cloudStart.stderr);

    const setupCookie = await setupCloudAuthenticator(cloudUrl, cloudHome);
    const dashboardResponse = await fetch(cloudUrl, {
      cache: "no-store",
      headers: {
        cookie: setupCookie
      }
    });
    const dashboardHtml = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardHtml, /Codexy Cloud/);

    const logoutResponse = await fetch(`${cloudUrl}/api/cloud/auth/logout`, {
      method: "POST",
      headers: {
        cookie: setupCookie,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        returnTo: "/auth/login"
      }),
      redirect: "manual"
    });
    assert.equal(logoutResponse.status, 303);

    const loginPage = await fetch(cloudUrl, {
      cache: "no-store",
      redirect: "follow"
    });
    const loginHtml = await loginPage.text();
    assert.equal(loginPage.status, 200);
    assert.match(loginHtml, /Enter your authenticator code/);

    const nodesWithoutAuth = await fetch(`${cloudUrl}/api/cloud/nodes`, {
      cache: "no-store"
    });
    assert.equal(nodesWithoutAuth.status, 401);

    const loginCookie = await loginCloudAuthenticator(cloudUrl, cloudHome);
    const dashboardAfterLogin = await fetch(cloudUrl, {
      cache: "no-store",
      headers: {
        cookie: loginCookie
      }
    });
    const dashboardAfterLoginHtml = await dashboardAfterLogin.text();
    assert.equal(dashboardAfterLogin.status, 200);
    assert.match(dashboardAfterLoginHtml, /Codexy Cloud/);
  } finally {
    runNodeCli(["cloud", "stop"], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 20_000
    });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("codexy link registers a node with a running local cloud and unlink removes it", async () => {
  const nodeHome = makeTempDir("codexy-node-home-");
  const cloudHome = makeTempDir("codexy-cloud-home-");
  const cloudPort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(["cloud", "start", "--port", String(cloudPort)], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 180_000
    });
    assert.equal(cloudStart.status, 0, cloudStart.stdout + cloudStart.stderr);

    const sessionCookie = await setupCloudAuthenticator(cloudUrl, cloudHome);
    const auth = readCloudAuthFile(cloudHome);

    const linkResult = runNodeCli(["link", cloudUrl, "--code", generateTotpCode(auth.secretBase32)], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 20_000
    });
    assert.equal(linkResult.status, 0, linkResult.stdout + linkResult.stderr);
    assert.match(linkResult.stdout, new RegExp(`Codexy linked to ${cloudUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const nodeConfig = JSON.parse(readFileSync(path.join(nodeHome, "config.json"), "utf8"));
    assert.equal(nodeConfig.cloud.url, cloudUrl);
    assert.ok(nodeConfig.node.id);

    const nodesResponse = await fetch(`${cloudUrl}/api/cloud/nodes`, {
      cache: "no-store",
      headers: {
        cookie: sessionCookie
      }
    });
    const nodesPayload = await nodesResponse.json();
    assert.equal(nodesResponse.status, 200);
    assert.equal(nodesPayload.nodes.length, 1);
    assert.equal(nodesPayload.nodes[0].nodeId, nodeConfig.node.id);
    assert.equal(nodesPayload.nodes[0].displayName, nodeConfig.node.name);

    const unlinkResult = runNodeCli(["unlink"], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 20_000
    });
    assert.equal(unlinkResult.status, 0, unlinkResult.stdout + unlinkResult.stderr);

    const nodesAfterUnlinkResponse = await fetch(`${cloudUrl}/api/cloud/nodes`, {
      cache: "no-store",
      headers: {
        cookie: sessionCookie
      }
    });
    const nodesAfterUnlinkPayload = await nodesAfterUnlinkResponse.json();
    assert.equal(nodesAfterUnlinkResponse.status, 200);
    assert.equal(nodesAfterUnlinkPayload.nodes.length, 0);
  } finally {
    runNodeCli(["cloud", "stop"], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 20_000
    });
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("status API includes the current cloud link state after local node+cloud registration", async () => {
  const nodeHome = makeTempDir("codexy-cloud-status-node-home-");
  const cloudHome = makeTempDir("codexy-cloud-status-cloud-home-");
  const nodePort = await getFreePort();
  const cloudPort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(["cloud", "start", "--port", String(cloudPort)], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 180_000
    });
    assert.equal(cloudStart.status, 0, cloudStart.stdout + cloudStart.stderr);

    await setupCloudAuthenticator(cloudUrl, cloudHome);
    const auth = readCloudAuthFile(cloudHome);

    const linkResult = runNodeCli(["link", cloudUrl, "--code", generateTotpCode(auth.secretBase32)], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 20_000
    });
    assert.equal(linkResult.status, 0, linkResult.stdout + linkResult.stderr);

    const startResult = runNodeCli(["start", "--port", String(nodePort)], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 180_000
    });

    assert.equal(startResult.status, 0, startResult.stdout + startResult.stderr);

    const response = await fetch(`http://127.0.0.1:${nodePort}/api/status`, {
      cache: "no-store"
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.cloud.linked, true);
    assert.equal(payload.cloud.url, cloudUrl);
    assert.ok(payload.cloud.nodeId);
    assert.ok(payload.cloud.nodeName);
    assert.match(payload.cloud.configPath, /config\.json$/);
  } finally {
    runNodeCli(["stop"], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 20_000
    });
    runNodeCli(["cloud", "stop"], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 20_000
    });
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud proxy can read node status after the linked node connector comes online", async () => {
  const nodeHome = makeTempDir("codexy-cloud-proxy-node-home-");
  const cloudHome = makeTempDir("codexy-cloud-proxy-cloud-home-");
  const nodePort = await getFreePort();
  const cloudPort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(["cloud", "start", "--port", String(cloudPort)], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 180_000
    });
    assert.equal(cloudStart.status, 0, cloudStart.stdout + cloudStart.stderr);

    const sessionCookie = await setupCloudAuthenticator(cloudUrl, cloudHome);
    const auth = readCloudAuthFile(cloudHome);

    const linkResult = runNodeCli(["link", cloudUrl, "--code", generateTotpCode(auth.secretBase32)], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 20_000
    });
    assert.equal(linkResult.status, 0, linkResult.stdout + linkResult.stderr);

    const nodeConfig = JSON.parse(readFileSync(path.join(nodeHome, "config.json"), "utf8"));
    const startResult = runNodeCli(["start", "--port", String(nodePort)], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 180_000
    });
    assert.equal(startResult.status, 0, startResult.stdout + startResult.stderr);

    const proxiedStatus = await waitForJson(
      `${cloudUrl}/api/cloud/nodes/${encodeURIComponent(nodeConfig.node.id)}/proxy/status`,
      (payload) => payload?.cloud?.url === cloudUrl,
      30_000,
      {
        headers: {
          cookie: sessionCookie
        }
      }
    );
    assert.equal(proxiedStatus.cloud.linked, true);
    assert.equal(proxiedStatus.cloud.url, cloudUrl);

    const workspaceResponse = await fetch(
      `${cloudUrl}/nodes/${encodeURIComponent(nodeConfig.node.id)}`,
      {
        cache: "no-store",
        headers: {
          cookie: sessionCookie
        }
      }
    );
    const workspaceHtml = await workspaceResponse.text();
    assert.equal(workspaceResponse.status, 200);
    assert.match(workspaceHtml, /Remote node workspace/);
    assert.match(workspaceHtml, new RegExp(nodeConfig.node.name));
  } finally {
    runNodeCli(["stop"], {
      env: {
        CODEXY_HOME_DIR: nodeHome
      },
      timeout: 20_000
    });
    runNodeCli(["cloud", "stop"], {
      env: {
        CODEXY_HOME_DIR: cloudHome
      },
      timeout: 20_000
    });
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});
