import path from "node:path";

function readEnv(name: string) {
  return process.env[name];
}

function readIntEnv(name: string, fallback: number) {
  const raw = readEnv(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const uploadRoot =
  readEnv("CODEXY_UPLOAD_ROOT") ?? path.join(process.cwd(), ".codexy", "uploads");
const codexAppServerUrlOverride = readEnv("CODEXY_CODEX_APP_SERVER_URL");

export const dockEnv = {
  codexBinary: readEnv("CODEXY_CODEX_BIN") ?? "codex",
  codexAppServerUrl: codexAppServerUrlOverride ?? "ws://127.0.0.1:39031",
  hasCodexAppServerUrlOverride: Boolean(codexAppServerUrlOverride),
  autoSpawnBridge: readEnv("CODEXY_AUTO_SPAWN") !== "false",
  autoStartTailscaleServe: readEnv("CODEXY_AUTO_TAILSCALE_SERVE") !== "false",
  defaultCwd: readEnv("CODEXY_DEFAULT_CWD") ?? process.cwd(),
  defaultApprovalPolicy: "on-request" as const,
  defaultSandboxMode: "workspace-write" as const,
  uploadRoot,
  tailscaleBinary: readEnv("CODEXY_TAILSCALE_BIN") ?? "tailscale",
  webPort: readIntEnv("PORT", readIntEnv("CODEXY_WEB_PORT", 3000))
};
