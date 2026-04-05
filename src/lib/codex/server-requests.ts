import type { DockServerRequest } from "@/lib/codex/types";
import type { TranslateFn } from "@/lib/i18n/messages";

export type PermissionApprovalRequestEntry = Extract<
  DockServerRequest,
  { method: "item/permissions/requestApproval" }
>;

export type CommandApprovalRequestEntry = Extract<
  DockServerRequest,
  { method: "item/commandExecution/requestApproval" | "execCommandApproval" }
>;

export type FileApprovalRequestEntry = Extract<
  DockServerRequest,
  { method: "item/fileChange/requestApproval" | "applyPatchApproval" }
>;

export type McpElicitationRequestEntry = Extract<
  DockServerRequest,
  { method: "mcpServer/elicitation/request" }
>;

export type UserInputRequestEntry = Extract<
  DockServerRequest,
  { method: "item/tool/requestUserInput" }
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

export type ServerRequestFamily =
  | "commandApproval"
  | "fileApproval"
  | "userInput"
  | "permissionsApproval"
  | "mcpElicitation"
  | "generic";

function humanizeRequestIdentifier(value: string) {
  const withSpaces = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withSpaces) {
    return value;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

export function getServerRequestFamily(
  method: DockServerRequest["method"]
): ServerRequestFamily {
  if (isCommandApprovalMethod(method)) {
    return "commandApproval";
  }

  if (isFileApprovalMethod(method)) {
    return "fileApproval";
  }

  if (method === "item/tool/requestUserInput") {
    return "userInput";
  }

  if (method === "item/permissions/requestApproval") {
    return "permissionsApproval";
  }

  if (method === "mcpServer/elicitation/request") {
    return "mcpElicitation";
  }

  return "generic";
}

export function getServerRequestTitle(
  method: DockServerRequest["method"],
  t: TranslateFn
) {
  if (isCommandApprovalMethod(method)) {
    return t("request.commandApproval");
  }

  if (isFileApprovalMethod(method)) {
    return t("request.fileApproval");
  }

  if (method === "item/tool/requestUserInput") {
    return t("request.userInput");
  }

  if (method === "item/permissions/requestApproval") {
    return t("request.permissionsApproval");
  }

  if (method === "mcpServer/elicitation/request") {
    return t("request.mcpElicitation");
  }

  return humanizeRequestIdentifier(method);
}

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

export function isCommandApprovalRequest(
  request: DockServerRequest
): request is CommandApprovalRequestEntry {
  return isCommandApprovalMethod(request.method);
}

export function isFileApprovalRequest(
  request: DockServerRequest
): request is FileApprovalRequestEntry {
  return isFileApprovalMethod(request.method);
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

export function getFileApprovalReason(
  request: FileApprovalRequestEntry
): string | null {
  if (request.method === "item/fileChange/requestApproval") {
    return typeof request.params.reason === "string" ? request.params.reason : null;
  }

  return typeof request.params.reason === "string" ? request.params.reason : null;
}

export function getFileApprovalTargets(request: FileApprovalRequestEntry) {
  if (request.method === "item/fileChange/requestApproval") {
    return [];
  }

  return Object.keys(request.params.fileChanges);
}

export function isPermissionApprovalRequest(
  request: DockServerRequest
): request is PermissionApprovalRequestEntry {
  return request.method === "item/permissions/requestApproval";
}

export function isUserInputRequest(
  request: DockServerRequest
): request is UserInputRequestEntry {
  return request.method === "item/tool/requestUserInput";
}

export function isMcpElicitationRequest(
  request: DockServerRequest
): request is McpElicitationRequestEntry {
  return request.method === "mcpServer/elicitation/request";
}
