import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket, type RawData } from "ws";

import { dockEnv } from "@/lib/codex/env";
import {
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcServerRequest,
  type JsonRpcId,
  type JsonRpcRequest
} from "@/lib/codex/protocol";
import type {
  DockApprovalPolicy,
  DockBridgeEvent,
  DockModel,
  DockServerRequest,
  DockThread,
  DockUserInput,
  ModelListResponse,
  ResolveRequestPayload,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartResponse,
  TurnStartResponse
} from "@/lib/codex/types";

type PendingRpc = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

type RpcMethod =
  | "thread/list"
  | "thread/read"
  | "thread/start"
  | "thread/resume"
  | "thread/name/set"
  | "thread/archive"
  | "thread/unarchive"
  | "turn/start"
  | "turn/interrupt"
  | "model/list";

function createPromptInput(
  prompt: string,
  attachmentPaths: string[]
): DockUserInput[] {
  const inputs: DockUserInput[] = [];

  if (prompt.trim()) {
    inputs.push({
      type: "text",
      text: prompt,
      text_elements: []
    });
  }

  for (const path of attachmentPaths) {
    inputs.push({
      type: "localImage",
      path
    });
  }

  return inputs;
}

function extractThreadIdFromPayload(value: unknown): string | undefined {
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

function createServerRequest(
  rpcId: JsonRpcId,
  method: string,
  params: unknown
): DockServerRequest | null {
  const threadId = extractThreadIdFromPayload(params);
  const requestId = String(rpcId);

  if (method === "item/commandExecution/requestApproval") {
    return {
      requestId,
      rpcId,
      method,
      threadId,
      params: params as any
    };
  }

  if (method === "item/fileChange/requestApproval") {
    return {
      requestId,
      rpcId,
      method,
      threadId,
      params: params as any
    };
  }

  if (method === "item/tool/requestUserInput") {
    return {
      requestId,
      rpcId,
      method,
      threadId,
      params: params as any
    };
  }

  if (method === "execCommandApproval") {
    return {
      requestId,
      rpcId,
      method,
      threadId,
      params: params as any
    };
  }

  if (method === "applyPatchApproval") {
    return {
      requestId,
      rpcId,
      method,
      threadId,
      params: params as any
    };
  }

  return null;
}

class CodexBridge extends EventEmitter {
  private socket: WebSocket | null = null;

  private child: ChildProcess | null = null;

  private connectPromise: Promise<void> | null = null;

  private requestCounter = 0;

  private pending = new Map<JsonRpcId, PendingRpc>();

  private pendingServerRequests = new Map<string, DockServerRequest>();

  private loadedThreads = new Set<string>();

  async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  getState() {
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      pendingRequests: this.pendingServerRequests.size
    };
  }

  getPendingServerRequests(threadId?: string): DockServerRequest[] {
    const values = [...this.pendingServerRequests.values()];
    if (!threadId) {
      return values;
    }
    return values.filter((request) => request.threadId === threadId);
  }

  subscribe(listener: (event: DockBridgeEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }

  async listThreads(input: {
    cursor?: string | null;
    limit?: number | null;
    searchTerm?: string | null;
    cwd?: string | null;
    archived?: boolean | null;
  }): Promise<ThreadListResponse> {
    return this.request<ThreadListResponse>("thread/list", {
      limit: input.limit ?? 200,
      cursor: input.cursor ?? null,
      searchTerm: input.searchTerm ?? null,
      cwd: input.cwd ?? null,
      archived: input.archived ?? false
    });
  }

  async readThread(threadId: string): Promise<DockThread> {
    const response = await this.request<ThreadReadResponse>("thread/read", {
      threadId,
      includeTurns: true
    });
    return response.thread;
  }

  async listModels(): Promise<DockModel[]> {
    const models: DockModel[] = [];
    let cursor: string | null = null;

    do {
      const response: ModelListResponse = await this.request<ModelListResponse>(
        "model/list",
        {
          cursor,
          limit: 100,
          includeHidden: false
        }
      );
      models.push(...response.data);
      cursor = response.nextCursor;
    } while (cursor);

    return models.filter((model) => !model.hidden);
  }

  async createThread(input: {
    prompt: string;
    cwd?: string | null;
    model?: string | null;
    reasoningEffort?: string | null;
    approvalPolicy?: DockApprovalPolicy;
    attachmentPaths?: string[];
  }) {
    const threadResponse = await this.request<ThreadStartResponse>("thread/start", {
      cwd: input.cwd ?? dockEnv.defaultCwd,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
      modelProvider: "openai",
      approvalPolicy: input.approvalPolicy ?? dockEnv.defaultApprovalPolicy,
      sandbox: dockEnv.defaultSandboxMode,
      experimentalRawEvents: true,
      persistExtendedHistory: true
    });

    this.loadedThreads.add(threadResponse.thread.id);

    const turnResponse = await this.request<TurnStartResponse>("turn/start", {
      threadId: threadResponse.thread.id,
      input: createPromptInput(input.prompt, input.attachmentPaths ?? [])
    });

    return {
      thread: threadResponse.thread,
      turn: turnResponse.turn
    };
  }

  async appendTurn(input: {
    threadId: string;
    prompt: string;
    model?: string | null;
    reasoningEffort?: string | null;
    cwd?: string | null;
    attachmentPaths?: string[];
  }) {
    await this.ensureThreadLoaded(input.threadId, {
      cwd: input.cwd ?? null,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null
    });

    return this.request<TurnStartResponse>("turn/start", {
      threadId: input.threadId,
      input: createPromptInput(input.prompt, input.attachmentPaths ?? []),
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
      cwd: input.cwd ?? null
    });
  }

  async renameThread(threadId: string, name: string) {
    await this.request("thread/name/set", {
      threadId,
      name
    });
  }

  async archiveThread(threadId: string) {
    await this.request("thread/archive", {
      threadId
    });
  }

  async unarchiveThread(threadId: string) {
    await this.request("thread/unarchive", {
      threadId
    });
  }

  async interruptTurn(threadId: string, turnId: string) {
    await this.request("turn/interrupt", {
      threadId,
      turnId
    });
  }

  async resolveServerRequest(
    requestId: string,
    payload: ResolveRequestPayload,
    fallback?: {
      rpcId?: string | number;
      threadId?: string;
      method?: DockServerRequest["method"];
    }
  ) {
    await this.ensureConnected();

    const socket = this.socket;
    const request = this.pendingServerRequests.get(requestId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Codex bridge is not connected.");
    }

    const rpcId = request?.rpcId ?? fallback?.rpcId;
    const threadId = request?.threadId ?? fallback?.threadId;

    if (rpcId === undefined || rpcId === null) {
      throw new Error(
        "This approval request is no longer valid. Refresh the current thread and try again."
      );
    }

    this.pendingServerRequests.delete(requestId);
    this.emitEvent({
      type: "server-request-resolved",
      requestId,
      threadId
    });

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId,
        result: payload
      })
    );
  }

  private async ensureThreadLoaded(
    threadId: string,
    overrides?: {
      cwd?: string | null;
      model?: string | null;
      reasoningEffort?: string | null;
    }
  ) {
    if (this.loadedThreads.has(threadId)) {
      return;
    }

    try {
      await this.request("thread/resume", {
        threadId,
        cwd: overrides?.cwd ?? null,
        model: overrides?.model ?? null,
        reasoningEffort: overrides?.reasoningEffort ?? null,
        experimentalRawEvents: true,
        persistExtendedHistory: true
      });
    } catch (error) {
      await this.request("thread/resume", {
        threadId,
        cwd: overrides?.cwd ?? null,
        model: overrides?.model ?? null,
        reasoningEffort: overrides?.reasoningEffort ?? null,
        persistExtendedHistory: true
      });
    }

    this.loadedThreads.add(threadId);
  }

  private async connectInternal(): Promise<void> {
    try {
      await this.openSocket();
    } catch (error) {
      if (!dockEnv.autoSpawnBridge) {
        throw error;
      }

      await this.spawnBridgeProcess();
      await this.openSocket();
    }

    await this.sendRpc("initialize", {
      clientInfo: {
        name: "codex-dock",
        title: "Codex Dock",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.sendNotification("initialized");

    this.emitEvent({
      type: "connection",
      status: "connected"
    });
  }

  private async openSocket() {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(dockEnv.codexAppServerUrl);

      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new Error("Timed out connecting to codex app-server."));
      }, 5000);

      socket.once("open", () => {
        clearTimeout(timeout);
        this.attachSocket(socket);
        resolve();
      });

      socket.once("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private attachSocket(socket: WebSocket) {
    this.socket = socket;

    socket.on("message", (data: RawData) => {
      const text = typeof data === "string" ? data : data.toString();
      if (!text.trim()) {
        return;
      }

      const parsed = JSON.parse(text) as unknown;
      this.handleIncomingMessage(parsed);
    });

    socket.on("close", () => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;
      this.loadedThreads.clear();

      for (const pending of this.pending.values()) {
        pending.reject(new Error("Codex bridge connection closed."));
      }
      this.pending.clear();

      this.emitEvent({
        type: "connection",
        status: "disconnected",
        message: "Codex bridge disconnected."
      });
    });
  }

  private handleIncomingMessage(message: unknown) {
    if (isJsonRpcResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (isJsonRpcServerRequest(message)) {
      const serverRequest = createServerRequest(
        message.id,
        message.method,
        message.params
      );

      if (!serverRequest) {
        return;
      }

      this.pendingServerRequests.set(serverRequest.requestId, serverRequest);
      this.emitEvent({
        type: "server-request",
        request: serverRequest
      });
      return;
    }

    if (isJsonRpcNotification(message)) {
      const threadId = extractThreadIdFromPayload(message.params);

      if (message.method === "serverRequest/resolved") {
        const params = message.params as {
          requestId: string | number;
          threadId: string;
        };
        const requestId = String(params.requestId);
        this.pendingServerRequests.delete(requestId);
        this.emitEvent({
          type: "server-request-resolved",
          requestId,
          threadId: params.threadId
        });
      }

      if (message.method === "thread/started") {
        const params = message.params as { thread?: { id?: string } };
        if (params.thread?.id) {
          this.loadedThreads.add(params.thread.id);
        }
      }

      if (message.method === "thread/closed" && threadId) {
        this.loadedThreads.delete(threadId);
      }

      this.emitEvent({
        type: "notification",
        method: message.method,
        threadId,
        params: message.params
      });
    }
  }

  private emitEvent(event: DockBridgeEvent) {
    this.emit("event", event);
  }

  private async spawnBridgeProcess() {
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      return;
    }

    this.child = spawn(
      dockEnv.codexBinary,
      ["app-server", "--listen", dockEnv.codexAppServerUrl],
      {
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    this.child.on("exit", (code) => {
      if (this.child?.exitCode === code) {
        this.emitEvent({
          type: "connection",
          status: "disconnected",
          message: `Codex app-server exited with code ${code ?? "unknown"}.`
        });
      }
    });

    await delay(1200);
  }

  private sendRpc<TResult = unknown>(
    method: RpcMethod | "initialize",
    params: unknown
  ): Promise<TResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Codex bridge is not connected.");
    }

    const id = `${Date.now()}-${this.requestCounter++}-${randomUUID()}`;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify(request), (error?: Error) => {
        if (!error) {
          return;
        }

        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private sendNotification(method: string, params?: unknown) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        ...(typeof params === "undefined" ? {} : { params })
      })
    );
  }

  private async request<TResult = unknown>(
    method: RpcMethod,
    params: unknown
  ): Promise<TResult> {
    await this.ensureConnected();
    return this.sendRpc(method, params);
  }
}

declare global {
  var __codexDockBridge: CodexBridge | undefined;
}

export function getCodexBridge() {
  if (!globalThis.__codexDockBridge) {
    globalThis.__codexDockBridge = new CodexBridge();
  }

  return globalThis.__codexDockBridge;
}
