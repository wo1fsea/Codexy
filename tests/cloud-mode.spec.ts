import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const repoRoot = process.cwd();
const cliScript = path.join(repoRoot, "scripts", "codexy.mjs");
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PLAYWRIGHT_RUNTIME_KEY = `${process.pid}`;
const CLOUD_NEXT_DIST_DIR = `.next-runtime-cloud-playwright-${PLAYWRIGHT_RUNTIME_KEY}`;
const NODE_NEXT_DIST_DIR = `.next-runtime-node-playwright-${PLAYWRIGHT_RUNTIME_KEY}`;

test.describe.configure({
  timeout: 120_000
});

function cleanupStalePlaywrightRuntimeDirs() {
  const keep = new Set([CLOUD_NEXT_DIST_DIR, NODE_NEXT_DIST_DIR]);

  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const name = entry.name;
    const isPlaywrightRuntimeDir =
      name.startsWith(".next-runtime-cloud-playwright-") ||
      name.startsWith(".next-runtime-node-playwright-");

    if (!isPlaywrightRuntimeDir || keep.has(name)) {
      continue;
    }

    rmSync(path.join(repoRoot, name), {
      recursive: true,
      force: true
    });
  }
}

cleanupStalePlaywrightRuntimeDirs();

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

async function readCloudProxyEventHead(
  url: string,
  cookieHeader: string,
  timeoutMs = 30_000
) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Cloud proxy events failed with status ${response.status}.`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Cloud proxy events response was not stream-backed.");
  }

  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    if (buffered.includes("\n\n")) {
      break;
    }
  }

  await reader.cancel();
  return buffered;
}

async function openCloudProxyEventStream(
  url: string,
  cookieHeader: string,
  timeoutMs = 30_000
) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Cloud proxy events failed with status ${response.status}.`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Cloud proxy events response was not stream-backed.");
  }

  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    if (buffered.includes("\n\n")) {
      break;
    }
  }

  return {
    response,
    reader,
    buffered
  };
}

async function fetchLinkedNodes(cloudUrl: string, cookieHeader: string) {
  const response = await fetch(`${cloudUrl}/api/cloud/nodes`, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch linked nodes from ${cloudUrl}.`);
  }

  const payload = (await response.json()) as {
    nodes?: Array<{
      displayName: string;
      nodeId: string;
      status: string;
    }>;
  };

  return Array.isArray(payload.nodes) ? payload.nodes : [];
}

async function getElementOverflow(locator: Locator) {
  return await locator.evaluate((element) => ({
    horizontal: element.scrollWidth - element.clientWidth,
    vertical: element.scrollHeight - element.clientHeight
  }));
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

  try {
    const startResult = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
      }
    );
    expect(startResult.status, startResult.stdout + startResult.stderr).toBe(0);

    const cloudUrl = `http://127.0.0.1:${cloudPort}`;
    await bindCloudAuthenticator(page, cloudUrl, cloudHome);
    await expect(page.getByText("Codexy Cloud")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked nodes" })).toBeVisible();
    await expect(page.getByText("No nodes linked yet.")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByText("Log out of this cloud session?")).toBeVisible();
    await page
      .locator(".dock-toolbar-confirm-popover")
      .getByRole("button", { name: "Log out" })
      .click();
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

test("cloud auth setup page scrolls on mobile viewports", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-mobile-auth-home-");
  const cloudPort = await getFreePort();

  try {
    await page.setViewportSize({
      width: 390,
      height: 640
    });

    const startResult = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
      }
    );
    expect(startResult.status, startResult.stdout + startResult.stderr).toBe(0);

    const cloudUrl = `http://127.0.0.1:${cloudPort}`;
    await page.goto(`${cloudUrl}/auth/setup`, {
      waitUntil: "domcontentloaded"
    });

    await expect(page.getByRole("heading", { name: "Bind Google Authenticator" })).toBeVisible();

    const authShell = page.locator(".cloud-auth-shell");
    const initialMetrics = await authShell.evaluate((element) => {
      const footer = element.querySelector(".cloud-auth-footer") as HTMLElement | null;

      return {
        clientHeight: element.clientHeight,
        footerBottom: footer?.getBoundingClientRect().bottom ?? 0,
        overflowY: window.getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        viewportHeight: window.innerHeight
      };
    });

    expect(initialMetrics.overflowY).toBe("auto");
    expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
    expect(initialMetrics.footerBottom).toBeGreaterThan(initialMetrics.viewportHeight);

    const scrollState = await authShell.evaluate((element) => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: "auto"
      });

      return {
        maxScrollTop: element.scrollHeight - element.clientHeight,
        scrollTop: element.scrollTop
      };
    });

    expect(scrollState.maxScrollTop).toBeGreaterThan(0);
    expect(scrollState.scrollTop).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Back" })).toBeInViewport();
  } finally {
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud dashboard scrolls on mobile viewports", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-mobile-dashboard-home-");
  const cloudPort = await getFreePort();

  try {
    await page.setViewportSize({
      width: 390,
      height: 560
    });

    const startResult = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
      }
    );
    expect(startResult.status, startResult.stdout + startResult.stderr).toBe(0);

    const cloudUrl = `http://127.0.0.1:${cloudPort}`;
    await bindCloudAuthenticator(page, cloudUrl, cloudHome);
    await expect(page.getByRole("heading", { name: "Linked nodes" })).toBeVisible();

    const dashboardShell = page.locator(".cloud-app-shell");
    const initialMetrics = await dashboardShell.evaluate((element) => {
      const panel = element.querySelector(".cloud-panel") as HTMLElement | null;
      const shellRect = element.getBoundingClientRect();

      return {
        clientHeight: element.clientHeight,
        overflowY: window.getComputedStyle(element).overflowY,
        panelBottom: panel?.getBoundingClientRect().bottom ?? 0,
        rectHeight: shellRect.height,
        scrollHeight: element.scrollHeight,
        viewportHeight: window.innerHeight
      };
    });

    expect(initialMetrics.overflowY).toBe("auto");
    expect(initialMetrics.rectHeight).toBeLessThanOrEqual(initialMetrics.viewportHeight + 1);
    expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
    expect(initialMetrics.panelBottom).toBeGreaterThan(initialMetrics.viewportHeight);

    const scrollState = await dashboardShell.evaluate((element) => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: "auto"
      });

      return {
        maxScrollTop: element.scrollHeight - element.clientHeight,
        scrollTop: element.scrollTop
      };
    });

    expect(scrollState.maxScrollTop).toBeGreaterThan(0);
    expect(scrollState.scrollTop).toBeGreaterThan(0);
    await expect(page.getByText("No nodes linked yet.")).toBeInViewport();
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

  try {
    await page.setViewportSize({
      width: 1400,
      height: 900
    });

    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
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
    await expect(page.getByRole("link", { name: "Open", exact: true })).toBeVisible({
      timeout: 15_000
    });
    const nodeGridBox = await page.locator(".cloud-node-grid").boundingBox();
    const nodeCardBox = await page.locator(".cloud-node-card").boundingBox();
    expect(nodeGridBox).not.toBeNull();
    expect(nodeCardBox).not.toBeNull();
    expect(nodeCardBox?.width ?? 0).toBeLessThan((nodeGridBox?.width ?? 0) * 0.7);
  } finally {
    runNodeCli(["unlink"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud dashboard copy button copies the link command", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-copy-home-");
  const cloudPort = await getFreePort();

  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, "__copiedCommand", {
        configurable: true,
        enumerable: false,
        value: null,
        writable: true
      });

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as typeof window & { __copiedCommand: string | null }).__copiedCommand =
              value;
          }
        }
      });
    });

    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
      }
    );
    expect(cloudStart.status, cloudStart.stdout + cloudStart.stderr).toBe(0);

    const cloudUrl = `http://127.0.0.1:${cloudPort}`;
    await bindCloudAuthenticator(page, cloudUrl, cloudHome);

    const copyButton = page.getByRole("button", { name: "Copy command" });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(page.getByRole("button", { name: "Copied command" })).toBeVisible();

    const copiedCommand = await page.evaluate(
      () =>
        (window as typeof window & { __copiedCommand: string | null }).__copiedCommand
    );
    expect(copiedCommand).toBe(`codexy link ${cloudUrl} --code 123456`);
  } finally {
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud mode can open a linked node workspace through the proxy", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-workspace-home-");
  const nodeHome = makeTempDir("codexy-cloud-workspace-node-");
  const cloudPort = await getFreePort();
  const nodePort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
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
        NEXT_DIST_DIR: NODE_NEXT_DIST_DIR
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

test("cloud remote workspace keeps a single-line mobile header and fills the remaining viewport", async ({
  page
}) => {
  const cloudHome = makeTempDir("codexy-cloud-mobile-remote-home-");
  const nodeHome = makeTempDir("codexy-cloud-mobile-remote-node-");
  const cloudPort = await getFreePort();
  const nodePort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    await page.setViewportSize({
      width: 390,
      height: 844
    });

    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
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
        NEXT_DIST_DIR: NODE_NEXT_DIST_DIR
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

    const workspaceLine = page.locator(".cloud-remote-workspace-line");
    const header = page.locator(".cloud-remote-header");
    const copy = page.locator(".cloud-remote-copy");
    const status = page.locator(".cloud-remote-status");

    const lineMetrics = await workspaceLine.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(lineMetrics.scrollHeight).toBeLessThanOrEqual(lineMetrics.clientHeight + 1);
    expect(lineMetrics.scrollWidth).toBeLessThanOrEqual(lineMetrics.clientWidth + 1);

    const headerBox = await header.boundingBox();
    const copyBox = await copy.boundingBox();
    const statusBox = await status.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(copyBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(headerBox?.height ?? 0).toBeLessThanOrEqual(56);
    expect(Math.abs((copyBox?.y ?? 0) - (statusBox?.y ?? 0))).toBeLessThan(3);

    const shellMetrics = await page.evaluate(() => {
      const shell = document.querySelector(".cloud-remote-shell") as HTMLElement | null;
      const headerElement = document.querySelector(".cloud-remote-header") as HTMLElement | null;
      const stageElement = document.querySelector(".cloud-remote-stage") as HTMLElement | null;
      const dockAppElement = document.querySelector(
        ".cloud-remote-stage .dock-app"
      ) as HTMLElement | null;

      if (!shell || !headerElement || !stageElement || !dockAppElement) {
        return null;
      }

      return {
        viewportHeight: window.innerHeight,
        shellHeight: shell.clientHeight,
        headerHeight: headerElement.clientHeight,
        stageHeight: stageElement.clientHeight,
        stageBottom: stageElement.getBoundingClientRect().bottom,
        dockAppHeight: dockAppElement.clientHeight
      };
    });

    expect(shellMetrics).not.toBeNull();
    expect(shellMetrics!.shellHeight).toBeLessThanOrEqual(shellMetrics!.viewportHeight + 1);
    expect(shellMetrics!.stageBottom).toBeLessThanOrEqual(shellMetrics!.viewportHeight + 1);
    expect(Math.abs(shellMetrics!.stageHeight - shellMetrics!.dockAppHeight)).toBeLessThanOrEqual(
      1
    );
    expect(
      Math.abs(
        shellMetrics!.shellHeight - (shellMetrics!.headerHeight + shellMetrics!.stageHeight)
      )
    ).toBeLessThanOrEqual(1);
  } finally {
    runNodeCli(["stop"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud proxy events stream sends the initial connection event", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-events-home-");
  const nodeHome = makeTempDir("codexy-cloud-events-node-");
  const cloudPort = await getFreePort();
  const nodePort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
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
        NEXT_DIST_DIR: NODE_NEXT_DIST_DIR
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

    const eventHead = await readCloudProxyEventHead(
      `${cloudUrl}/api/cloud/nodes/${encodeURIComponent(nodeId)}/proxy/events`,
      sessionCookie
    );
    expect(eventHead).toContain('"type":"connection"');
    expect(eventHead).toContain('"status":"connected"');
  } finally {
    runNodeCli(["stop"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud proxy keeps buffered requests responsive while events stay open", async ({
  page
}) => {
  const cloudHome = makeTempDir("codexy-cloud-events-live-home-");
  const nodeHome = makeTempDir("codexy-cloud-events-live-node-");
  const cloudPort = await getFreePort();
  const nodePort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
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
        NEXT_DIST_DIR: NODE_NEXT_DIST_DIR
      }
    );
    expect(nodeStart.status, nodeStart.stdout + nodeStart.stderr).toBe(0);

    const nodeIdMatch = linkResult.stdout.match(/\(([0-9a-f-]{36})\)/i);
    expect(nodeIdMatch).not.toBeNull();
    const nodeId = nodeIdMatch?.[1] ?? "";
    const encodedNodeId = encodeURIComponent(nodeId);

    await waitForCloudProxyStatus(
      `${cloudUrl}/api/cloud/nodes/${encodedNodeId}/proxy/status`,
      sessionCookie
    );

    const stream = await openCloudProxyEventStream(
      `${cloudUrl}/api/cloud/nodes/${encodedNodeId}/proxy/events`,
      sessionCookie
    );
    expect(stream.buffered).toContain('"type":"connection"');

    const statusResponse = await fetch(
      `${cloudUrl}/api/cloud/nodes/${encodedNodeId}/proxy/status`,
      {
        cache: "no-store",
        headers: {
          cookie: sessionCookie
        },
        signal: AbortSignal.timeout(15_000)
      }
    );
    expect(statusResponse.ok).toBe(true);

    const statusPayload = (await statusResponse.json()) as {
      runtimeMode?: string;
    };
    expect(statusPayload.runtimeMode).toBe("node");

    await stream.reader.cancel();
  } finally {
    runNodeCli(["stop"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});

test("cloud wall can show the same linked node in multiple panes", async ({ page }) => {
  const cloudHome = makeTempDir("codexy-cloud-wall-home-");
  const nodeHome = makeTempDir("codexy-cloud-wall-node-");
  const cloudPort = await getFreePort();
  const nodePort = await getFreePort();
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  try {
    const cloudStart = runNodeCli(
      ["cloud", "start", "--port", String(cloudPort)],
      cloudHome,
      180_000,
      {
        NEXT_DIST_DIR: CLOUD_NEXT_DIST_DIR
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
        NEXT_DIST_DIR: NODE_NEXT_DIST_DIR
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

    const nodes = await fetchLinkedNodes(cloudUrl, sessionCookie);
    expect(nodes.length).toBeGreaterThan(0);
    const nodeName = nodes[0]?.displayName ?? "";

    await page.setViewportSize({
      width: 2000,
      height: 1100
    });
    await page.goto(`${cloudUrl}/wall`, {
      waitUntil: "domcontentloaded"
    });

    await expect(page.getByText("Workspace wall", { exact: true })).toBeVisible();
    await expect(page.locator("[data-cloud-wall-pane]")).toHaveCount(4);
    await expect(page.locator('[data-cloud-wall-connected=\"true\"]')).toHaveCount(1);
    await expect(page.locator(".cloud-wall-pane .dock-shell")).toHaveCount(1);

    await page.getByRole("button", { name: "Wall pane 2 node" }).click();
    await page.getByRole("option", { name: nodeName }).click();

    await expect(page.locator('[data-cloud-wall-connected=\"true\"]')).toHaveCount(2);
    await expect(page.locator(".cloud-wall-pane .dock-shell")).toHaveCount(2);

    const wideFirstPane = page.locator("[data-cloud-wall-pane]").nth(0);
    const wideSecondPane = page.locator("[data-cloud-wall-pane]").nth(1);
    const wideFirstBox = await wideFirstPane.boundingBox();
    const wideSecondBox = await wideSecondPane.boundingBox();

    expect(wideFirstBox).not.toBeNull();
    expect(wideSecondBox).not.toBeNull();
    expect(Math.abs((wideSecondBox?.y ?? 0) - (wideFirstBox?.y ?? 0))).toBeLessThan(4);
    await expect(wideFirstPane.locator(".dock-app")).toHaveAttribute(
      "data-dock-responsive-mode",
      "compact"
    );

    await page.setViewportSize({
      width: 1200,
      height: 900
    });
    const dynamicFirstBox = await wideFirstPane.boundingBox();
    const dynamicSecondBox = await wideSecondPane.boundingBox();
    expect(dynamicFirstBox).not.toBeNull();
    expect(dynamicSecondBox).not.toBeNull();
    expect(Math.abs((dynamicSecondBox?.y ?? 0) - (dynamicFirstBox?.y ?? 0))).toBeLessThan(4);
    await expect(wideFirstPane.locator(".dock-app")).toHaveAttribute(
      "data-dock-responsive-mode",
      "mobile"
    );
    await expect(wideFirstPane).toHaveAttribute("data-cloud-wall-pane-mode", "mobile");
    const dynamicStageHeaderOverflow = await getElementOverflow(
      wideFirstPane.locator(".dock-stage-header")
    );
    expect(dynamicStageHeaderOverflow.horizontal).toBeLessThanOrEqual(1);
    const dynamicEmptyPaneOverflow = await getElementOverflow(
      page.locator("[data-cloud-wall-pane]").nth(2).locator(".cloud-wall-pane-head")
    );
    expect(dynamicEmptyPaneOverflow.horizontal).toBeLessThanOrEqual(1);
    const dynamicShellBounds = await wideFirstPane.evaluate((pane) => {
      const body = pane.querySelector(".cloud-wall-pane-body");
      const shell = pane.querySelector(".dock-shell");
      if (!(body instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
        return null;
      }

      const bodyRect = body.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      return {
        rightGap: shellRect.right - bodyRect.right,
        bottomGap: shellRect.bottom - bodyRect.bottom
      };
    });
    expect(dynamicShellBounds).not.toBeNull();
    expect(dynamicShellBounds?.rightGap ?? 0).toBeLessThanOrEqual(1);
    expect(dynamicShellBounds?.bottomGap ?? 0).toBeLessThanOrEqual(1);

    await page.setViewportSize({
      width: 1200,
      height: 900
    });
    await page.goto(`${cloudUrl}/wall`, {
      waitUntil: "domcontentloaded"
    });

    const mediumFirstPane = page.locator("[data-cloud-wall-pane]").nth(0);
    const mediumSecondPane = page.locator("[data-cloud-wall-pane]").nth(1);
    const mediumFirstBox = await mediumFirstPane.boundingBox();
    const mediumSecondBox = await mediumSecondPane.boundingBox();

    expect(mediumFirstBox).not.toBeNull();
    expect(mediumSecondBox).not.toBeNull();
    expect(Math.abs((mediumSecondBox?.y ?? 0) - (mediumFirstBox?.y ?? 0))).toBeLessThan(4);
    await expect(mediumFirstPane.locator(".dock-app")).toHaveAttribute(
      "data-dock-responsive-mode",
      "mobile"
    );
    await expect(mediumFirstPane).toHaveAttribute("data-cloud-wall-pane-mode", "mobile");
    expect(mediumFirstBox?.height ?? 0).toBeGreaterThanOrEqual((mediumFirstBox?.width ?? 0) * 1.45);
    await expect(
      mediumFirstPane.locator(".cloud-wall-pane-head").evaluate((element) =>
        window.getComputedStyle(element).flexWrap
      )
    ).resolves.toBe("nowrap");
    const mediumLabelBox = await mediumFirstPane.locator(".cloud-wall-pane-label").boundingBox();
    const mediumNameBox = await mediumFirstPane.locator(".cloud-wall-pane-name").boundingBox();
    expect(mediumLabelBox).not.toBeNull();
    expect(mediumNameBox).not.toBeNull();
    expect(Math.abs((mediumNameBox?.y ?? 0) - (mediumLabelBox?.y ?? 0))).toBeLessThan(4);
    const emptyPane = page.locator("[data-cloud-wall-pane]").nth(2);
    await expect(emptyPane).toHaveAttribute("data-cloud-wall-pane-mode", "mobile");
    const emptyCopyBox = await emptyPane.locator(".cloud-wall-pane-copy").boundingBox();
    const emptyControlsBox = await emptyPane.locator(".cloud-wall-pane-controls").boundingBox();
    expect(emptyCopyBox).not.toBeNull();
    expect(emptyControlsBox).not.toBeNull();
    expect((emptyCopyBox?.x ?? 0) + (emptyCopyBox?.width ?? 0)).toBeLessThanOrEqual(
      (emptyControlsBox?.x ?? 0) + 1
    );
    const emptyHeadMetrics = await emptyPane.locator(".cloud-wall-pane-head").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(emptyHeadMetrics.scrollWidth).toBeLessThanOrEqual(emptyHeadMetrics.clientWidth + 1);

    await page.setViewportSize({
      width: 1050,
      height: 900
    });
    await page.goto(`${cloudUrl}/wall`, {
      waitUntil: "domcontentloaded"
    });

    const firstPane = page.locator("[data-cloud-wall-pane]").nth(0);
    const secondPane = page.locator("[data-cloud-wall-pane]").nth(1);
    const firstBox = await firstPane.boundingBox();
    const secondBox = await secondPane.boundingBox();

    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(Math.abs((secondBox?.y ?? 0) - (firstBox?.y ?? 0))).toBeLessThan(4);
    expect(firstBox?.height ?? 0).toBeGreaterThanOrEqual((firstBox?.width ?? 0) * 1.45);
    await expect(firstPane).toHaveAttribute("data-cloud-wall-pane-mode", "mobile");
    await expect(firstPane.locator(".dock-app")).toHaveAttribute(
      "data-dock-responsive-mode",
      "mobile"
    );

    const shellScroll = await page.locator(".cloud-wall-shell").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    expect(shellScroll.scrollHeight).toBeGreaterThan(shellScroll.clientHeight);

    const shellScrollTop = await page.locator(".cloud-wall-shell").evaluate((element) => {
      element.scrollTop = 240;
      return element.scrollTop;
    });
    expect(shellScrollTop).toBeGreaterThan(0);

    await page.setViewportSize({
      width: 720,
      height: 900
    });
    await page.goto(`${cloudUrl}/wall`, {
      waitUntil: "domcontentloaded"
    });

    const narrowFirstPane = page.locator("[data-cloud-wall-pane]").nth(0);
    const narrowSecondPane = page.locator("[data-cloud-wall-pane]").nth(1);
    const narrowFirstBox = await narrowFirstPane.boundingBox();
    const narrowSecondBox = await narrowSecondPane.boundingBox();
    expect(narrowFirstBox).not.toBeNull();
    expect(narrowSecondBox).not.toBeNull();
    expect(narrowSecondBox?.y ?? 0).toBeGreaterThan(
      (narrowFirstBox?.y ?? 0) + (narrowFirstBox?.height ?? 0) - 2
    );
    await expect(narrowFirstPane).toHaveAttribute("data-cloud-wall-pane-mode", "mobile");
    await expect(narrowFirstPane.locator(".dock-app")).toHaveAttribute(
      "data-dock-responsive-mode",
      "mobile"
    );
    await expect(
      narrowFirstPane.locator(".dock-stage-heading .dock-mobile-only")
    ).toBeVisible();
    await expect(
      narrowFirstPane.locator(".dock-left-stack").evaluate((element) =>
        window.getComputedStyle(element).position
      )
    ).resolves.toBe("absolute");
    const wallHeaderCopyBox = await page.locator(".cloud-wall-header-copy").boundingBox();
    const wallHeaderActionsBox = await page.locator(".cloud-wall-header-actions").boundingBox();
    expect(wallHeaderCopyBox).not.toBeNull();
    expect(wallHeaderActionsBox).not.toBeNull();
    expect(Math.abs((wallHeaderActionsBox?.y ?? 0) - (wallHeaderCopyBox?.y ?? 0))).toBeLessThan(4);
    const wallHeaderCountMetrics = await page.locator(".cloud-wall-header-count").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    expect(wallHeaderCountMetrics.scrollHeight).toBeLessThanOrEqual(
      wallHeaderCountMetrics.clientHeight + 1
    );
  } finally {
    runNodeCli(["stop"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});
