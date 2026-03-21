import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { dockEnv } from "@/lib/codex/env";

const execFileAsync = promisify(execFile);

type RawTailscaleStatus = {
  BackendState?: string;
  TailscaleIPs?: string[];
  Self?: {
    DNSName?: string;
    HostName?: string;
    Online?: boolean;
    TailscaleIPs?: string[];
  };
};

export type TailscaleSummary = {
  connected: boolean;
  backendState: string;
  dnsName: string | null;
  hostName: string | null;
  ips: string[];
  serveHint: string;
  error: string | null;
};

export async function getTailscaleSummary(): Promise<TailscaleSummary> {
  try {
    const { stdout } = await execFileAsync(
      dockEnv.tailscaleBinary,
      ["status", "--json"],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );

    const status = JSON.parse(stdout) as RawTailscaleStatus;

    return {
      connected:
        status.BackendState === "Running" && status.Self?.Online !== false,
      backendState: status.BackendState ?? "Unknown",
      dnsName: status.Self?.DNSName?.replace(/\.$/, "") ?? null,
      hostName: status.Self?.HostName ?? null,
      ips: status.Self?.TailscaleIPs ?? status.TailscaleIPs ?? [],
      serveHint: "tailscale serve --bg 3000",
      error: null
    };
  } catch (error) {
    return {
      connected: false,
      backendState: "Unavailable",
      dnsName: null,
      hostName: null,
      ips: [],
      serveHint: "tailscale serve --bg 3000",
      error: error instanceof Error ? error.message : "Unable to query Tailscale"
    };
  }
}
