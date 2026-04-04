import type { JsonRpcId } from "@/lib/codex/protocol";
import type { DockServerRequest } from "@/lib/codex/types";

export const CODEX_RPC_METHODS = [
  "thread/list",
  "thread/read",
  "thread/start",
  "thread/resume",
  "thread/name/set",
  "thread/archive",
  "thread/unarchive",
  "thread/fork",
  "thread/compact/start",
  "thread/rollback",
  "thread/shellCommand",
  "turn/start",
  "turn/steer",
  "turn/interrupt",
  "review/start",
  "model/list"
] as const;

export type CodexRpcMethod = (typeof CODEX_RPC_METHODS)[number];

type DockServerRequestMethod = DockServerRequest["method"];

type ServerRequestFactoryContext = {
  requestId: string;
  rpcId: JsonRpcId;
  threadId?: string;
  params: unknown;
};

type ServerRequestFactoryMap = {
  [Method in DockServerRequestMethod]: (
    context: ServerRequestFactoryContext
  ) => Extract<DockServerRequest, { method: Method }>;
};

const SERVER_REQUEST_FACTORIES = {
  "item/commandExecution/requestApproval": ({
    requestId,
    rpcId,
    threadId,
    params
  }) => ({
    requestId,
    rpcId,
    method: "item/commandExecution/requestApproval",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "item/commandExecution/requestApproval" }
    >["params"]
  }),
  "item/fileChange/requestApproval": ({
    requestId,
    rpcId,
    threadId,
    params
  }) => ({
    requestId,
    rpcId,
    method: "item/fileChange/requestApproval",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "item/fileChange/requestApproval" }
    >["params"]
  }),
  "item/tool/requestUserInput": ({ requestId, rpcId, threadId, params }) => ({
    requestId,
    rpcId,
    method: "item/tool/requestUserInput",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "item/tool/requestUserInput" }
    >["params"]
  }),
  "item/permissions/requestApproval": ({
    requestId,
    rpcId,
    threadId,
    params
  }) => ({
    requestId,
    rpcId,
    method: "item/permissions/requestApproval",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "item/permissions/requestApproval" }
    >["params"]
  }),
  "mcpServer/elicitation/request": ({ requestId, rpcId, threadId, params }) => ({
    requestId,
    rpcId,
    method: "mcpServer/elicitation/request",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "mcpServer/elicitation/request" }
    >["params"]
  }),
  execCommandApproval: ({ requestId, rpcId, threadId, params }) => ({
    requestId,
    rpcId,
    method: "execCommandApproval",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "execCommandApproval" }
    >["params"]
  }),
  applyPatchApproval: ({ requestId, rpcId, threadId, params }) => ({
    requestId,
    rpcId,
    method: "applyPatchApproval",
    threadId,
    params: params as Extract<
      DockServerRequest,
      { method: "applyPatchApproval" }
    >["params"]
  })
} satisfies ServerRequestFactoryMap;

export function extractThreadIdFromPayload(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if ("threadId" in value && typeof value.threadId === "string") {
    return value.threadId;
  }

  if ("conversationId" in value && typeof value.conversationId === "string") {
    return value.conversationId;
  }

  if (
    "thread" in value &&
    value.thread &&
    typeof value.thread === "object" &&
    "id" in value.thread &&
    typeof value.thread.id === "string"
  ) {
    return value.thread.id;
  }

  return undefined;
}

export function createCodexServerRequest(
  rpcId: JsonRpcId,
  method: string,
  params: unknown
): DockServerRequest | null {
  const requestId = String(rpcId);
  const threadId = extractThreadIdFromPayload(params);
  const factory = SERVER_REQUEST_FACTORIES[method as DockServerRequestMethod];

  if (!factory) {
    return null;
  }

  return factory({
    requestId,
    rpcId,
    threadId,
    params
  });
}
