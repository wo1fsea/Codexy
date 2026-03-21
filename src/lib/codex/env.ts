import path from "node:path";

export const dockEnv = {
  codexBinary: process.env.CODEX_DOCK_CODEX_BIN ?? "codex",
  codexAppServerUrl:
    process.env.CODEX_DOCK_CODEX_APP_SERVER_URL ?? "ws://127.0.0.1:39031",
  autoSpawnBridge: process.env.CODEX_DOCK_AUTO_SPAWN !== "false",
  defaultCwd: process.env.CODEX_DOCK_DEFAULT_CWD ?? process.cwd(),
  defaultApprovalPolicy: "on-request" as const,
  defaultSandboxMode: "workspace-write" as const,
  uploadRoot:
    process.env.CODEX_DOCK_UPLOAD_ROOT ??
    path.join(process.cwd(), ".codex-dock", "uploads"),
  tailscaleBinary: process.env.CODEX_DOCK_TAILSCALE_BIN ?? "tailscale"
};
