import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DockThread, DockThreadItem, DockTurn, DockUserInput } from "@/lib/codex/types";

const SESSION_FILE_CACHE = new Map<string, string | null>();

type SessionJsonlRecord = {
  type?: unknown;
  payload?: unknown;
};

type SessionTurnItems = Map<string, DockThreadItem[]>;

function getCodexSessionsRoot() {
  const codexHome =
    process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  return path.join(codexHome, "sessions");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
        const counts = countUnifiedDiffLines(change.unified_diff);

        return {
          path: filePath,
          type: typeof change.type === "string" ? change.type : "update",
          additions: counts.additions,
          deletions: counts.deletions,
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

    if (record.type !== "event_msg" || !isRecord(record.payload)) {
      continue;
    }

    const payload = record.payload;
    const eventType = typeof payload.type === "string" ? payload.type : null;
    const turnId = typeof payload.turn_id === "string" ? payload.turn_id : null;

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

function mergeTurnWithSessionItems(turn: DockTurn, sessionItems: DockThreadItem[]) {
  const hasAuxiliarySessionItems = sessionItems.some(
    (item) => item.type === "commandExecution" || item.type === "fileChange"
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
      } else {
        mergedItems.push(item);
      }
      continue;
    }

    if (item.type === "agentMessage") {
      const nextAgent = agentQueue.shift();
      if (nextAgent) {
        consumedIds.add(nextAgent.id);
        mergedItems.push(nextAgent);
      } else {
        mergedItems.push(item);
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

    mergedItems.push(item);
  }

  return {
    ...turn,
    items: mergedItems
  };
}

async function findSessionFile(threadId: string): Promise<string | null> {
  if (SESSION_FILE_CACHE.has(threadId)) {
    return SESSION_FILE_CACHE.get(threadId) ?? null;
  }

  const sessionsRoot = getCodexSessionsRoot();
  const pending = [sessionsRoot];
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

  const sessionTurnItems = parseSessionTurnItems(content);
  if (!sessionTurnItems.size) {
    return thread;
  }

  return {
    ...thread,
    turns: thread.turns.map((turn) => {
      const items = sessionTurnItems.get(turn.id);
      return items ? mergeTurnWithSessionItems(turn, items) : turn;
    })
  };
}
