import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const repoRoot = process.cwd();
const cliScript = path.join(repoRoot, "scripts", "codexy.mjs");
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function runNodeCli(
  args: string[],
  homeDir: string,
  timeout = 180_000,
  envOverrides: Record<string, string> = {}
) {
  const result = spawnSync(process.execPath, [cliScript, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEXY_HOME_DIR: homeDir,
      ...envOverrides
    },
    encoding: "utf8",
    timeout,
    windowsHide: true
  });

  return {
    ...result,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function makeTempDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function decodeBase32(input: string) {
  const normalized = input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[\s-]+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

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

function readCloudAuthSecret(homeDir: string) {
  const authPath = path.join(homeDir, "cloud", "auth.json");
  const payload = JSON.parse(readFileSync(authPath, "utf8")) as {
    secretBase32: string;
  };

  return payload.secretBase32;
}

function generateTotpCode(secretBase32: string, now = Date.now()) {
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

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
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

async function waitForCloudProxyStatus(
  url: string,
  cookieHeader: string,
  timeoutMs = 30_000
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          cookie: cookieHeader
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch {}

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error(`Timed out waiting for cloud proxy status at ${url}.`);
}

async function bindCloudAuthenticator(page: Page, cloudUrl: string, cloudHome: string) {
  await page.goto(cloudUrl, {
    waitUntil: "domcontentloaded"
  });

  await expect(page.getByRole("heading", { name: "Bind Google Authenticator" })).toBeVisible();
  const code = generateTotpCode(readCloudAuthSecret(cloudHome));
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Bind authenticator" }).click();
  await expect(page.getByText("Codexy Cloud")).toBeVisible();
}

async function getSessionCookieHeader(page: Page, cloudUrl: string) {
  const cookies = await page.context().cookies(cloudUrl);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

test("cloud mode requires TOTP setup before showing the dashboard", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-playwright-home-");
  const cloudPort = await getFreePort();
  const runtimeSuffix = Date.now().toString();

  try {
    const startResult = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: `.next-runtime-cloud-playwright-${runtimeSuffix}`
      }
    );
    expect(startResult.status, startResult.stdout + startResult.stderr).toBe(0);

    const cloudUrl = `http://127.0.0.1:${cloudPort}`;
    await bindCloudAuthenticator(page, cloudUrl, cloudHome);
    await expect(page.getByText("Codexy Cloud")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked nodes" })).toBeVisible();
    await expect(page.getByText("No nodes linked yet.")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Enter your authenticator code" })).toBeVisible();

    const loginCode = generateTotpCode(readCloudAuthSecret(cloudHome));
    await page.getByLabel("6-digit code").fill(loginCode);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Codexy Cloud")).toBeVisible();
  } finally {
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud dashboard refreshes when a new node links in", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-refresh-home-");
  const nodeHome = makeTempDir("codexy-cloud-refresh-node-");
  const cloudPort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;
  const runtimeSuffix = Date.now().toString();

  try {
    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: `.next-runtime-cloud-playwright-${runtimeSuffix}`
      }
    );
    expect(cloudStart.status, cloudStart.stdout + cloudStart.stderr).toBe(0);

    await bindCloudAuthenticator(page, cloudUrl, cloudHome);
    await expect(page.getByText("0 linked nodes")).toBeVisible();
    await expect(page.getByText("No nodes linked yet.")).toBeVisible();

    const linkResult = runNodeCli(
      ["link", cloudUrl, "--code", generateTotpCode(readCloudAuthSecret(cloudHome))],
      nodeHome
    );
    expect(linkResult.status, linkResult.stdout + linkResult.stderr).toBe(0);

    await expect(page.getByText("1 linked node")).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByRole("link", { name: "Open" })).toBeVisible({
      timeout: 15_000
    });
  } finally {
    runNodeCli(["unlink"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud mode can open a linked node workspace through the proxy", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-workspace-home-");
  const nodeHome = makeTempDir("codexy-cloud-workspace-node-");
  const cloudPort = await getFreePort();
  const nodePort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;
  const runtimeSuffix = Date.now().toString();

  try {
    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: `.next-runtime-cloud-playwright-${runtimeSuffix}`
      }
    );
    expect(cloudStart.status, cloudStart.stdout + cloudStart.stderr).toBe(0);

    await bindCloudAuthenticator(page, cloudUrl, cloudHome);
    const sessionCookie = await getSessionCookieHeader(page, cloudUrl);
    const linkResult = runNodeCli(
      ["link", cloudUrl, "--code", generateTotpCode(readCloudAuthSecret(cloudHome))],
      nodeHome
    );
    expect(linkResult.status, linkResult.stdout + linkResult.stderr).toBe(0);

    const nodeStart = runNodeCli(
      ["start", "--port", String(nodePort)],
      nodeHome,
      180_000,
      {
        NEXT_DIST_DIR: `.next-runtime-node-playwright-${runtimeSuffix}`
      }
    );
    expect(nodeStart.status, nodeStart.stdout + nodeStart.stderr).toBe(0);

    const nodeIdMatch = linkResult.stdout.match(/\(([0-9a-f-]{36})\)/i);
    expect(nodeIdMatch).not.toBeNull();
    const nodeId = nodeIdMatch?.[1] ?? "";

    await waitForCloudProxyStatus(
      `${cloudUrl}/api/cloud/nodes/${encodeURIComponent(nodeId)}/proxy/status`,
      sessionCookie
    );

    await page.goto(`${cloudUrl}/nodes/${encodeURIComponent(nodeId)}`, {
      waitUntil: "domcontentloaded"
    });

    await expect(page.getByText("Remote node workspace")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByText("Log out of this cloud session?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Log out of this cloud session?")).toHaveCount(0);
  } finally {
    runNodeCli(["stop"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});
