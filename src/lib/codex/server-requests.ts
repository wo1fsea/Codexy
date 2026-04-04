import type { DockServerRequest } from "@/lib/codex/types";

export type PermissionApprovalRequestEntry = Extract<
  DockServerRequest,
  { method: "item/permissions/requestApproval" }
>;

export type McpElicitationRequestEntry = Extract<
  DockServerRequest,
  { method: "mcpServer/elicitation/request" }
>;

type CommandApprovalMethod =
  | "item/commandExecution/requestApproval"
  | "execCommandApproval";

type FileApprovalMethod =
  | "item/fileChange/requestApproval"
  | "applyPatchApproval";

const LEGACY_APPROVAL_METHODS = new Set<DockServerRequest["method"]>([
  "execCommandApproval",
  "applyPatchApproval"
]);

const COMMAND_APPROVAL_METHODS = new Set<DockServerRequest["method"]>([
  "item/commandExecution/requestApproval",
  "execCommandApproval"
]);

const FILE_APPROVAL_METHODS = new Set<DockServerRequest["method"]>([
  "item/fileChange/requestApproval",
  "applyPatchApproval"
]);

export function isCommandApprovalMethod(
  method: DockServerRequest["method"]
): method is CommandApprovalMethod {
  return COMMAND_APPROVAL_METHODS.has(method);
}

export function isFileApprovalMethod(
  method: DockServerRequest["method"]
): method is FileApprovalMethod {
  return FILE_APPROVAL_METHODS.has(method);
}

export function getApprovePayload(method: DockServerRequest["method"]) {
  if (LEGACY_APPROVAL_METHODS.has(method)) {
    return { decision: "approved_for_session" };
  }

  return { decision: "acceptForSession" };
}

export function getSingleApprovePayload(method: DockServerRequest["method"]) {
  if (LEGACY_APPROVAL_METHODS.has(method)) {
    return { decision: "approved" };
  }

  return { decision: "accept" };
}

export function getDeclinePayload(method: DockServerRequest["method"]) {
  if (LEGACY_APPROVAL_METHODS.has(method)) {
    return { decision: "denied" };
  }

  return { decision: "decline" };
}

export function getCommandApprovalText(request: DockServerRequest) {
  if (request.method === "item/commandExecution/requestApproval") {
    return request.params.command || request.params.reason || null;
  }

  if (request.method === "execCommandApproval") {
    return request.params.command.join(" ");
  }

  return null;
}

export function getCommandApprovalCwd(
  request: DockServerRequest,
  fallbackCwd: string
) {
  if (request.method === "item/commandExecution/requestApproval") {
    return request.params.cwd || fallbackCwd;
  }

  if (request.method === "execCommandApproval") {
    return request.params.cwd || fallbackCwd;
  }

  return fallbackCwd;
}

export function isPermissionApprovalRequest(
  request: DockServerRequest
): request is PermissionApprovalRequestEntry {
  return request.method === "item/permissions/requestApproval";
}

export function isMcpElicitationRequest(
  request: DockServerRequest
): request is McpElicitationRequestEntry {
  return request.method === "mcpServer/elicitation/request";
}
