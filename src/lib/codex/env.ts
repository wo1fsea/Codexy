import path from "node:path";

function readEnv(name: string) {
  return process.env[name];
}

const uploadRoot =
  readEnv("CODEXY_UPLOAD_ROOT") ?? path.join(process.cwd(), ".codexy", "uploads");
const codexAppServerUrlOverride = readEnv("CODEXY_CODEX_APP_SERVER_URL");

export const dockEnv = {
  codexBinary: readEnv("CODEXY_CODEX_BIN") ?? "codex",
  codexAppServerUrl: codexAppServerUrlOverride ?? "ws://127.0.0.1:39031",
  hasCodexAppServerUrlOverride: Boolean(codexAppServerUrlOverride),
  autoSpawnBridge: readEnv("CODEXY_AUTO_SPAWN") !== "false",
  defaultCwd: readEnv("CODEXY_DEFAULT_CWD") ?? process.cwd(),
  defaultApprovalPolicy: "on-request" as const,
  defaultSandboxMode: "workspace-write" as const,
  uploadRoot,
  tailscaleBinary: readEnv("CODEXY_TAILSCALE_BIN") ?? "tailscale"
};
