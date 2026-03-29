import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();
const cliScript = path.join(repoRoot, "scripts", "codexy.mjs");

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

async function waitForCloudProxyStatus(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        cache: "no-store"
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

test("cloud mode serves the dashboard shell", async ({ page }) => {
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

    await page.goto(`http://127.0.0.1:${cloudPort}`, {
      waitUntil: "domcontentloaded"
    });

    await expect(page.getByText("Codexy Cloud")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked nodes" })).toBeVisible();
    await expect(page.getByText("No nodes linked yet.")).toBeVisible();
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

    const linkResult = runNodeCli(["link", cloudUrl], nodeHome);
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
      `${cloudUrl}/api/cloud/nodes/${encodeURIComponent(nodeId)}/proxy/status`
    );

    await page.goto(`${cloudUrl}/nodes/${encodeURIComponent(nodeId)}`, {
      waitUntil: "domcontentloaded"
    });

    await expect(page.getByText("Remote node workspace")).toBeVisible();
    await expect(page.getByText("Back to dashboard")).toBeVisible();
  } finally {
    runNodeCli(["stop"], nodeHome, 20_000);
    runNodeCli(["cloud", "stop"], cloudHome, 20_000);
    rmSync(nodeHome, { recursive: true, force: true });
    rmSync(cloudHome, { recursive: true, force: true });
  }
});
