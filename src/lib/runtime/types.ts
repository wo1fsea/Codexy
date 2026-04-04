import type {
  DockApprovalPolicy,
  DockBridgeEvent,
  DockModel,
  DockReviewDelivery,
  DockReviewTarget,
  ReviewStartResponse,
  DockSandboxMode,
  DockServerRequest,
  DockThread,
  ThreadCompactStartResponse,
  ResolveRequestPayload,
  ResolveRequestSubmission,
  ThreadShellCommandResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ThreadRollbackResponse,
  TurnSteerResponse,
  TurnStartResponse
} from "@/lib/codex/types";

export type RuntimeId = "codex";

export type RuntimeCapabilities = {
  steer: boolean;
  fork: boolean;
  review: boolean;
  rollback: boolean;
  compact: boolean;
  shellCommand: boolean;
};

export type RuntimeThread = DockThread;
export type RuntimeModel = DockModel;
export type RuntimeBridgeEvent = DockBridgeEvent;
export type RuntimeServerRequest = DockServerRequest;
export type RuntimeThreadListResponse = ThreadListResponse;
export type RuntimeTurnStartResponse = TurnStartResponse;
export type RuntimeTurnSteerResponse = TurnSteerResponse;
export type RuntimeThreadForkResponse = ThreadForkResponse;
export type RuntimeThreadRollbackResponse = ThreadRollbackResponse;
export type RuntimeReviewTarget = DockReviewTarget;
export type RuntimeReviewDelivery = DockReviewDelivery;
export type RuntimeReviewStartResponse = ReviewStartResponse;
export type RuntimeThreadCompactStartResponse = ThreadCompactStartResponse;
export type RuntimeThreadShellCommandResponse = ThreadShellCommandResponse;
export type ResolveRuntimeRequestPayload = ResolveRequestPayload;
export type ResolveRuntimeRequestSubmission = ResolveRequestSubmission;
export type RuntimeApprovalPolicy = DockApprovalPolicy;
export type RuntimeSandboxMode = DockSandboxMode;

export type RuntimeState = {
  connected: boolean;
  pendingRequests: number;
  bridgeUrl: string | null;
};
