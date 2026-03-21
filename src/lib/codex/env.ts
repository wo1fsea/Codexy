import path from "node:path";

function readEnv(name: string, legacyName?: string) {
  return process.env[name] ?? (legacyName ? process.env[legacyName] : undefined);
}

const uploadRoot =
  readEnv("CODEXY_UPLOAD_ROOT", "CODEX_DOCK_UPLOAD_ROOT") ??
  path.join(process.cwd(), ".codexy", "uploads");
const legacyUploadRoot =
  process.env.CODEX_DOCK_UPLOAD_ROOT ?? path.join(process.cwd(), ".codex-dock", "uploads");

export const dockEnv = {
  codexBinary: readEnv("CODEXY_CODEX_BIN", "CODEX_DOCK_CODEX_BIN") ?? "codex",
  codexAppServerUrl:
    readEnv("CODEXY_CODEX_APP_SERVER_URL", "CODEX_DOCK_CODEX_APP_SERVER_URL") ??
    "ws://127.0.0.1:39031",
  autoSpawnBridge: readEnv("CODEXY_AUTO_SPAWN", "CODEX_DOCK_AUTO_SPAWN") !== "false",
  defaultCwd: readEnv("CODEXY_DEFAULT_CWD", "CODEX_DOCK_DEFAULT_CWD") ?? process.cwd(),
  defaultApprovalPolicy: "on-request" as const,
  defaultSandboxMode: "workspace-write" as const,
  uploadRoot,
  legacyUploadRoots:
    path.resolve(uploadRoot) === path.resolve(legacyUploadRoot) ? [] : [legacyUploadRoot],
  tailscaleBinary:
    readEnv("CODEXY_TAILSCALE_BIN", "CODEX_DOCK_TAILSCALE_BIN") ?? "tailscale"
};
