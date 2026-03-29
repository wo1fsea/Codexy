export type CodexyRuntimeMode = "node" | "cloud";

export function getRuntimeMode(): CodexyRuntimeMode {
  return process.env.CODEXY_RUNTIME_MODE === "cloud" ? "cloud" : "node";
}

export function isCloudMode() {
  return getRuntimeMode() === "cloud";
}

export function isNodeMode() {
  return getRuntimeMode() === "node";
}
