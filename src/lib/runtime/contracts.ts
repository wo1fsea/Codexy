import type {
  ResolveRuntimeRequestPayload,
  RuntimeReviewDelivery,
  RuntimeReviewStartResponse,
  RuntimeReviewTarget,
  RuntimeApprovalPolicy,
  RuntimeBridgeEvent,
  RuntimeCapabilities,
  RuntimeId,
  RuntimeModel,
  RuntimeThreadCompactStartResponse,
  RuntimeSandboxMode,
  RuntimeServerRequest,
  RuntimeThreadShellCommandResponse,
  RuntimeThreadRollbackResponse,
  RuntimeState,
  RuntimeThread,
  RuntimeThreadListResponse,
  RuntimeThreadForkResponse,
  RuntimeTurnSteerResponse,
  RuntimeTurnStartResponse
} from "@/lib/runtime/types";

export type ResolveRuntimeRequestFallback = {
  rpcId?: string | number;
  threadId?: string;
  method?: RuntimeServerRequest["method"];
};

export type RuntimeAdapter = {
  id: RuntimeId;
  ensureConnected(): Promise<void>;
  getCapabilities(): RuntimeCapabilities;
  getState(): RuntimeState;
  getEndpointUrl(): string | null;
  getPendingServerRequests(threadId?: string): RuntimeServerRequest[];
  subscribe(listener: (event: RuntimeBridgeEvent) => void): () => void;
  listThreads(input: {
    cursor?: string | null;
    limit?: number | null;
    searchTerm?: string | null;
    cwd?: string | null;
    archived?: boolean | null;
  }): Promise<RuntimeThreadListResponse>;
  readThread(threadId: string): Promise<RuntimeThread>;
  listModels(): Promise<RuntimeModel[]>;
  createThread(input: {
    prompt: string;
    cwd?: string | null;
    model?: string | null;
    reasoningEffort?: string | null;
    approvalPolicy?: RuntimeApprovalPolicy;
    sandbox?: RuntimeSandboxMode;
    attachmentPaths?: string[];
  }): Promise<{
    thread: RuntimeThread;
    turn: RuntimeTurnStartResponse["turn"];
  }>;
  appendTurn(input: {
    threadId: string;
    prompt: string;
    model?: string | null;
    reasoningEffort?: string | null;
    cwd?: string | null;
    approvalPolicy?: RuntimeApprovalPolicy | null;
    sandbox?: RuntimeSandboxMode | null;
    attachmentPaths?: string[];
  }): Promise<RuntimeTurnStartResponse>;
  primeThread(threadId: string): Promise<void>;
  renameThread(threadId: string, name: string): Promise<void>;
  archiveThread(threadId: string): Promise<void>;
  unarchiveThread(threadId: string): Promise<void>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  steerTurn(input: {
    threadId: string;
    expectedTurnId: string;
    prompt: string;
    attachmentPaths?: string[];
  }): Promise<RuntimeTurnSteerResponse>;
  forkThread(input: {
    threadId: string;
    cwd?: string | null;
    model?: string | null;
    approvalPolicy?: RuntimeApprovalPolicy | null;
    sandbox?: RuntimeSandboxMode | null;
  }): Promise<RuntimeThreadForkResponse>;
  rollbackThread(
    threadId: string,
    numTurns: number
  ): Promise<RuntimeThreadRollbackResponse>;
  compactThread(threadId: string): Promise<RuntimeThreadCompactStartResponse>;
  runThreadShellCommand(input: {
    threadId: string;
    command: string;
  }): Promise<RuntimeThreadShellCommandResponse>;
  startReview(input: {
    threadId: string;
    target: RuntimeReviewTarget;
    delivery?: RuntimeReviewDelivery | null;
  }): Promise<RuntimeReviewStartResponse>;
  resolveServerRequest(
    requestId: string,
    payload: ResolveRuntimeRequestPayload,
    fallback?: ResolveRuntimeRequestFallback
  ): Promise<void>;
};
