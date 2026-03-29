import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
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
  DockSandboxMode,
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

const SOCKET_CONNECT_TIMEOUT_MS = 5_000;
const INITIALIZE_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 10_000;
const APP_SERVER_READY_TIMEOUT_MS = 8_000;
const APP_SERVER_READY_POLL_MS = 200;
const APP_SERVER_HEALTH_TIMEOUT_MS = 1_500;
const PROCESS_TERMINATION_TIMEOUT_MS = 5_000;

const execFileAsync = promisify(execFile);

function normalizeWsUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  return `${url.protocol}//${url.host}`;
}

function toHttpUrl(wsUrl: string, pathname: string) {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1"
  );
}

function getPortFromWsUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  return Number(url.port || (url.protocol === "wss:" ? 443 : 80));
}

function getHostFromWsUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  return url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
}

async function canBindWsUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  if (!isLoopbackHostname(url.hostname)) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const server = createServer();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    server.once("error", () => finish(false));
    server.listen(getPortFromWsUrl(wsUrl), getHostFromWsUrl(wsUrl), () => {
      server.close((error) => finish(!error));
    });
  });
}

async function findAvailableLocalPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a local app-server port.")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForAppServerReady(wsUrl: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  const readyUrl = toHttpUrl(wsUrl, "/readyz");
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyUrl, {
        cache: "no-store"
      });
      if (response.ok) {
        return;
      }

      lastError = new Error(
        `Codex app-server readiness check failed with status ${response.status}.`
      );
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Codex app-server readiness check failed.");
    }

    await delay(APP_SERVER_READY_POLL_MS);
  }

  throw lastError ?? new Error("Codex app-server did not become ready.");
}

async function isAppServerReady(wsUrl: string, timeoutMs: number) {
  try {
    const response = await fetch(toHttpUrl(wsUrl, "/readyz"), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function listListeningPidsForUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  if (!isLoopbackHostname(url.hostname)) {
    return [];
  }

  const port = getPortFromWsUrl(wsUrl);

  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`
        ],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          windowsHide: true
        }
      );

      return stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
    } catch {
      return [];
    }
  }

  try {
    const { stdout } = await execFileAsync(
      "sh",
      ["-lc", `lsof -tiTCP:${port} -sTCP:LISTEN || true`],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      }
    );

    return stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

async function terminatePidTree(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    ).catch(() => {});
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {}

  await delay(250);

  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

async function waitForListenerRelease(
  wsUrl: string,
  timeoutMs: number,
  excludedPids: number[] = []
) {
  const deadline = Date.now() + timeoutMs;
  const excluded = new Set(excludedPids);

  while (Date.now() < deadline) {
    const pids = await listListeningPidsForUrl(wsUrl);
    if (!pids.some((pid) => !excluded.has(pid))) {
      return;
    }

    await delay(150);
  }

  throw new Error(`Timed out waiting for listener release on ${wsUrl}.`);
}

async function waitForPortAvailability(wsUrl: string, timeoutMs: number) {
  const url = new URL(wsUrl);
  if (!isLoopbackHostname(url.hostname)) {
    return;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await canBindWsUrl(wsUrl)) {
      return;
    }

    await delay(150);
  }

  throw new Error(`Timed out waiting for port availability on ${wsUrl}.`);
}

function appendProcessOutput(current: string, chunk: Buffer | string) {
  const next = `${current}${chunk.toString()}`;
  return next.slice(-4_000);
}

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

function createSandboxPolicy(mode: DockSandboxMode) {
  if (mode === "read-only") {
    return { type: "readOnly" as const };
  }

  if (mode === "danger-full-access") {
    return { type: "dangerFullAccess" as const };
  }

  return { type: "workspaceWrite" as const };
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

  private activeAppServerUrl = normalizeWsUrl(dockEnv.codexAppServerUrl);

  private ownedAppServerUrl: string | null = null;

  private async terminateOwnedBridgeProcess() {
    const child = this.child;
    if (!child) {
      return;
    }

    this.child = null;

    const childPid = child.pid ?? null;
    if (childPid) {
      await terminatePidTree(childPid);
    }

    await waitForListenerRelease(
      this.ownedAppServerUrl ?? this.activeAppServerUrl,
      PROCESS_TERMINATION_TIMEOUT_MS,
      childPid ? [childPid] : []
    ).catch(() => {});
    await waitForPortAvailability(
      this.ownedAppServerUrl ?? this.activeAppServerUrl,
      PROCESS_TERMINATION_TIMEOUT_MS
    ).catch(() => {});
  }

  private async terminateStaleLocalListener(wsUrl: string) {
    const pids = await listListeningPidsForUrl(wsUrl);
    if (!pids.length) {
      return false;
    }

    for (const pid of pids) {
      await terminatePidTree(pid);
    }

    await waitForListenerRelease(wsUrl, PROCESS_TERMINATION_TIMEOUT_MS);
    await waitForPortAvailability(wsUrl, PROCESS_TERMINATION_TIMEOUT_MS);
    return true;
  }

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
      pendingRequests: this.pendingServerRequests.size,
      bridgeUrl: this.activeAppServerUrl
    };
  }

  getEndpointUrl() {
    return this.activeAppServerUrl;
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
    sandbox?: DockSandboxMode;
    attachmentPaths?: string[];
  }) {
    const threadResponse = await this.request<ThreadStartResponse>("thread/start", {
      cwd: input.cwd ?? dockEnv.defaultCwd,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
      modelProvider: "openai",
      approvalPolicy: input.approvalPolicy ?? dockEnv.defaultApprovalPolicy,
      sandbox: input.sandbox ?? dockEnv.defaultSandboxMode,
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
    approvalPolicy?: DockApprovalPolicy | null;
    sandbox?: DockSandboxMode | null;
    attachmentPaths?: string[];
  }) {
    await this.ensureThreadLoaded(input.threadId, {
      cwd: input.cwd ?? null,
      model: input.model ?? null,
      reasoningEffort: input.reasoningEffort ?? null,
      approvalPolicy: input.approvalPolicy ?? null,
      sandbox: input.sandbox ?? null
    });

    return this.request<TurnStartResponse>("turn/start", {
      threadId: input.threadId,
      input: createPromptInput(input.prompt, input.attachmentPaths ?? []),
      approvalPolicy: input.approvalPolicy ?? null,
      sandboxPolicy: input.sandbox ? createSandboxPolicy(input.sandbox) : null,
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
    await this.ensureThreadLoaded(threadId);
    await this.request("thread/archive", {
      threadId
    });
  }

  async unarchiveThread(threadId: string) {
    await this.ensureThreadLoaded(threadId);
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
      approvalPolicy?: DockApprovalPolicy | null;
      sandbox?: DockSandboxMode | null;
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
        approvalPolicy: overrides?.approvalPolicy ?? null,
        sandbox: overrides?.sandbox ?? null,
        experimentalRawEvents: true,
        persistExtendedHistory: true
      });
    } catch (error) {
      await this.request("thread/resume", {
        threadId,
        cwd: overrides?.cwd ?? null,
        model: overrides?.model ?? null,
        reasoningEffort: overrides?.reasoningEffort ?? null,
        approvalPolicy: overrides?.approvalPolicy ?? null,
        sandbox: overrides?.sandbox ?? null,
        persistExtendedHistory: true
      });
    }

    this.loadedThreads.add(threadId);
  }

  private async connectInternal(): Promise<void> {
    const preferredUrl = this.ownedAppServerUrl ?? normalizeWsUrl(dockEnv.codexAppServerUrl);

    if (!dockEnv.hasCodexAppServerUrlOverride && dockEnv.autoSpawnBridge) {
      const configuredIsReady = await isAppServerReady(
        preferredUrl,
        APP_SERVER_HEALTH_TIMEOUT_MS
      );

      if (!configuredIsReady) {
        await this.terminateStaleLocalListener(preferredUrl);
        const url = await this.ensureOwnedBridgeProcess(preferredUrl);
        await this.connectAndInitialize(url);
        this.emitConnected();
        return;
      }
    }

    try {
      await this.connectAndInitialize(preferredUrl);
      this.emitConnected();
      return;
    } catch (error) {
      if (!dockEnv.autoSpawnBridge) {
        throw error;
      }
    }

    if (!dockEnv.hasCodexAppServerUrlOverride) {
      await this.terminateStaleLocalListener(preferredUrl);
      const url = await this.ensureOwnedBridgeProcess(preferredUrl);
      await this.connectAndInitialize(url);
      this.emitConnected();
      return;
    }

    const url = await this.spawnBridgeProcess();
    await this.connectAndInitialize(url);
    this.emitConnected();
  }

  private emitConnected() {
    this.emitEvent({
      type: "connection",
      status: "connected"
    });
  }

  private async connectAndInitialize(url: string) {
    await this.openSocket(url);

    await this.sendRpc(
      "initialize",
      {
        clientInfo: {
          name: "codexy",
          title: "Codexy",
          version: "0.1.0"
        },
        capabilities: {
          experimentalApi: true
        }
      },
      INITIALIZE_TIMEOUT_MS
    );
    this.sendNotification("initialized");
    this.activeAppServerUrl = url;
  }

  private async openSocket(url: string) {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.resetSocket(socket, "Timed out connecting to codex app-server.", false);
        reject(new Error("Timed out connecting to codex app-server."));
      }, SOCKET_CONNECT_TIMEOUT_MS);

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

  private resetSocket(socket: WebSocket | null, message: string, emitEvent: boolean) {
    if (!socket) {
      return;
    }

    if (this.socket === socket) {
      this.socket = null;
    }

    this.loadedThreads.clear();

    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();

    socket.removeAllListeners();

    try {
      socket.terminate();
    } catch {}

    if (emitEvent) {
      this.emitEvent({
        type: "connection",
        status: "disconnected",
        message
      });
    }
  }

  private async ensureOwnedBridgeProcess(preferredUrl?: string) {
    const targetUrl =
      preferredUrl ?? this.ownedAppServerUrl ?? dockEnv.codexAppServerUrl;

    if (
      this.child &&
      this.child.exitCode === null &&
      !this.child.killed &&
      this.ownedAppServerUrl === targetUrl
    ) {
      if (await isAppServerReady(targetUrl, APP_SERVER_HEALTH_TIMEOUT_MS)) {
        return targetUrl;
      }

      await this.terminateOwnedBridgeProcess();
    }

    return this.spawnBridgeProcess(targetUrl);
  }

  private async spawnBridgeProcess(preferredUrl?: string) {
    let resolvedUrl: string;

    if (preferredUrl) {
      const targetUrl = new URL(preferredUrl);

      if (!isLoopbackHostname(targetUrl.hostname)) {
        targetUrl.protocol = "ws:";
        targetUrl.hostname = "127.0.0.1";
        targetUrl.port = String(await findAvailableLocalPort());
      } else if (!targetUrl.port) {
        targetUrl.port = String(await findAvailableLocalPort());
      }

      resolvedUrl = normalizeWsUrl(targetUrl.toString());
      await this.terminateStaleLocalListener(resolvedUrl);
      await waitForPortAvailability(resolvedUrl, PROCESS_TERMINATION_TIMEOUT_MS);
    } else {
      resolvedUrl = `ws://127.0.0.1:${await findAvailableLocalPort()}`;
    }

    if (
      this.child &&
      this.child.exitCode === null &&
      !this.child.killed &&
      this.ownedAppServerUrl &&
      this.ownedAppServerUrl !== resolvedUrl
    ) {
      await this.terminateOwnedBridgeProcess();
    }

    this.ownedAppServerUrl = resolvedUrl;
    this.activeAppServerUrl = resolvedUrl;

    const child = spawn(
      dockEnv.codexBinary,
      ["app-server", "--listen", resolvedUrl],
      {
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    this.child = child;
    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout?.on("data", (chunk) => {
      stdoutBuffer = appendProcessOutput(stdoutBuffer, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderrBuffer = appendProcessOutput(stderrBuffer, chunk);
    });

    child.on("exit", (code) => {
      if (this.child === child) {
        this.child = null;
        this.emitEvent({
          type: "connection",
          status: "disconnected",
          message: `Codex app-server exited with code ${code ?? "unknown"}.`
        });
      }
    });

    try {
      await waitForAppServerReady(resolvedUrl, APP_SERVER_READY_TIMEOUT_MS);
    } catch (error) {
      if (this.child === child) {
        await this.terminateOwnedBridgeProcess();
      }

      const detail = stderrBuffer.trim() || stdoutBuffer.trim();
      const message =
        error instanceof Error
          ? error.message
          : "Codex app-server did not become ready.";

      throw new Error(detail ? `${message} ${detail}` : message);
    }

    return resolvedUrl;
  }

  private sendRpc<TResult = unknown>(
    method: RpcMethod | "initialize",
    params: unknown,
    timeoutMs = RPC_TIMEOUT_MS
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
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.resetSocket(
          socket,
          `Codex bridge request ${method} timed out after ${timeoutMs}ms.`,
          true
        );
        reject(
          new Error(`Codex bridge request ${method} timed out after ${timeoutMs}ms.`)
        );
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      socket.send(JSON.stringify(request), (error?: Error) => {
        if (!error) {
          return;
        }

        clearTimeout(timeout);
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

}

declare global {
  var __codexyBridge: CodexBridge | undefined;
}

export function getCodexBridge() {
  if (!globalThis.__codexyBridge) {
    globalThis.__codexyBridge = new CodexBridge();
  }

  return globalThis.__codexyBridge;
}
