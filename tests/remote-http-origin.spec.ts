import os from "node:os";

import { expect, test } from "@playwright/test";
import { WebSocket } from "ws";

const nextDevPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "3100");

type NetworkInterfaceEntry = {
  family?: string | number;
  internal?: boolean;
  address?: string;
};

function getNonLoopbackIpv4() {
  const interfaces = Object.values(os.networkInterfaces()) as Array<
    NetworkInterfaceEntry[] | undefined
  >;

  for (const networkEntries of interfaces) {
    const entries = networkEntries ?? [];

    for (const entry of entries) {
      const family =
        typeof entry.family === "string" ? entry.family : String(entry.family);
      if (family !== "IPv4" || entry.internal || !entry.address) {
        continue;
      }

      return entry.address;
    }
  }

  return null;
}

function openNextDevHmr(origin: string) {
  return new Promise<{ opened: boolean; error?: string }>((resolve) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${nextDevPort}/_next/webpack-hmr?page=/`,
      {
        headers: {
          Origin: origin
        }
      }
    );
    let settled = false;

    function finish(result: { opened: boolean; error?: string }) {
      if (settled) {
        return;
      }

      settled = true;
      try {
        socket.terminate();
      } catch {
        // ignore shutdown races during test cleanup
      }
      resolve(result);
    }

    const timer = setTimeout(() => {
      finish({
        opened: false,
        error: "Timed out waiting for Next dev HMR websocket to open."
      });
    }, 5_000);

    socket.once("open", () => {
      clearTimeout(timer);
      finish({ opened: true });
    });

    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      let body = "";
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        finish({
          opened: false,
          error: `Unexpected response ${response.statusCode ?? "unknown"}: ${body.slice(0, 160)}`
        });
      });
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      finish({
        opened: false,
        error: error.message
      });
    });

    socket.once("close", (code, reason) => {
      clearTimeout(timer);
      finish({
        opened: false,
        error: `Socket closed before opening (${code}): ${reason.toString()}`
      });
    });
  });
}

test("next dev accepts an active non-loopback host origin for HMR", async () => {
  const host = getNonLoopbackIpv4();
  test.skip(!host, "No active non-loopback IPv4 host was available.");

  const result = await openNextDevHmr(`http://${host}:${nextDevPort}`);

  expect(result).toEqual({ opened: true });
});

test("next dev accepts nested ts.net origins for HMR", async () => {
  const result = await openNextDevHmr("https://codexy.tailff52e6.ts.net");

  expect(result).toEqual({ opened: true });
});
