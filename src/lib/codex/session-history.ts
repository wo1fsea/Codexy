import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DockThread, DockThreadItem, DockTurn, DockUserInput } from "@/lib/codex/types";

const SESSION_FILE_CACHE = new Map<string, string | null>();
const SESSION_SUMMARY_CACHE_TTL_MS = 5_000;
const SESSION_ID_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

let sessionSummaryCache:
  | {
      expiresAt: number;
      threads: DockThread[];
    }
  | null = null;

type SessionJsonlRecord = {
  timestamp?: unknown;
  type?: unknown;
  payload?: unknown;
};

type SessionTurnItems = Map<string, DockThreadItem[]>;
type SessionThreadMetadata = {
  threadId: string;
  cwd: string;
  cliVersion: string;
  modelProvider: string;
  createdAt: number;
  preview: string;
  gitInfo: DockThread["gitInfo"];
  agentNickname: string | null;
  agentRole: string | null;
};
type SessionPlanEntry = {
  step: string;
  status: unknown;
};

function getCodexSessionsRoot() {
  const codexHome =
    process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  return path.join(codexHome, "sessions");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTimestampMs(value: unknown, fallback: number) {
  const stringValue = getString(value);
  if (!stringValue) {
    return fallback;
  }

  const parsed = Date.parse(stringValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOptionalTimestampMs(value: unknown) {
  const parsed = getTimestampMs(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecordTimestampMs(
  record: SessionJsonlRecord,
  payload: Record<string, unknown>
) {
  return getOptionalTimestampMs(record.timestamp) ?? getOptionalTimestampMs(payload.timestamp);
}

function getSessionIdFromFilePath(filePath: string) {
  const match = path.basename(filePath).match(SESSION_ID_PATTERN);
  return match?.[1] ?? null;
}

function normalizePreviewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function createThreadFromSessionMetadata(
  metadata: SessionThreadMetadata,
  filePath: string,
  updatedAt: number,
  turns: DockTurn[]
): DockThread {
  return {
    id: metadata.threadId,
    preview: metadata.preview || path.basename(filePath, ".jsonl"),
    ephemeral: false,
    modelProvider: metadata.modelProvider,
    createdAt: metadata.createdAt,
    updatedAt,
    status: { type: "idle" as const },
    path: filePath,
    cwd: metadata.cwd,
    cliVersion: metadata.cliVersion,
    source: "session",
    agentNickname: metadata.agentNickname,
    agentRole: metadata.agentRole,
    gitInfo: metadata.gitInfo,
    name: null,
    turns
  };
}

function cloneThreadSummary(thread: DockThread): DockThread {
  return {
    ...thread,
    status:
      thread.status.type === "active"
        ? {
            type: "active",
            activeFlags: [...thread.status.activeFlags]
          }
        : { type: thread.status.type },
    gitInfo: thread.gitInfo ? { ...thread.gitInfo } : null,
    turns: []
  };
}

function createTextInput(text: string): DockUserInput {
  return {
    type: "text",
    text,
    text_elements: []
  };
}

function createSessionUserMessage(
  payload: Record<string, unknown>,
  turnId: string,
  index: number
): Extract<DockThreadItem, { type: "userMessage" }> | null {
  const content: DockUserInput[] = [];

  if (typeof payload.message === "string" && payload.message.trim()) {
    content.push(createTextInput(payload.message));
  }

  if (Array.isArray(payload.local_images)) {
    for (const entry of payload.local_images) {
      if (typeof entry === "string" && entry.trim()) {
        content.push({
          type: "localImage",
          path: entry
        });
      }
    }
  }

  if (Array.isArray(payload.images)) {
    for (const entry of payload.images) {
      if (typeof entry === "string" && entry.trim()) {
        content.push({
          type: "image",
          url: entry
        });
      }
    }
  }

  if (!content.length) {
    return null;
  }

  return {
    type: "userMessage",
    id: `session-user:${turnId}:${index}`,
    content
  };
}

function createSessionAgentMessage(
  payload: Record<string, unknown>,
  turnId: string,
  index: number
): Extract<DockThreadItem, { type: "agentMessage" }> | null {
  if (typeof payload.message !== "string" || !payload.message.trim()) {
    return null;
  }

  return {
    type: "agentMessage",
    id: `session-agent:${turnId}:${index}`,
    text: payload.message,
    phase:
      payload.phase === "commentary" || payload.phase === "final_answer"
        ? payload.phase
        : null
  };
}

function normalizePlanStepStatus(value: unknown) {
  if (value === "completed") {
    return "completed" as const;
  }

  if (value === "inProgress" || value === "in_progress") {
    return "inProgress" as const;
  }

  return "pending" as const;
}

function createSessionPlanItem(
  payload: Record<string, unknown>,
  turnId: string
): Extract<DockThreadItem, { type: "plan" }> | null {
  if (payload.type !== "function_call" || payload.name !== "update_plan") {
    return null;
  }

  if (typeof payload.arguments !== "string" || !payload.arguments.trim()) {
    return null;
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(payload.arguments);
  } catch {
    return null;
  }

  if (!isRecord(parsedArguments) || !Array.isArray(parsedArguments.plan)) {
    return null;
  }

  const steps = parsedArguments.plan
    .filter((entry): entry is SessionPlanEntry => {
      if (!isRecord(entry)) {
        return false;
      }

      const step = entry.step;
      return typeof step === "string" && step.trim().length > 0;
    })
    .map((entry) => ({
      step: entry.step.trim(),
      status: normalizePlanStepStatus(entry.status)
    }));

  if (!steps.length) {
    return null;
  }

  return {
    type: "plan",
    id:
      typeof payload.call_id === "string" && payload.call_id
        ? `session-plan:${payload.call_id}`
        : `session-plan:${turnId}`,
    text: steps.map((step, index) => `${index + 1}. ${step.step}`).join("\n"),
    explanation:
      typeof parsedArguments.explanation === "string"
        ? parsedArguments.explanation
        : null,
    steps
  };
}

function getDurationMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  const secs = typeof value.secs === "number" ? value.secs : 0;
  const nanos = typeof value.nanos === "number" ? value.nanos : 0;
  const milliseconds = secs * 1000 + Math.round(nanos / 1_000_000);

  return milliseconds > 0 ? milliseconds : null;
}

function getCommandText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .join(" ");
}

function createSessionCommandItem(
  payload: Record<string, unknown>,
  turnId: string
): Extract<DockThreadItem, { type: "commandExecution" }> | null {
  const callId =
    typeof payload.call_id === "string" && payload.call_id
      ? payload.call_id
      : `session-command:${turnId}:${Math.random().toString(36).slice(2, 8)}`;

  const command = getCommandText(payload.command);
  if (!command) {
    return null;
  }

  return {
    type: "commandExecution",
    id: `session-command:${callId}`,
    command,
    cwd: typeof payload.cwd === "string" ? payload.cwd : "",
    processId:
      typeof payload.process_id === "string"
        ? payload.process_id
        : typeof payload.processId === "string"
          ? payload.processId
          : null,
    status: typeof payload.status === "string" ? payload.status : "completed",
    commandActions: Array.isArray(payload.parsed_cmd) ? payload.parsed_cmd : [],
    aggregatedOutput:
      typeof payload.aggregated_output === "string"
        ? payload.aggregated_output
        : typeof payload.formatted_output === "string"
          ? payload.formatted_output
          : null,
    exitCode:
      typeof payload.exit_code === "number"
        ? payload.exit_code
        : typeof payload.exitCode === "number"
          ? payload.exitCode
          : null,
    durationMs: getDurationMs(payload.duration)
  };
}

function countUnifiedDiffLines(unifiedDiff: unknown) {
  if (typeof unifiedDiff !== "string" || !unifiedDiff.trim()) {
    return {
      additions: null,
      deletions: null
    };
  }

  let additions = 0;
  let deletions = 0;

  for (const line of unifiedDiff.split(/\r?\n/)) {
    if (
      !line ||
      line.startsWith("@@") ||
      line.startsWith("+++") ||
      line.startsWith("---")
    ) {
      continue;
    }

    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }

    if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return {
    additions,
    deletions
  };
}

function createSessionFileChangeItem(
  payload: Record<string, unknown>,
  turnId: string
): Extract<DockThreadItem, { type: "fileChange" }> | null {
  const callId =
    typeof payload.call_id === "string" && payload.call_id
      ? payload.call_id
      : `session-file-change:${turnId}:${Math.random().toString(36).slice(2, 8)}`;

  const rawChanges = isRecord(payload.changes) ? payload.changes : null;
  const changes = rawChanges
    ? Object.entries(rawChanges).map(([filePath, rawChange]) => {
        const change = isRecord(rawChange) ? rawChange : {};
        const rawDiff =
          typeof change.unified_diff === "string"
            ? change.unified_diff
            : typeof change.unifiedDiff === "string"
              ? change.unifiedDiff
              : typeof change.diff === "string"
                ? change.diff
                : null;
        const counts = countUnifiedDiffLines(rawDiff);

        return {
          path: filePath,
          type: typeof change.type === "string" ? change.type : "update",
          additions: counts.additions,
          deletions: counts.deletions,
          ...(rawDiff ? { diff: rawDiff } : {}),
          ...(typeof change.move_path === "string" && change.move_path
            ? { newPath: change.move_path }
            : {})
        };
      })
    : [];

  if (!changes.length) {
    return null;
  }

  return {
    type: "fileChange",
    id: `session-file-change:${callId}`,
    changes,
    status: typeof payload.status === "string" ? payload.status : "completed"
  };
}

function pushTurnItem(
  map: SessionTurnItems,
  turnId: string,
  item: DockThreadItem | null
) {
  if (!item) {
    return;
  }

  const items = map.get(turnId) ?? [];
  items.push(item);
  map.set(turnId, items);
}

function parseSessionTurnItems(content: string) {
  const turnItems: SessionTurnItems = new Map();
  const messageIndexes = new Map<string, { user: number; agent: number }>();
  let currentTurnIdHint: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let record: SessionJsonlRecord;
    try {
      record = JSON.parse(line) as SessionJsonlRecord;
    } catch {
      continue;
    }

    if (!isRecord(record.payload)) {
      continue;
    }

    const payload = record.payload;
    const payloadTurnId =
      typeof payload.turn_id === "string" ? payload.turn_id : null;

    if (payloadTurnId) {
      currentTurnIdHint = payloadTurnId;
    }

    if (record.type === "response_item") {
      const turnId = payloadTurnId ?? currentTurnIdHint;

      if (!turnId) {
        continue;
      }

      pushTurnItem(turnItems, turnId, createSessionPlanItem(payload, turnId));
      continue;
    }

    if (record.type !== "event_msg") {
      continue;
    }

    const eventType = typeof payload.type === "string" ? payload.type : null;
    const turnId = payloadTurnId ?? currentTurnIdHint;

    if (!eventType || !turnId) {
      continue;
    }

    const indexes = messageIndexes.get(turnId) ?? { user: 0, agent: 0 };

    if (eventType === "user_message") {
      pushTurnItem(
        turnItems,
        turnId,
        createSessionUserMessage(payload, turnId, indexes.user)
      );
      indexes.user += 1;
      messageIndexes.set(turnId, indexes);
      continue;
    }

    if (eventType === "agent_message") {
      pushTurnItem(
        turnItems,
        turnId,
        createSessionAgentMessage(payload, turnId, indexes.agent)
      );
      indexes.agent += 1;
      messageIndexes.set(turnId, indexes);
      continue;
    }

    if (eventType === "exec_command_end") {
      pushTurnItem(turnItems, turnId, createSessionCommandItem(payload, turnId));
      continue;
    }

    if (eventType === "patch_apply_end") {
      pushTurnItem(turnItems, turnId, createSessionFileChangeItem(payload, turnId));
    }
  }

  return turnItems;
}

function buildTurnsFromSessionContent(content: string) {
  const turnItems = parseSessionTurnItems(content);
  const turns = new Map<
    string,
    {
      order: number;
      status: DockTurn["status"];
      error: DockTurn["error"];
      startedAt: number | null;
      completedAt: number | null;
      firstEventAt: number | null;
      lastEventAt: number | null;
    }
  >();
  let currentTurnIdHint: string | null = null;
  let nextOrder = 0;

  const ensureTurn = (turnId: string) => {
    const existing = turns.get(turnId);
    if (existing) {
      return existing;
    }

    const created = {
      order: nextOrder++,
      status: "completed" as const,
      error: null,
      startedAt: null,
      completedAt: null,
      firstEventAt: null,
      lastEventAt: null
    };
    turns.set(turnId, created);
    return created;
  };

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let record: SessionJsonlRecord;
    try {
      record = JSON.parse(line) as SessionJsonlRecord;
    } catch {
      continue;
    }

    if (!isRecord(record.payload)) {
      continue;
    }

    const payload = record.payload;
    const payloadTurnId =
      typeof payload.turn_id === "string" ? payload.turn_id : null;
    const recordTimestampMs = getRecordTimestampMs(record, payload);

    if (payloadTurnId) {
      currentTurnIdHint = payloadTurnId;
    }

    if (record.type === "turn_context" && payloadTurnId) {
      const turn = ensureTurn(payloadTurnId);
      if (recordTimestampMs !== null) {
        turn.firstEventAt = turn.firstEventAt ?? recordTimestampMs;
        turn.lastEventAt = recordTimestampMs;
      }
      continue;
    }

    if (record.type !== "event_msg") {
      continue;
    }

    const eventType = getString(payload.type);
    const turnId = payloadTurnId ?? currentTurnIdHint;
    if (!eventType || !turnId) {
      continue;
    }

    const turn = ensureTurn(turnId);
    if (recordTimestampMs !== null) {
      turn.firstEventAt = turn.firstEventAt ?? recordTimestampMs;
      turn.lastEventAt = recordTimestampMs;
    }

    if (eventType === "task_started") {
      turn.status = "inProgress";
      turn.startedAt = turn.startedAt ?? recordTimestampMs ?? turn.firstEventAt;
      continue;
    }

    if (eventType === "task_complete" || eventType === "task_completed") {
      turn.status = "completed";
      turn.error = null;
      turn.completedAt = recordTimestampMs ?? turn.lastEventAt;
      continue;
    }

    if (eventType === "task_interrupted") {
      turn.status = "interrupted";
      turn.completedAt = recordTimestampMs ?? turn.lastEventAt;
      continue;
    }

    if (eventType === "task_failed") {
      turn.status = "failed";
      turn.completedAt = recordTimestampMs ?? turn.lastEventAt;
      turn.error =
        typeof payload.message === "string" && payload.message.trim()
          ? { message: payload.message }
          : null;
    }
  }

  for (const turnId of turnItems.keys()) {
    ensureTurn(turnId);
  }

  return [...turns.entries()]
    .sort((left, right) => left[1].order - right[1].order)
    .map(([turnId, turn]) => ({
      id: turnId,
      items: turnItems.get(turnId) ?? [],
      status: turn.status,
      error: turn.error,
      startedAt: turn.startedAt ?? turn.firstEventAt,
      completedAt:
        turn.status === "inProgress"
          ? null
          : turn.completedAt ?? turn.lastEventAt,
      durationMs:
        turn.status === "inProgress"
          ? null
          : (() => {
              const startedAt = turn.startedAt ?? turn.firstEventAt;
              const completedAt = turn.completedAt ?? turn.lastEventAt;
              if (
                startedAt === null ||
                completedAt === null ||
                completedAt < startedAt
              ) {
                return null;
              }

              return completedAt - startedAt;
            })()
    }));
}

function extractThreadMetadataFromSessionContent(
  content: string,
  filePath: string,
  updatedAt: number
): SessionThreadMetadata | null {
  let threadId = getSessionIdFromFilePath(filePath);
  let cwd = "";
  let cliVersion = "";
  let modelProvider = "openai";
  let createdAt = updatedAt;
  let preview = "";
  let gitInfo: DockThread["gitInfo"] = null;
  let agentNickname: string | null = null;
  let agentRole: string | null = null;
  let sawRootSessionMeta = false;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let record: SessionJsonlRecord;
    try {
      record = JSON.parse(line) as SessionJsonlRecord;
    } catch {
      continue;
    }

    if (!isRecord(record.payload)) {
      continue;
    }

    const payload = record.payload;

    if (record.type === "session_meta" && !sawRootSessionMeta) {
      sawRootSessionMeta = true;
      threadId = getString(payload.id) ?? threadId;
      cwd = getString(payload.cwd) ?? cwd;
      cliVersion = getString(payload.cli_version) ?? cliVersion;
      modelProvider = getString(payload.model_provider) ?? modelProvider;
      createdAt = getTimestampMs(payload.timestamp, createdAt);
      agentNickname = getString(payload.agent_nickname);
      agentRole = getString(payload.agent_role);

      if (isRecord(payload.git)) {
        gitInfo = {
          branch: getString(payload.git.branch),
          sha: getString(payload.git.commit_hash),
          originUrl: getString(payload.git.repository_url)
        };
      }

      continue;
    }

    if (preview || record.type !== "event_msg") {
      continue;
    }

    const payloadType = getString(payload.type);

    if (payloadType === "user_message") {
      preview = normalizePreviewText(getString(payload.message) ?? "");

      if (!preview) {
        const localImages = Array.isArray(payload.local_images)
          ? payload.local_images
          : [];
        const images = Array.isArray(payload.images) ? payload.images : [];

        if (localImages.length || images.length) {
          preview = "Image attachment";
        }
      }
    }
  }

  if (!threadId || !cwd) {
    return null;
  }

  return {
    threadId,
    cwd,
    cliVersion,
    modelProvider,
    createdAt,
    preview,
    gitInfo,
    agentNickname,
    agentRole
  };
}

function mergeTurnWithSessionItems(turn: DockTurn, sessionItems: DockThreadItem[]) {
  const hasAuxiliarySessionItems = sessionItems.some(
    (item) =>
      item.type === "commandExecution" ||
      item.type === "fileChange" ||
      item.type === "plan"
  );

  if (!hasAuxiliarySessionItems) {
    return turn;
  }

  const userQueue = turn.items.filter((item) => item.type === "userMessage");
  const agentQueue = turn.items.filter((item) => item.type === "agentMessage");
  const consumedIds = new Set<string>();
  const mergedItems: DockThreadItem[] = [];

  for (const item of sessionItems) {
    if (item.type === "userMessage") {
      const nextUser = userQueue.shift();
      if (nextUser) {
        consumedIds.add(nextUser.id);
        mergedItems.push(nextUser);
      }
      continue;
    }

    if (item.type === "agentMessage") {
      const nextAgent = agentQueue.shift();
      if (nextAgent) {
        consumedIds.add(nextAgent.id);
        mergedItems.push(nextAgent);
      }
      continue;
    }

    mergedItems.push(item);
  }

  const skipServerCommandItems = sessionItems.some(
    (item) => item.type === "commandExecution"
  );
  const skipServerFileChanges = sessionItems.some(
    (item) => item.type === "fileChange"
  );
  const skipServerPlans = sessionItems.some((item) => item.type === "plan");

  for (const item of turn.items) {
    if (consumedIds.has(item.id)) {
      continue;
    }

    if (skipServerCommandItems && item.type === "commandExecution") {
      continue;
    }

    if (skipServerFileChanges && item.type === "fileChange") {
      continue;
    }

    if (skipServerPlans && item.type === "plan") {
      continue;
    }

    mergedItems.push(item);
  }

  return {
    ...turn,
    items: mergedItems
  };
}

function mergeTurnWithSessionHistory(turn: DockTurn, sessionTurn: DockTurn) {
  const mergedTurn = mergeTurnWithSessionItems(turn, sessionTurn.items);

  return {
    ...mergedTurn,
    startedAt: sessionTurn.startedAt ?? mergedTurn.startedAt ?? null,
    completedAt: sessionTurn.completedAt ?? mergedTurn.completedAt ?? null,
    durationMs: sessionTurn.durationMs ?? mergedTurn.durationMs ?? null
  };
}

async function findSessionFile(threadId: string): Promise<string | null> {
  if (SESSION_FILE_CACHE.has(threadId)) {
    return SESSION_FILE_CACHE.get(threadId) ?? null;
  }

  const pending = [getCodexSessionsRoot()];
  let match: string | null = null;

  while (pending.length) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, {
        withFileTypes: true
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith(".jsonl") &&
        entry.name.includes(threadId)
      ) {
        match = entryPath;
        break;
      }
    }

    if (match) {
      break;
    }
  }

  SESSION_FILE_CACHE.set(threadId, match);
  return match;
}

async function listSessionFiles() {
  const pending = [getCodexSessionsRoot()];
  const files: string[] = [];

  while (pending.length) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, {
        withFileTypes: true
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

async function readThreadSummaryFromSessionFile(
  filePath: string
): Promise<DockThread | null> {
  let content: string;
  let stats: Awaited<ReturnType<typeof fs.stat>>;

  try {
    [content, stats] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath)
    ]);
  } catch {
    return null;
  }

  const metadata = extractThreadMetadataFromSessionContent(
    content,
    filePath,
    stats.mtimeMs
  );
  if (!metadata) {
    return null;
  }

  return createThreadFromSessionMetadata(metadata, filePath, stats.mtimeMs, []);
}

async function getCachedSessionThreadSummaries() {
  if (sessionSummaryCache && sessionSummaryCache.expiresAt > Date.now()) {
    return sessionSummaryCache.threads.map(cloneThreadSummary);
  }

  const files = await listSessionFiles();
  const threads = (
    await Promise.all(files.map((filePath) => readThreadSummaryFromSessionFile(filePath)))
  )
    .filter((thread): thread is DockThread => Boolean(thread))
    .sort((left, right) => right.updatedAt - left.updatedAt);

  sessionSummaryCache = {
    expiresAt: Date.now() + SESSION_SUMMARY_CACHE_TTL_MS,
    threads
  };

  return threads.map(cloneThreadSummary);
}

export async function listThreadSummariesFromSessionHistory(input: {
  limit?: number | null;
  searchTerm?: string | null;
  cwd?: string | null;
  archived?: boolean | null;
}) {
  if (input.archived) {
    return [];
  }

  const searchTerm = getString(input.searchTerm)?.toLowerCase() ?? null;
  const cwd = getString(input.cwd);
  const limit = input.limit ?? 200;
  const threads = await getCachedSessionThreadSummaries();

  return threads
    .filter((thread) => {
      if (cwd && thread.cwd !== cwd) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const haystack =
        `${thread.name ?? ""} ${thread.preview} ${thread.cwd}`.toLowerCase();
      return haystack.includes(searchTerm);
    })
    .slice(0, limit);
}

export async function enrichThreadWithSessionHistory(thread: DockThread) {
  const sessionFile = await findSessionFile(thread.id);
  if (!sessionFile) {
    return thread;
  }

  let content: string;
  try {
    content = await fs.readFile(sessionFile, "utf8");
  } catch {
    return thread;
  }

  const sessionTurns = buildTurnsFromSessionContent(content);
  if (!sessionTurns.length) {
    return thread;
  }

  const sessionTurnsById = new Map(sessionTurns.map((turn) => [turn.id, turn]));

  return {
    ...thread,
    turns: thread.turns.map((turn) => {
      const sessionTurn = sessionTurnsById.get(turn.id);
      return sessionTurn ? mergeTurnWithSessionHistory(turn, sessionTurn) : turn;
    })
  };
}

export async function readThreadFromSessionHistory(threadId: string) {
  const sessionFile = await findSessionFile(threadId);
  if (!sessionFile) {
    return null;
  }

  let content: string;
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    [content, stats] = await Promise.all([
      fs.readFile(sessionFile, "utf8"),
      fs.stat(sessionFile)
    ]);
  } catch {
    return null;
  }

  const metadata = extractThreadMetadataFromSessionContent(
    content,
    sessionFile,
    stats.mtimeMs
  );
  if (!metadata) {
    return null;
  }

  return createThreadFromSessionMetadata(
    metadata,
    sessionFile,
    stats.mtimeMs,
    buildTurnsFromSessionContent(content)
  );
}
