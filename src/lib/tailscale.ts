import {
  spawn,
  type ChildProcessByStdio
} from "node:child_process";
import type { Readable } from "node:stream";

import { dockEnv } from "@/lib/codex/env";

const LOCALAPI_PROXY_TIMEOUT_MS = 8_000;
const LOCALAPI_REQUEST_TIMEOUT_MS = 10_000;
const SERVE_RETRY_WINDOW_MS = 60_000;

let localApiProxyProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
let localApiProxyUrl: string | null = null;
let localApiProxyPromise: Promise<string> | null = null;

let ensureServePromise: Promise<EnsureServeResult> | null = null;
let lastServeState:
  | (EnsureServeResult & {
      checkedAt: number;
    })
  | null = null;

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

type RawServeConfig = {
  TCP?: Record<string, { HTTPS?: boolean; HTTP?: boolean; TCPForward?: string }>;
  Web?: Record<
    string,
    {
      Handlers?: Record<
        string,
        {
          Proxy?: string;
          Path?: string;
          Text?: string;
          Redirect?: string;
        }
      >;
    }
  >;
} | null;

export type TailscaleSummary = {
  connected: boolean;
  backendState: string;
  dnsName: string | null;
  hostName: string | null;
  ips: string[];
  serveConfigured: boolean;
  tailnetUrl: string | null;
  serveHint: string;
  error: string | null;
};

type EnsureServeResult = {
  configured: boolean;
  error: string | null;
};

function getServeHint() {
  return `LocalAPI POST /localapi/v0/serve-config -> https://${"{node}.ts.net"}/ -> http://127.0.0.1:${dockEnv.webPort}`;
}

function getDesiredServeConfig(dnsName: string): Exclude<RawServeConfig, null> {
  return {
    TCP: {
      "443": {
        HTTPS: true
      }
    },
    Web: {
      [`${dnsName}:443`]: {
        Handlers: {
          "/": {
            Proxy: `http://127.0.0.1:${dockEnv.webPort}`
          }
        }
      }
    }
  };
}

function getDesiredTailnetUrl(dnsName: string) {
  return `https://${dnsName}`;
}

function isDesiredServeConfig(config: RawServeConfig, dnsName: string) {
  if (!config) {
    return false;
  }

  const hostPort = `${dnsName}:443`;
  const httpsEnabled = config.TCP?.["443"]?.HTTPS === true;
  const rootProxy = config.Web?.[hostPort]?.Handlers?.["/"]?.Proxy;

  return httpsEnabled && rootProxy === `http://127.0.0.1:${dockEnv.webPort}`;
}

function hasAnyServeConfig(config: RawServeConfig) {
  return Boolean(
    config &&
      ((config.TCP && Object.keys(config.TCP).length > 0) ||
        (config.Web && Object.keys(config.Web).length > 0))
  );
}

function cacheServeState(result: EnsureServeResult) {
  lastServeState = {
    ...result,
    checkedAt: Date.now()
  };

  return result;
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

async function ensureLocalApiProxy(): Promise<string> {
  if (
    localApiProxyUrl &&
    localApiProxyProcess &&
    localApiProxyProcess.exitCode === null &&
    !localApiProxyProcess.killed
  ) {
    return localApiProxyUrl;
  }

  if (localApiProxyPromise) {
    return localApiProxyPromise;
  }

  localApiProxyPromise = new Promise<string>((resolve, reject) => {
    const child = spawn(dockEnv.tailscaleBinary, ["debug", "local-creds"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    localApiProxyProcess = child;

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: { url?: string; error?: string }) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("exit", onExitBeforeReady);

      if (result.url) {
        localApiProxyUrl = result.url;
        child.once("exit", () => {
          localApiProxyProcess = null;
          localApiProxyUrl = null;
        });
        resolve(result.url);
        return;
      }

      localApiProxyProcess = null;
      localApiProxyUrl = null;
      if (child.exitCode === null && !child.killed) {
        child.kill();
      }
      reject(new Error(result.error || "Unable to start Tailscale LocalAPI proxy."));
    };

    const onStdout = (chunk: Buffer | string) => {
      stdout += chunk.toString();
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        finish({ url: match[0] });
      }
    };

    const onStderr = (chunk: Buffer | string) => {
      stderr += chunk.toString();
    };

    const onError = (error: Error) => {
      finish({ error: error.message });
    };

    const onExitBeforeReady = (code: number | null, signal: NodeJS.Signals | null) => {
      finish({
        error:
          stderr.trim() ||
          stdout.trim() ||
          `Tailscale LocalAPI proxy exited before becoming ready (${code ?? signal ?? "unknown"}).`
      });
    };

    const timer = setTimeout(() => {
      finish({
        error:
          stderr.trim() ||
          stdout.trim() ||
          "Timed out waiting for Tailscale LocalAPI proxy."
      });
    }, LOCALAPI_PROXY_TIMEOUT_MS);

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("exit", onExitBeforeReady);
  });

  try {
    return await localApiProxyPromise;
  } finally {
    localApiProxyPromise = null;
  }
}

async function localApiFetch(path: string, init?: RequestInit) {
  const baseUrl = await ensureLocalApiProxy();
  const timeout = createTimeoutSignal(LOCALAPI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: timeout.signal,
      cache: "no-store"
    });

    return response;
  } finally {
    timeout.dispose();
  }
}

async function readJson<T>(path: string): Promise<T> {
  const response = await localApiFetch(path, {
    method: "GET"
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `LocalAPI request failed: ${response.status}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

async function writeJson(path: string, body: unknown) {
  const response = await localApiFetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `LocalAPI write failed: ${response.status}`);
  }
}

async function ensureTailscaleServe(dnsName: string): Promise<EnsureServeResult> {
  const now = Date.now();
  if (lastServeState && now - lastServeState.checkedAt < SERVE_RETRY_WINDOW_MS) {
    return {
      configured: lastServeState.configured,
      error: lastServeState.error
    };
  }

  if (ensureServePromise) {
    return ensureServePromise;
  }

  ensureServePromise = (async () => {
    const currentConfig = await readJson<RawServeConfig>("/localapi/v0/serve-config");
    if (isDesiredServeConfig(currentConfig, dnsName)) {
      return cacheServeState({
        configured: true,
        error: null
      });
    }

    if (hasAnyServeConfig(currentConfig)) {
      return cacheServeState({
        configured: false,
        error:
          "Existing Tailscale serve config is already present on this node, so Codexy did not overwrite it."
      });
    }

    try {
      await writeJson(
        "/localapi/v0/serve-config",
        getDesiredServeConfig(dnsName)
      );
    } catch (error) {
      return cacheServeState({
        configured: false,
        error: error instanceof Error ? error.message : "Unable to configure Tailscale serve."
      });
    }

    const nextConfig = await readJson<RawServeConfig>("/localapi/v0/serve-config");
    return cacheServeState({
      configured: isDesiredServeConfig(nextConfig, dnsName),
      error: isDesiredServeConfig(nextConfig, dnsName)
        ? null
        : "Tailscale LocalAPI accepted the serve update, but the expected Codexy route was not present afterward."
    });
  })();

  try {
    return await ensureServePromise;
  } finally {
    ensureServePromise = null;
  }
}

export async function getTailscaleSummary(): Promise<TailscaleSummary> {
  const serveHint = getServeHint();

  try {
    const status = await readJson<RawTailscaleStatus>("/localapi/v0/status");
    const connected =
      status.BackendState === "Running" && status.Self?.Online !== false;
    const dnsName = status.Self?.DNSName?.replace(/\.$/, "") ?? null;
    const ips = status.Self?.TailscaleIPs ?? status.TailscaleIPs ?? [];
    let serveConfigured = false;
    let tailnetUrl: string | null = null;
    let error: string | null = null;

    if (connected && dnsName && dockEnv.autoStartTailscaleServe) {
      const serveResult = await ensureTailscaleServe(dnsName);
      serveConfigured = serveResult.configured;
      tailnetUrl = serveConfigured ? getDesiredTailnetUrl(dnsName) : null;
      error = serveResult.error;
    }

    return {
      connected,
      backendState: status.BackendState ?? "Unknown",
      dnsName,
      hostName: status.Self?.HostName ?? null,
      ips,
      serveConfigured,
      tailnetUrl,
      serveHint,
      error
    };
  } catch (error) {
    return {
      connected: false,
      backendState: "Unavailable",
      dnsName: null,
      hostName: null,
      ips: [],
      serveConfigured: false,
      tailnetUrl: null,
      serveHint,
      error: error instanceof Error ? error.message : "Unable to query Tailscale LocalAPI"
    };
  }
}
