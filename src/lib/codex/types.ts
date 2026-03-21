export type DockApprovalPolicy =
  | "untrusted"
  | "on-failure"
  | "on-request"
  | "never";

export type DockSandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

export type DockPlanStepStatus = "pending" | "inProgress" | "completed";

export type DockPlanStep = {
  step: string;
  status: DockPlanStepStatus;
};

export type DockUserInput =
  | {
      type: "text";
      text: string;
      text_elements: Array<{
        byteRange: { start: number; end: number };
        placeholder: string | null;
      }>;
    }
  | {
      type: "image";
      url: string;
    }
  | {
      type: "localImage";
      path: string;
    }
  | {
      type: "skill";
      name: string;
      path: string;
    }
  | {
      type: "mention";
      name: string;
      path: string;
    };

export type DockThreadItem =
  | {
      type: "userMessage";
      id: string;
      content: DockUserInput[];
      [key: string]: unknown;
    }
  | {
      type: "agentMessage";
      id: string;
      text: string;
      phase: "commentary" | "final_answer" | null;
      [key: string]: unknown;
    }
  | {
      type: "plan";
      id: string;
      text: string;
      explanation?: string | null;
      steps?: DockPlanStep[] | null;
      [key: string]: unknown;
    }
  | {
      type: "reasoning";
      id: string;
      summary: string[];
      content: string[];
      [key: string]: unknown;
    }
  | {
      type: "commandExecution";
      id: string;
      command: string;
      cwd: string;
      processId: string | null;
      status: string;
      commandActions: Array<Record<string, unknown>>;
      aggregatedOutput: string | null;
      exitCode: number | null;
      durationMs: number | null;
      [key: string]: unknown;
    }
  | {
      type: "fileChange";
      id: string;
      changes: Array<Record<string, unknown>>;
      status: string;
      [key: string]: unknown;
    }
  | {
      type: "mcpToolCall" | "dynamicToolCall" | "collabAgentToolCall";
      id: string;
      [key: string]: unknown;
    }
  | {
      type:
        | "webSearch"
        | "imageView"
        | "imageGeneration"
        | "enteredReviewMode"
        | "exitedReviewMode"
        | "contextCompaction";
      id: string;
      [key: string]: unknown;
    }
  | {
      type: string;
      id: string;
      [key: string]: unknown;
    };

export type DockTurn = {
  id: string;
  items: DockThreadItem[];
  status: "completed" | "interrupted" | "failed" | "inProgress";
  error: { message?: string } | null;
};

export type DockThread = {
  id: string;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  createdAt: number;
  updatedAt: number;
  status:
    | { type: "notLoaded" }
    | { type: "idle" }
    | { type: "systemError" }
    | { type: "active"; activeFlags: string[] };
  path: string | null;
  cwd: string;
  cliVersion: string;
  source: string;
  agentNickname: string | null;
  agentRole: string | null;
  gitInfo: {
    branch?: string | null;
    sha?: string | null;
    originUrl?: string | null;
  } | null;
  name: string | null;
  turns: DockTurn[];
};

export type DockModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: Array<{
    reasoningEffort: string;
    description: string;
  }>;
  defaultReasoningEffort: string;
  inputModalities: string[];
  supportsPersonality: boolean;
  isDefault: boolean;
};

export type CommandApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | Record<string, unknown>;

export type CommandApprovalRequest = {
  threadId: string;
  turnId: string;
  itemId: string;
  approvalId?: string | null;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  commandActions?: Array<Record<string, unknown>> | null;
  availableDecisions?: CommandApprovalDecision[] | null;
  [key: string]: unknown;
};

export type ExecCommandApprovalRequest = {
  conversationId: string;
  callId: string;
  approvalId?: string | null;
  command: string[];
  cwd: string;
  reason?: string | null;
  parsedCmd?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type FileApprovalRequest = {
  threadId: string;
  turnId: string;
  itemId: string;
  availableDecisions?: Array<
    "accept" | "acceptForSession" | "decline" | "cancel"
  > | null;
  [key: string]: unknown;
};

export type ApplyPatchApprovalRequest = {
  conversationId: string;
  callId: string;
  fileChanges: Record<string, Record<string, unknown>>;
  grantRoot?: string | null;
  reason?: string | null;
  [key: string]: unknown;
};

export type ToolRequestQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<{
    label: string;
    description: string;
  }> | null;
};

export type ToolRequest = {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: ToolRequestQuestion[];
};

export type DockServerRequest =
  | {
      requestId: string;
      rpcId: string | number;
      method: "item/commandExecution/requestApproval";
      threadId?: string;
      params: CommandApprovalRequest;
    }
  | {
      requestId: string;
      rpcId: string | number;
      method: "item/fileChange/requestApproval";
      threadId?: string;
      params: FileApprovalRequest;
    }
  | {
      requestId: string;
      rpcId: string | number;
      method: "item/tool/requestUserInput";
      threadId?: string;
      params: ToolRequest;
    }
  | {
      requestId: string;
      rpcId: string | number;
      method: "execCommandApproval";
      threadId?: string;
      params: ExecCommandApprovalRequest;
    }
  | {
      requestId: string;
      rpcId: string | number;
      method: "applyPatchApproval";
      threadId?: string;
      params: ApplyPatchApprovalRequest;
    };

export type DockBridgeEvent =
  | {
      type: "connection";
      status: "connected" | "disconnected";
      message?: string;
    }
  | {
      type: "notification";
      method: string;
      threadId?: string;
      params: unknown;
    }
  | {
      type: "server-request";
      request: DockServerRequest;
    }
  | {
      type: "server-request-resolved";
      requestId: string;
      threadId?: string;
    };

export type ThreadListResponse = {
  data: DockThread[];
  nextCursor: string | null;
};

export type ThreadReadResponse = {
  thread: DockThread;
};

export type ThreadStartResponse = {
  thread: DockThread;
  model: string;
  modelProvider: string;
  cwd: string;
  approvalPolicy: DockApprovalPolicy;
};

export type TurnStartResponse = {
  turn: DockTurn;
};

export type ModelListResponse = {
  data: DockModel[];
  nextCursor: string | null;
};

export type ResolveRequestPayload =
  | {
      decision:
        | CommandApprovalDecision
        | "accept"
        | "acceptForSession"
        | "decline"
        | "cancel";
    }
  | {
      answers: Record<string, { answers: string[] }>;
    };

export type ResolveRequestSubmission = {
  payload: ResolveRequestPayload;
  rpcId?: string | number;
  threadId?: string;
  method?: DockServerRequest["method"];
};
