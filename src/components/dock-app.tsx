"use client";

import clsx from "clsx";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import {
  DockSelect,
  type DockSelectOption
} from "@/components/dock-select";
import { AppIcon } from "@/components/dock-icons";
import { DockShellView } from "@/components/dock-shell-view";
import type {
  DockApprovalPolicy,
  DockBridgeEvent,
  DockFileChangeEntry,
  DockModel,
  DockPlanStep,
  DockPlanStepStatus,
  DockPermissionPreset,
  DockSandboxMode,
  DockServerRequest,
  DockThread,
  DockThreadItem,
  DockTurn,
  DockUserInput
} from "@/lib/codex/types";
import { useI18n } from "@/lib/i18n/provider";
import type { TranslateFn } from "@/lib/i18n/messages";
import {
  getDockResponsiveMode,
  type DockResponsiveMode,
  type DockResponsiveStrategy
} from "@/lib/dock-responsive";
import type { StatusPayload } from "@/lib/status";

type UploadItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  url: string;
  previewUrl?: string;
};

type ArchiveFilter = "live" | "archived";

type ConnectionNoticeState =
  | {
      kind: "translation";
      key: "notice.bridgeDisconnected" | "notice.liveReconnect";
    }
  | {
      kind: "message";
      message: string;
    }
  | null;

type DockAppProps = {
  apiBasePath?: string;
  responsiveStrategy?: DockResponsiveStrategy;
  responsiveModeOverride?: DockResponsiveMode;
  viewportSafeAreaTop?: boolean;
};

function normalizeApiBasePath(value?: string) {
  const normalized = value?.trim();
  if (!normalized || normalized === "/api") {
    return "/api";
  }

  return normalized.replace(/\/+$/, "");
}

function buildApiUrl(apiBasePath: string, suffix: string) {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (apiBasePath === "/api") {
    return `/api${normalizedSuffix}`;
  }

  return `${apiBasePath}${normalizedSuffix}`;
}

function resolveApiAssetUrl(apiBasePath: string, url: string) {
  if (!url.startsWith("/api/")) {
    return url;
  }

  return buildApiUrl(apiBasePath, url.slice("/api".length));
}

function getProjectName(cwd: string) {
  const parts = cwd.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || cwd;
}

function getThreadLabel(thread: DockThread, t: TranslateFn) {
  return thread.name?.trim() || thread.preview?.trim() || t("thread.untitled");
}

function getArchiveState(thread: DockThread) {
  return thread.source === "archive";
}

function isSidebarArchivedThread(
  thread: DockThread,
  archiveFilter: ArchiveFilter
) {
  return archiveFilter === "archived" || getArchiveState(thread);
}

function matchesArchiveFilter(thread: DockThread, archiveFilter: ArchiveFilter) {
  return archiveFilter === "archived"
    ? getArchiveState(thread)
    : !getArchiveState(thread);
}

function updateThreadListWithArchiveState(
  threads: DockThread[],
  nextThread: DockThread,
  archiveFilter: ArchiveFilter
) {
  const nextThreads = threads.filter((thread) => thread.id !== nextThread.id);

  if (!matchesArchiveFilter(nextThread, archiveFilter)) {
    return nextThreads;
  }

  return [...nextThreads, nextThread].sort(
    (left, right) => right.updatedAt - left.updatedAt
  );
}

function isThreadActive(thread: DockThread | null) {
  return thread?.status.type === "active";
}

function humanizeIdentifier(value: string) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localizeRuntimeMessage(message: string, t: TranslateFn) {
  const normalized = message.trim();

  switch (normalized) {
    case "Failed to fetch":
      return t("error.networkFailed");
    case "Failed to list models.":
      return t("error.listModelsFailed");
    case "Failed to list threads.":
      return t("error.listThreadsFailed");
    case "Prompt or image attachment is required.":
      return t("error.promptOrAttachmentRequired");
    case "Failed to create thread.":
      return t("error.createThreadFailed");
    case "Failed to resolve request.":
      return t("error.resolveRequestFailed");
    case "Failed to read thread.":
      return t("error.readThreadFailed");
    case "Failed to update thread.":
      return t("error.updateThreadFailed");
    case "turnId is required.":
      return t("error.turnIdRequired");
    case "Failed to append turn.":
      return t("error.appendTurnFailed");
    case "No files uploaded.":
      return t("error.noFilesUploaded");
    case "Failed to store files.":
      return t("error.storeFilesFailed");
    case "Upload not found.":
      return t("error.uploadNotFound");
    case "Invalid upload path.":
      return t("error.invalidUploadPath");
    case "Codex bridge is not connected.":
      return t("error.bridgeNotConnected");
    case "Codex bridge connection closed.":
      return t("error.bridgeConnectionClosed");
    case "Timed out connecting to codex app-server.":
      return t("error.bridgeConnectTimedOut");
    case "Codex bridge disconnected.":
      return t("notice.bridgeDisconnected");
    case "This approval request is no longer valid. Refresh the current thread and try again.":
      return t("error.approvalExpired");
    default: {
      const requestStatusMatch = normalized.match(/^Request failed: (\d+)$/);
      if (requestStatusMatch) {
        return t("error.requestFailedWithStatus", {
          status: requestStatusMatch[1]
        });
      }

      const appServerExitMatch = normalized.match(
        /^Codex app-server exited with code (.+)\.$/
      );
      if (appServerExitMatch) {
        return t("error.appServerExited", {
          code: appServerExitMatch[1]
        });
      }

      return normalized;
    }
  }
}

function getActiveTurn(thread: DockThread | null) {
  const turns = thread?.turns ?? [];
  return [...turns].reverse().find((turn: DockTurn) => turn.status === "inProgress") ?? null;
}

function withTurnTimingMetadata(turn: DockTurn, previousTurn?: DockTurn | null) {
  const startedAt =
    turn.startedAt ??
    previousTurn?.startedAt ??
    (turn.status === "inProgress" ? Date.now() : null);
  const completedAt = turn.completedAt ?? previousTurn?.completedAt ?? null;
  const durationMs =
    turn.durationMs ??
    previousTurn?.durationMs ??
    (startedAt !== null && completedAt !== null && completedAt >= startedAt
      ? completedAt - startedAt
      : null);

  return {
    ...turn,
    startedAt,
    completedAt,
    durationMs
  };
}

function upsertTurn(thread: DockThread, turn: DockTurn) {
  const turns = [...thread.turns];
  const index = turns.findIndex((entry) => entry.id === turn.id);

  if (index >= 0) {
    const nextTurn = withTurnTimingMetadata(turn, turns[index]);
    turns[index] = {
      ...turns[index],
      ...nextTurn,
      items: nextTurn.items.length ? nextTurn.items : turns[index].items
    };
  } else {
    turns.push(withTurnTimingMetadata(turn));
  }

  return {
    ...thread,
    turns
  };
}

function createOptimisticUserItem(
  turnId: string,
  prompt: string,
  attachmentPaths: string[]
): Extract<DockThreadItem, { type: "userMessage" }> {
  return {
    type: "userMessage",
    id: `optimistic-user:${turnId}`,
    content: [
      ...(prompt.trim()
        ? [
            {
              type: "text" as const,
              text: prompt,
              text_elements: []
            }
          ]
        : []),
      ...attachmentPaths.map((path) => ({
        type: "localImage" as const,
        path
      }))
    ]
  };
}

function seedTurnWithPrompt(
  turn: DockTurn,
  prompt: string,
  attachmentPaths: string[]
) {
  if (turn.items.length) {
    return turn;
  }

  return {
    ...turn,
    items: [createOptimisticUserItem(turn.id, prompt, attachmentPaths)]
  };
}

function replaceTurnItem(thread: DockThread, turnId: string, nextItem: DockThreadItem) {
  const turns = thread.turns.map((turn) => {
    if (turn.id !== turnId) return turn;

    const optimisticUserId = `optimistic-user:${turnId}`;
    const items =
      nextItem.type === "userMessage"
        ? turn.items.filter((item) => item.id !== optimisticUserId)
        : [...turn.items];
    const index = items.findIndex((item) => item.id === nextItem.id);

    if (index >= 0) {
      items[index] = nextItem;
    } else {
      items.push(nextItem);
    }

    return {
      ...turn,
      items
    };
  });

  return {
    ...thread,
    turns
  };
}

function createTurnPlanItem(
  turnId: string,
  explanation: string | null,
  steps: DockPlanStep[]
): Extract<DockThreadItem, { type: "plan" }> {
  const numberedText = steps
    .map((step, index) => `${index + 1}. ${step.step}`)
    .join("\n");

  return {
    type: "plan",
    id: `turn-plan:${turnId}`,
    text: numberedText,
    explanation,
    steps
  };
}

function upsertTurnPlan(
  thread: DockThread,
  turnId: string,
  explanation: string | null,
  plan: Array<{ step: string; status: string }>
): DockThread {
  const normalizedSteps = plan
    .filter(
      (entry): entry is { step: string; status: string } =>
        Boolean(entry?.step?.trim())
    )
    .map((entry) => ({
      step: entry.step.trim(),
      status: normalizePlanStepStatus(entry.status)
    }));
  const nextPlanItem = createTurnPlanItem(turnId, explanation, normalizedSteps);
  let turnMatched = false;

  const turns = thread.turns.map((turn) => {
    if (turn.id !== turnId) {
      return turn;
    }

    turnMatched = true;
    const items = [...turn.items];
    const existingPlanIndex = items.findIndex((item) => item.type === "plan");

    if (existingPlanIndex >= 0) {
      items[existingPlanIndex] = {
        ...items[existingPlanIndex],
        ...nextPlanItem
      };
    } else {
      const insertIndex = items.findIndex((item) => item.type !== "userMessage");
      if (insertIndex < 0) {
        items.push(nextPlanItem);
      } else {
        items.splice(insertIndex, 0, nextPlanItem);
      }
    }

    return {
      ...turn,
      items
    };
  });

  if (turnMatched) {
    return {
      ...thread,
      turns
    };
  }

  return {
    ...thread,
    turns: [
      ...turns,
      withTurnTimingMetadata({
        id: turnId,
        items: [nextPlanItem],
        status: "inProgress",
        error: null
      } satisfies DockTurn)
    ]
  };
}

function isNarrativeTurnItem(item: DockThreadItem) {
  return (
    item.type === "userMessage" ||
    item.type === "agentMessage" ||
    item.type === "plan" ||
    item.type === "reasoning"
  );
}

function mergeNarrativeTurnItem(
  currentItem: DockThreadItem,
  incomingItem: DockThreadItem
) {
  if (currentItem.type !== incomingItem.type) {
    return incomingItem;
  }

  if (incomingItem.type === "agentMessage") {
    const incomingAgentItem = incomingItem as Extract<
      DockThreadItem,
      { type: "agentMessage" }
    >;
    const currentAgentItem = currentItem as Extract<
      DockThreadItem,
      { type: "agentMessage" }
    >;

    return {
      ...incomingAgentItem,
      text: incomingAgentItem.text || currentAgentItem.text,
      phase: incomingAgentItem.phase ?? currentAgentItem.phase
    };
  }

  if (incomingItem.type === "plan") {
    const incomingPlanItem = incomingItem as Extract<
      DockThreadItem,
      { type: "plan" }
    >;
    const currentPlanItem = currentItem as Extract<
      DockThreadItem,
      { type: "plan" }
    >;

    const preferredTextItem = {
      ...incomingPlanItem,
      text: incomingPlanItem.text || currentPlanItem.text
    };

    return {
      ...preferredTextItem,
      explanation:
        preferredTextItem.explanation ?? currentPlanItem.explanation ?? null,
      steps:
        (Array.isArray(preferredTextItem.steps) && preferredTextItem.steps.length
          ? preferredTextItem.steps
          : currentPlanItem.steps) ?? null
    };
  }

  if (incomingItem.type === "reasoning") {
    const incomingReasoningItem = incomingItem as Extract<
      DockThreadItem,
      { type: "reasoning" }
    >;
    const currentReasoningItem = currentItem as Extract<
      DockThreadItem,
      { type: "reasoning" }
    >;
    const incomingSummaryLength = incomingReasoningItem.summary.join("").length;
    const currentSummaryLength = currentReasoningItem.summary.join("").length;
    const incomingContentLength = incomingReasoningItem.content.join("").length;
    const currentContentLength = currentReasoningItem.content.join("").length;

    return incomingSummaryLength + incomingContentLength > 0
      ? incomingReasoningItem
      : {
          ...incomingReasoningItem,
          summary: currentReasoningItem.summary,
          content: currentReasoningItem.content
        };
  }

  return incomingItem;
}

function mergeTurnPreservingAuxiliaryItems(
  currentTurn: DockTurn,
  incomingTurn: DockTurn
) {
  const currentItemsById = new Map(
    currentTurn.items.map((item) => [item.id, item] as const)
  );
  const mergedItems = incomingTurn.items.map((incomingItem) => {
    const currentItem = currentItemsById.get(incomingItem.id);

    if (!currentItem || currentItem.type !== incomingItem.type) {
      return incomingItem;
    }

    if (incomingTurn.status === "inProgress" && isNarrativeTurnItem(incomingItem)) {
      return mergeNarrativeTurnItem(currentItem, incomingItem);
    }

    return incomingItem;
  });
  const mergedItemIds = new Set(mergedItems.map((item) => item.id));

  for (const currentItem of currentTurn.items) {
    if (mergedItemIds.has(currentItem.id)) {
      continue;
    }

    if (incomingTurn.status === "inProgress") {
      if (!isNarrativeTurnItem(currentItem)) {
        mergedItems.push(currentItem);
      }
      continue;
    }

    if (currentItem.type === "plan") {
      mergedItems.push(currentItem);
      continue;
    }

    if (!isNarrativeTurnItem(currentItem)) {
      mergedItems.push(currentItem);
    }
  }

  const nextTurn =
    mergedItems.length === incomingTurn.items.length
      ? incomingTurn
      : {
          ...incomingTurn,
          items: mergedItems
        };

  return withTurnTimingMetadata(nextTurn, currentTurn);
}

function mergeThreadPreservingRichTurns(
  current: DockThread | null,
  incoming: DockThread
) {
  if (!current || current.id !== incoming.id) {
    return incoming;
  }

  const currentTurnsById = new Map(current.turns.map((turn) => [turn.id, turn]));
  const mergedTurns = incoming.turns.map((turn) => {
    const currentTurn = currentTurnsById.get(turn.id);

    if (!currentTurn) {
      return turn;
    }

    return mergeTurnPreservingAuxiliaryItems(currentTurn, turn);
  });

  for (const currentTurn of current.turns) {
    if (!mergedTurns.some((turn) => turn.id === currentTurn.id)) {
      mergedTurns.push(currentTurn);
    }
  }

  return {
    ...incoming,
    turns: mergedTurns
  };
}

function updateItem(
  thread: DockThread,
  turnId: string,
  itemId: string,
  update: (item: DockThreadItem | null) => DockThreadItem
) {
  const turns = thread.turns.map((turn) => {
    if (turn.id !== turnId) return turn;

    const items = [...turn.items];
    const index = items.findIndex((item) => item.id === itemId);
    const current = index >= 0 ? items[index] : null;
    const next = update(current);

    if (index >= 0) items[index] = next;
    else items.push(next);

    return {
      ...turn,
      items
    };
  });

  return {
    ...thread,
    turns
  };
}

function getUploadAssetUrl(path: string, apiBasePath = "/api") {
  const normalized = path.replace(/\\/g, "/");
  const markers = ["/.codexy/uploads/"];

  for (const marker of markers) {
    const markerIndex = normalized.lastIndexOf(marker);

    if (markerIndex === -1) {
      continue;
    }

    const uploadId = normalized.slice(markerIndex + marker.length);
    if (!uploadId) {
      return null;
    }

    return buildApiUrl(apiBasePath, `/uploads/${encodeURIComponent(uploadId)}`);
  }

  return null;
}

type AttachmentPreview = {
  key: string;
  src: string;
  label: string;
};

type AssistantImageThreadItem = DockThreadItem & {
  type: "imageView" | "imageGeneration";
  id: string;
};

type UserMetaChip = {
  key: string;
  label: string;
};

function getAttachmentLabelFromPath(path: string, t: TranslateFn) {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || t("generic.image");
}

function getAttachmentLabelFromUrl(url: string, t: TranslateFn) {
  if (/^data:image\//i.test(url)) {
    const match = /^data:(image\/[^;,]+)/i.exec(url);
    const subtype = match?.[1]?.split("/")[1]?.toUpperCase();
    return subtype
      ? t("generic.imageSubtype", { subtype })
      : t("generic.image");
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.split("/").filter(Boolean).pop();
    return pathname || parsed.hostname || t("generic.image");
  } catch {
    return t("generic.image");
  }
}

function formatCommandDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.round((durationMs / 1000) * 10) / 10;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

function getPermissionPresetConfig(preset: DockPermissionPreset): {
  approvalPolicy: DockApprovalPolicy;
  sandbox: DockSandboxMode;
} {
  if (preset === "danger-full-access") {
    return {
      approvalPolicy: "never",
      sandbox: "danger-full-access"
    };
  }

  return {
    approvalPolicy: "on-request",
    sandbox: "workspace-write"
  };
}

function getPermissionPresetFromSettings(
  approvalPolicy: string,
  sandbox: string
): DockPermissionPreset {
  if (
    sandbox === "danger-full-access" ||
    approvalPolicy === "never"
  ) {
    return "danger-full-access";
  }

  return "default";
}

function countDiffLines(unifiedDiff: string | null) {
  if (!unifiedDiff?.trim()) {
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

function getCommandStatusLabel(
  commandItem: Extract<DockThreadItem, { type: "commandExecution" }>,
  t: TranslateFn
) {
  if (commandItem.status === "failed") {
    return t("status.commandFailed");
  }

  if (commandItem.status === "interrupted") {
    return t("status.commandInterrupted");
  }

  if (commandItem.status === "running" || commandItem.status === "inProgress") {
    return t("status.commandRunning");
  }

  return t("status.commandRan");
}

function getCommandOutputPreview(output: string | null) {
  if (!output?.trim()) {
    return null;
  }

  return output.trim().split(/\r?\n/).slice(0, 12).join("\n");
}

type FileChangeRow = {
  key: string;
  action: string;
  label: string;
  additions: number | null;
  deletions: number | null;
  diff: string | null;
};

function getFirstFiniteNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getFileChangeDiff(change: DockFileChangeEntry) {
  const candidates = [change.diff, change.unifiedDiff, change.unified_diff];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function getDiffDisplayLines(diff: string | null) {
  if (!diff?.trim()) {
    return [];
  }

  const normalized = diff.replace(/\r?\n$/, "");
  return normalized ? normalized.split(/\r?\n/) : [];
}

function getDiffLineTone(line: string) {
  if (
    line.startsWith("@@") ||
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("+++ ") ||
    line.startsWith("--- ")
  ) {
    return "meta";
  }

  if (line.startsWith("+")) {
    return "added";
  }

  if (line.startsWith("-")) {
    return "removed";
  }

  return "context";
}

function getFileChangeRows(
  item: Extract<DockThreadItem, { type: "fileChange" }>,
  t: TranslateFn
): FileChangeRow[] {
  if (!item.changes.length) {
    return [
      {
        key: `${item.id}-0`,
        action: t("status.fileEdited"),
        label: t("generic.file"),
        additions: null,
        deletions: null,
        diff: null
      }
    ];
  }

  return item.changes.map((change, index) => {
    const kind =
      typeof change.kind === "string"
        ? change.kind
        : change.kind && typeof change.kind === "object"
          ? (change.kind as Record<string, unknown>)
          : null;

    const path =
      (typeof change.path === "string" && change.path) ||
      (typeof change.filePath === "string" && change.filePath) ||
      (typeof change.targetPath === "string" && change.targetPath) ||
      (typeof change.relativePath === "string" && change.relativePath) ||
      (typeof change.newPath === "string" && change.newPath) ||
      (kind &&
      typeof kind === "object" &&
      "move_path" in kind &&
      typeof kind.move_path === "string" &&
      kind.move_path
        ? kind.move_path
        : "") ||
      t("generic.fileIndexed", { index: index + 1 });

    const diff = getFileChangeDiff(change);
    const diffCounts = countDiffLines(diff);

    const additions = getFirstFiniteNumber(
      change.additions,
      change.addedLines,
      change.insertions,
      diffCounts.additions
    );

    const deletions = getFirstFiniteNumber(
      change.deletions,
      change.removals,
      change.deletedLines,
      diffCounts.deletions
    );

    const rawAction =
      (typeof change.type === "string" && change.type) ||
      (kind &&
      typeof kind === "object" &&
      "type" in kind &&
      typeof kind.type === "string"
        ? kind.type
        : "") ||
      (typeof change.kind === "string" && change.kind) ||
      (typeof change.status === "string" && change.status) ||
      "edited";

    let action = t("status.fileEdited");
    if (/add|create/i.test(rawAction)) action = t("status.fileAdded");
    if (/delete|remove/i.test(rawAction)) action = t("status.fileDeleted");
    if (/rename|move/i.test(rawAction)) action = t("status.fileRenamed");

    return {
      key: `${item.id}-${index}`,
      action,
      label: getAttachmentLabelFromPath(path, t),
      additions,
      deletions,
      diff
    };
  });
}

function FileChangeRowView({ change }: { change: FileChangeRow }) {
  const summaryMeta = (
    <span className="dock-filechange-meta">
      <span className="dock-filechange-action">{change.action}</span>
      <span className="dock-filechange-label">{change.label}</span>
      {typeof change.additions === "number" ? (
        <span className="dock-diff-count is-added">+{change.additions}</span>
      ) : null}
      {typeof change.deletions === "number" ? (
        <span className="dock-diff-count is-removed">-{change.deletions}</span>
      ) : null}
    </span>
  );

  if (!change.diff) {
    return (
      <div className="dock-filechange-card is-static">
        <div className="dock-filechange-summary is-static">{summaryMeta}</div>
      </div>
    );
  }

  const diffLines = getDiffDisplayLines(change.diff);

  return (
    <details className="dock-filechange-card" open={false}>
      <summary className="dock-filechange-summary">
        {summaryMeta}
        <span aria-hidden="true" className="dock-filechange-toggle">
          <AppIcon className="dock-filechange-toggle-icon" name="chevron" />
        </span>
      </summary>
      <div className="dock-filechange-detail">
        <pre className="dock-filechange-output">
          {diffLines.map((line, index) => (
            <span
              className={clsx(
                "dock-filechange-line",
                `is-${getDiffLineTone(line)}`
              )}
              key={`${change.key}:${index}`}
            >
              {line || " "}
            </span>
          ))}
        </pre>
      </div>
    </details>
  );
}

function stripInlineDataImageLines(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^data:image\/[a-z0-9.+-]+;base64,/i.test(line.trim()))
    .join("\n")
    .trim();
}

function getUserAttachmentPreview(
  entry: DockUserInput,
  key: string,
  t: TranslateFn,
  apiBasePath: string
): AttachmentPreview | null {
  if (entry.type === "localImage") {
    const src = getUploadAssetUrl(entry.path, apiBasePath);

    if (!src) {
      return null;
    }

    return {
      key,
      src,
      label: getAttachmentLabelFromPath(entry.path, t)
    };
  }

  if (entry.type === "image") {
    return {
      key,
      src: resolveApiAssetUrl(apiBasePath, entry.url),
      label: getAttachmentLabelFromUrl(entry.url, t)
    };
  }

  return null;
}

function getUserMetaChip(entry: DockUserInput, key: string): UserMetaChip | null {
  if (entry.type === "skill" || entry.type === "mention") {
    return {
      key,
      label: entry.name
    };
  }

  return null;
}

function getThreadItemImageSource(value: string, apiBasePath: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const uploadAssetUrl = getUploadAssetUrl(normalized, apiBasePath);
  if (uploadAssetUrl) {
    return uploadAssetUrl;
  }

  if (
    /^data:image\//i.test(normalized) ||
    /^https?:\/\//i.test(normalized) ||
    /^\/api\/uploads\//i.test(normalized)
  ) {
    return resolveApiAssetUrl(apiBasePath, normalized);
  }

  return null;
}

function getThreadItemImageLabel(
  container: Record<string, unknown> | null,
  sourceValue: string,
  resolvedSource: string,
  t: TranslateFn,
  apiBasePath: string
) {
  if (container) {
    for (const key of ["label", "title", "caption", "alt", "name", "fileName", "filename"]) {
      const rawValue = container[key];
      if (typeof rawValue === "string" && rawValue.trim()) {
        return rawValue.trim();
      }
    }
  }

  return getUploadAssetUrl(sourceValue, apiBasePath)
    ? getAttachmentLabelFromPath(sourceValue, t)
    : getAttachmentLabelFromUrl(resolvedSource, t);
}

function appendThreadItemImagePreview(
  previews: AttachmentPreview[],
  seen: Set<string>,
  itemId: string,
  sourceValue: string,
  container: Record<string, unknown> | null,
  t: TranslateFn,
  apiBasePath: string
) {
  const resolvedSource = getThreadItemImageSource(sourceValue, apiBasePath);
  if (!resolvedSource || seen.has(resolvedSource)) {
    return;
  }

  seen.add(resolvedSource);
  previews.push({
    key: `${itemId}-image-${previews.length}`,
    src: resolvedSource,
    label: getThreadItemImageLabel(container, sourceValue, resolvedSource, t, apiBasePath)
  });
}

function getThreadItemImageMimeType(container: Record<string, unknown> | null) {
  if (!container) {
    return "image/png";
  }

  for (const key of ["mimeType", "mime_type", "contentType", "content_type"]) {
    const rawValue = container[key];
    if (typeof rawValue === "string" && /^image\//i.test(rawValue.trim())) {
      return rawValue.trim();
    }
  }

  return "image/png";
}

function collectThreadItemImagePreviews(
  value: unknown,
  previews: AttachmentPreview[],
  seen: Set<string>,
  itemId: string,
  t: TranslateFn,
  apiBasePath: string,
  depth = 0
) {
  if (!value || depth > 4) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectThreadItemImagePreviews(entry, previews, seen, itemId, t, apiBasePath, depth + 1);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();

      if (
        normalizedKey === "url" ||
        normalizedKey === "src" ||
        normalizedKey === "uri" ||
        normalizedKey === "href" ||
        normalizedKey === "image" ||
        normalizedKey === "imageurl" ||
        normalizedKey === "imageuri" ||
        normalizedKey === "path" ||
        normalizedKey === "filepath" ||
        normalizedKey === "file"
      ) {
        appendThreadItemImagePreview(previews, seen, itemId, entry, value, t, apiBasePath);
        continue;
      }

      if (normalizedKey === "b64json" && entry.trim()) {
        appendThreadItemImagePreview(
          previews,
          seen,
          itemId,
          `data:${getThreadItemImageMimeType(value)};base64,${entry.trim()}`,
          value,
          t,
          apiBasePath
        );
      }
      continue;
    }

    collectThreadItemImagePreviews(entry, previews, seen, itemId, t, apiBasePath, depth + 1);
  }
}

function getThreadItemImagePreviews(
  item: AssistantImageThreadItem,
  t: TranslateFn,
  apiBasePath: string
) {
  const previews: AttachmentPreview[] = [];
  const seen = new Set<string>();

  collectThreadItemImagePreviews(item, previews, seen, item.id, t, apiBasePath);

  return previews;
}

function AttachmentLightbox({
  attachment,
  onClose
}: {
  attachment: AttachmentPreview;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="dock-lightbox"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="dock-lightbox-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="dock-lightbox-close"
          onClick={onClose}
          type="button"
        >
          {t("actions.close")}
        </button>
        <img
          alt={attachment.label}
          className="dock-lightbox-image"
          src={attachment.src}
        />
        <div className="dock-lightbox-caption">{attachment.label}</div>
      </div>
    </div>
  );
}

function ArtifactItemView({ item }: { item: DockThreadItem }) {
  return (
    <div className="dock-artifact">
      <div className="dock-artifact-head">{humanizeIdentifier(item.type)}</div>
      <pre>{JSON.stringify(item, null, 2)}</pre>
    </div>
  );
}

function ContextCompactionItemView() {
  const { t } = useI18n();

  return (
    <div
      aria-label={t("event.contextCompaction")}
      className="dock-context-compaction"
      role="note"
    >
      <span aria-hidden="true" className="dock-context-compaction-line" />
      <span className="dock-context-compaction-label">
        <AppIcon className="dock-context-compaction-icon" name="compact" />
        <span>{t("event.contextCompaction")}</span>
      </span>
      <span aria-hidden="true" className="dock-context-compaction-line" />
    </div>
  );
}

function UserMessageView({
  item,
  apiBasePath
}: {
  item: Extract<DockThreadItem, { type: "userMessage" }>;
  apiBasePath: string;
}) {
  const { t } = useI18n();
  const attachments = item.content
    .map((entry, index) =>
      getUserAttachmentPreview(entry, `${item.id}-attachment-${index}`, t, apiBasePath)
    )
    .filter((entry): entry is AttachmentPreview => Boolean(entry));

  const textEntries = item.content
    .filter(
      (entry): entry is Extract<DockUserInput, { type: "text" }> => entry.type === "text"
    )
    .map((entry, index) => ({
      key: `${item.id}-text-${index}`,
      text: attachments.length ? stripInlineDataImageLines(entry.text) : entry.text
    }))
    .filter((entry) => entry.text.length > 0);

  const metaChips = item.content
    .map((entry, index) => getUserMetaChip(entry, `${item.id}-meta-${index}`))
    .filter((entry): entry is UserMetaChip => Boolean(entry));

  const [activeAttachment, setActiveAttachment] = useState<AttachmentPreview | null>(
    null
  );

  return (
    <>
      <div className="dock-user-message-stack">
        {attachments.length ? (
          <div className="dock-user-attachments">
            {attachments.map((attachment) => (
              <button
                className="dock-user-attachment-tile"
                key={attachment.key}
                onClick={() => setActiveAttachment(attachment)}
                type="button"
              >
                <img alt={attachment.label} src={attachment.src} />
              </button>
            ))}
          </div>
        ) : null}

        {textEntries.length ? (
          <div className="dock-user-bubble">
            {textEntries.map((entry) => (
              <p className="dock-entry-text" key={entry.key}>
                {entry.text}
              </p>
            ))}
          </div>
        ) : null}

        {metaChips.length ? (
          <div className="dock-user-meta-row">
            {metaChips.map((chip) => (
              <span className="dock-user-meta-chip" key={chip.key}>
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {activeAttachment ? (
        <AttachmentLightbox
          attachment={activeAttachment}
          onClose={() => setActiveAttachment(null)}
        />
      ) : null}
    </>
  );
}

function AgentMessageView({
  item
}: {
  item: Extract<DockThreadItem, { type: "agentMessage" }>;
}) {
  const text = item.text?.trim().length ? item.text : "";

  return (
    <div className="dock-agent-response">
      {text ? (
        <div className="dock-markdown">
          <ReactMarkdown
            components={{
              a: ({ ...props }) => (
                <a
                  {...props}
                  rel="noreferrer"
                  target="_blank"
                />
              )
            }}
            remarkPlugins={[remarkGfm, remarkBreaks]}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="dock-entry-text">...</p>
      )}
    </div>
  );
}

function normalizePlanStepStatus(value: unknown): DockPlanStepStatus {
  if (value === "completed") {
    return "completed";
  }

  if (value === "inProgress" || value === "in_progress") {
    return "inProgress";
  }

  return "pending";
}

function parsePlanStepsFromText(text: string): DockPlanStep[] {
  const steps: DockPlanStep[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^plan:\s*$/i.test(line)) {
      continue;
    }

    let match = line.match(/^(?:\d+\.\s+|[-*]\s+)?\[(x|X| )\]\s+(.+)$/);
    if (match) {
      steps.push({
        step: match[2].trim(),
        status: match[1].toLowerCase() === "x" ? "completed" : "pending"
      });
      continue;
    }

    match = line.match(
      /^(?:\d+\.\s+|[-*]\s+)?\[(completed|done|in[\s_-]?progress|pending)\]\s+(.+)$/i
    );
    if (match) {
      steps.push({
        step: match[2].trim(),
        status: normalizePlanStepStatus(match[1].toLowerCase())
      });
      continue;
    }

    match = line.match(/^(?:\d+\.\s+|[-*]\s+)(.+)$/);
    if (match) {
      steps.push({
        step: match[1].trim(),
        status: "pending"
      });
    }
  }

  if (!steps.length && text.trim()) {
    steps.push({
      step: text.trim(),
      status: "pending"
    });
  }

  return steps;
}

function getPlanSteps(item: Extract<DockThreadItem, { type: "plan" }>) {
  if (Array.isArray(item.steps) && item.steps.length) {
    return item.steps
      .filter(
        (entry): entry is DockPlanStep =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.step === "string" &&
          entry.step.trim().length > 0
      )
      .map((entry) => ({
        step: entry.step.trim(),
        status: normalizePlanStepStatus(entry.status)
      }));
  }

  return parsePlanStepsFromText(item.text);
}

function PlanItemView({
  item
}: {
  item: Extract<DockThreadItem, { type: "plan" }>;
}) {
  const { t } = useI18n();
  const steps = getPlanSteps(item);
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const explanation =
    typeof item.explanation === "string" && item.explanation.trim()
      ? item.explanation.trim()
      : null;
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(false);
  }, [item.id]);

  return (
    <section className={clsx("dock-plan-card", isCollapsed && "is-collapsed")}>
      <div className="dock-plan-card-head">
        <div className="dock-plan-card-summary">
          <span aria-hidden="true" className="dock-plan-card-glyph">
            <span />
            <span />
            <span />
          </span>
          <strong>{t("plan.summary", { count: steps.length, completed: completedCount })}</strong>
        </div>
        <button
          aria-expanded={!isCollapsed}
          aria-label={t("aria.toggleTasks")}
          className={clsx("dock-plan-toggle", isCollapsed && "is-collapsed")}
          onClick={() => setIsCollapsed((current) => !current)}
          type="button"
        >
          <AppIcon className="dock-plan-toggle-icon" name="chevron" />
        </button>
      </div>
      {!isCollapsed ? (
        <div className="dock-plan-card-body">
          {explanation ? <p className="dock-plan-card-explanation">{explanation}</p> : null}
          <ol className="dock-plan-list">
            {steps.map((step, index) => (
              <li
                className={clsx("dock-plan-row", `is-${step.status}`)}
                key={`${step.status}-${step.step}-${index}`}
              >
                <span aria-hidden="true" className="dock-plan-row-status" />
                <span className="dock-plan-row-index">{index + 1}.</span>
                <div className="dock-plan-row-copy">
                  <ReactMarkdown
                    components={{
                      a: ({ ...props }) => (
                        <a
                          {...props}
                          rel="noreferrer"
                          target="_blank"
                        />
                      ),
                      p: ({ children }) => <>{children}</>,
                      ul: ({ children }) => <>{children}</>,
                      ol: ({ children }) => <>{children}</>,
                      li: ({ children }) => <>{children}</>
                    }}
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                  >
                    {step.step}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function AssistantImageItemView({
  item,
  apiBasePath
}: {
  item: AssistantImageThreadItem;
  apiBasePath: string;
}) {
  const { t } = useI18n();
  const attachments = getThreadItemImagePreviews(item, t, apiBasePath);
  const [activeAttachment, setActiveAttachment] = useState<AttachmentPreview | null>(
    null
  );

  if (!attachments.length) {
    return <ArtifactItemView item={item} />;
  }

  return (
    <>
      <div className="dock-artifact dock-image-artifact">
        <div className="dock-artifact-head">{humanizeIdentifier(item.type)}</div>
        <div className="dock-assistant-image-grid">
          {attachments.map((attachment) => (
            <figure className="dock-assistant-image-card" key={attachment.key}>
              <button
                className="dock-assistant-image-button"
                onClick={() => setActiveAttachment(attachment)}
                type="button"
              >
                <img alt={attachment.label} src={attachment.src} />
              </button>
              <figcaption className="dock-assistant-image-caption">
                {attachment.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {activeAttachment ? (
        <AttachmentLightbox
          attachment={activeAttachment}
          onClose={() => setActiveAttachment(null)}
        />
      ) : null}
    </>
  );
}

function ThreadItemView({
  item,
  apiBasePath
}: {
  item: DockThreadItem;
  apiBasePath: string;
}) {
  const { t } = useI18n();

  if (item.type === "userMessage") {
    return (
      <UserMessageView
        item={item as Extract<DockThreadItem, { type: "userMessage" }>}
        apiBasePath={apiBasePath}
      />
    );
  }

  if (item.type === "agentMessage") {
    return (
      <AgentMessageView
        item={item as Extract<DockThreadItem, { type: "agentMessage" }>}
      />
    );
  }

  if (item.type === "plan") {
    return (
      <PlanItemView
        item={item as Extract<DockThreadItem, { type: "plan" }>}
      />
    );
  }

  if (item.type === "reasoning") {
    return (
      <div className="dock-reasoning-status">
        <span className="dock-reasoning-dot" />
        <span>{t("thinking.label")}</span>
      </div>
    );
  }

  if (item.type === "commandExecution") {
    const commandItem = item as Extract<DockThreadItem, { type: "commandExecution" }>;
    const outputPreview = getCommandOutputPreview(commandItem.aggregatedOutput);
    const duration = formatCommandDuration(commandItem.durationMs);
    return (
      <details className="dock-command-card" open={false}>
        <summary className="dock-command-summary">
          <span className="dock-command-label">
            {getCommandStatusLabel(commandItem, t)}
          </span>
          <span className="dock-command-text">{commandItem.command}</span>
          {duration ? <span className="dock-command-duration">({duration})</span> : null}
          <span aria-hidden="true" className="dock-command-toggle">
            <AppIcon className="dock-command-toggle-icon" name="chevron" />
          </span>
        </summary>
        <div className="dock-command-detail">
          <div className="dock-terminal-path">{commandItem.cwd}</div>
          {outputPreview ? <pre className="dock-command-output">{outputPreview}</pre> : null}
        </div>
      </details>
    );
  }

  if (item.type === "fileChange") {
    const fileChangeItem = item as Extract<DockThreadItem, { type: "fileChange" }>;

    return (
      <div className="dock-filechange-stack">
        {getFileChangeRows(fileChangeItem, t).map((change) => (
          <FileChangeRowView change={change} key={change.key} />
        ))}
      </div>
    );
  }

  if (item.type === "imageView" || item.type === "imageGeneration") {
    return (
      <AssistantImageItemView
        item={item as AssistantImageThreadItem}
        apiBasePath={apiBasePath}
      />
    );
  }

  if (item.type === "contextCompaction") {
    return <ContextCompactionItemView />;
  }

  return <ArtifactItemView item={item} />;
}

function getApprovePayload(method: DockServerRequest["method"]) {
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "approved_for_session" };
  }

  return { decision: "acceptForSession" };
}

function getSingleApprovePayload(method: DockServerRequest["method"]) {
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "approved" };
  }

  return { decision: "accept" };
}

function getDeclinePayload(method: DockServerRequest["method"]) {
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "denied" };
  }

  return { decision: "decline" };
}

function getRequestTitle(method: DockServerRequest["method"], t: TranslateFn) {
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "execCommandApproval"
  ) {
    return t("request.commandApproval");
  }

  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return t("request.fileApproval");
  }

  if (method === "item/tool/requestUserInput") {
    return t("request.userInput");
  }

  return humanizeIdentifier(method);
}

function getCommandApprovalText(request: DockServerRequest, t: TranslateFn) {
  if (request.method === "item/commandExecution/requestApproval") {
    return (
      request.params.command ||
      request.params.reason ||
      t("request.commandNeedsApproval")
    );
  }

  if (request.method === "execCommandApproval") {
    return request.params.command.join(" ");
  }

  return "";
}

function getCommandApprovalCwd(
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

export function DockApp({
  apiBasePath = "/api",
  responsiveStrategy = "viewport",
  responsiveModeOverride,
  viewportSafeAreaTop = false
}: DockAppProps) {
  const { t } = useI18n();
  const resolvedApiBasePath = normalizeApiBasePath(apiBasePath);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [threads, setThreads] = useState<DockThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<DockThread | null>(null);
  const [models, setModels] = useState<DockModel[]>([]);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("live");
  const [composerCwd, setComposerCwd] = useState("");
  const [composerModel, setComposerModel] = useState("");
  const [composerReasoningEffort, setComposerReasoningEffort] = useState("");
  const [composerPermissionPreset, setComposerPermissionPreset] =
    useState<DockPermissionPreset>("default");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<UploadItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DockServerRequest[]>([]);
  const [requestAnswers, setRequestAnswers] = useState<Record<string, Record<string, string>>>({});
  const [resolvingRequestIds, setResolvingRequestIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingThread, setRenamingThread] = useState(false);
  const [stageMode, setStageMode] = useState<"thread" | "terminal">("thread");
  const [archiveConfirmThreadId, setArchiveConfirmThreadId] = useState<
    string | null
  >(null);
  const [archivingThreadId, setArchivingThreadId] = useState<string | null>(null);
  const [threadNameDraft, setThreadNameDraft] = useState("");
  const [takeoverPromptOpen, setTakeoverPromptOpen] = useState(false);
  const [connectionNotice, setConnectionNotice] =
    useState<ConnectionNoticeState>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitScrollToken, setSubmitScrollToken] = useState(0);
  const [responsiveMode, setResponsiveMode] = useState<DockResponsiveMode>("desktop");
  const reconnectNoticeTimerRef = useRef<number | null>(null);
  const backgroundSyncInFlightRef = useRef(false);
  const inFlightThreadSyncRef = useRef<{
    threadId: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  const resolvedRequestIdsRef = useRef<Set<string>>(new Set());

  selectedThreadIdRef.current = selectedThreadId;

  useEffect(() => {
    setArchiveConfirmThreadId(null);
    setArchivingThreadId(null);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setStageMode("thread");
    }
  }, [selectedThreadId]);

  useLayoutEffect(() => {
    let resizeObserver: ResizeObserver | null = null;

    if (responsiveModeOverride) {
      return;
    }

    const updateResponsiveMode = (width: number) => {
      const nextMode = getDockResponsiveMode(width, responsiveStrategy);
      setResponsiveMode((current) => (current === nextMode ? current : nextMode));
    };

    if (responsiveStrategy === "container") {
      const element = rootRef.current;
      if (!element) {
        return;
      }

      updateResponsiveMode(element.clientWidth);
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        updateResponsiveMode(entry.contentRect.width);
      });
      resizeObserver.observe(element);

      return () => {
        resizeObserver?.disconnect();
      };
    }

    const handleViewportResize = () => {
      updateResponsiveMode(window.innerWidth);
    };

    handleViewportResize();
    window.addEventListener("resize", handleViewportResize, { passive: true });

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [responsiveModeOverride, responsiveStrategy]);

  const activeResponsiveMode = responsiveModeOverride ?? responsiveMode;

  useEffect(() => {
    if (activeResponsiveMode !== "mobile" && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [activeResponsiveMode, sidebarOpen]);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedModel =
    models.find((model) => model.model === composerModel) ?? models[0] ?? null;
  const effectiveComposerModel = composerModel || selectedModel?.model || "";
  const effectiveComposerReasoningEffort =
    composerReasoningEffort ||
    selectedModel?.defaultReasoningEffort ||
    selectedModel?.supportedReasoningEfforts[0]?.reasoningEffort ||
    "";

  async function fetchJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(buildApiUrl(resolvedApiBasePath, url), init);
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(
        localizeRuntimeMessage(
          data.error || `Request failed: ${response.status}`,
          t
        )
      );
    }
    return data;
  }

  function isAbortError(cause: unknown) {
    return cause instanceof Error && cause.name === "AbortError";
  }

  async function refreshThreads() {
    const params = new URLSearchParams();
    params.set(
      "archived",
      archiveFilter === "archived" ? "true" : "false"
    );

    const data = await fetchJson<{ data: DockThread[] }>(
      `/threads?${params.toString()}`
    );
    startTransition(() => {
      setThreads(data.data);
    });
  }

  const syncThread = useEffectEvent(
    async (
      threadId: string,
      options?: {
        background?: boolean;
        suppressErrors?: boolean;
      }
    ) => {
      const isBackground = options?.background ?? false;
      const suppressErrors = options?.suppressErrors ?? false;
      const fallbackThread =
        threads.find((thread) => thread.id === threadId) ??
        (selectedThread?.id === threadId ? selectedThread : null);
      const currentSync = inFlightThreadSyncRef.current;

      if (currentSync?.threadId === threadId) {
        if (!isBackground) {
          setLoadingThread(true);
        }
        try {
          await currentSync.promise;
        } finally {
          if (!isBackground && selectedThreadIdRef.current === threadId) {
            setLoadingThread(false);
          }
        }
        return;
      }

      if (currentSync) {
        currentSync.controller.abort();
        inFlightThreadSyncRef.current = null;
      }

      if (!isBackground) {
        setLoadingThread(true);
      }

      const controller = new AbortController();
      const requestPromise = (async () => {
        try {
          const data = await fetchJson<{ thread: DockThread }>(
            `/threads/${threadId}`,
            { signal: controller.signal }
          );
          if (selectedThreadIdRef.current !== threadId) {
            return;
          }
          setSelectedThread((current) =>
            mergeThreadPreservingRichTurns(current, data.thread)
          );
          setComposerCwd(data.thread.cwd);
          if (!suppressErrors) {
            setError(null);
          }
        } catch (cause) {
          if (controller.signal.aborted || isAbortError(cause)) {
            return;
          }

          const message =
            cause instanceof Error
              ? localizeRuntimeMessage(cause.message, t)
              : t("error.failedLoadThread");

          if (message.includes("not materialized yet") && fallbackThread) {
            if (selectedThreadIdRef.current !== threadId) {
              return;
            }
            setSelectedThread({
              ...fallbackThread,
              turns: fallbackThread.turns ?? []
            });
            setComposerCwd(fallbackThread.cwd);
            if (!suppressErrors) {
              setError(null);
            }
            return;
          }

          if (!suppressErrors) {
            if (selectedThreadIdRef.current !== threadId) {
              return;
            }
            setError(message);
          }
        } finally {
          if (inFlightThreadSyncRef.current?.controller === controller) {
            inFlightThreadSyncRef.current = null;
          }
        }
      })();

      inFlightThreadSyncRef.current = {
        threadId,
        controller,
        promise: requestPromise
      };

      try {
        await requestPromise;
      } finally {
        if (!isBackground && selectedThreadIdRef.current === threadId) {
          setLoadingThread(false);
        }
      }
    }
  );

  async function loadThread(threadId: string) {
    await syncThread(threadId);
  }

  const handleBridgeEvent = useEffectEvent((event: DockBridgeEvent) => {
    if (event.type === "connection") {
      setStatus((current) =>
        current
          ? {
              ...current,
              bridge: {
                ...current.bridge,
                connected: event.status === "connected"
              }
            }
          : current
      );

      setConnectionNotice(
        event.status === "connected"
          ? null
          : event.message
            ? {
                kind: "message",
                message: event.message
              }
            : {
                kind: "translation",
                key: "notice.bridgeDisconnected"
              }
      );
      return;
    }

    if (event.type === "server-request") {
      if (resolvedRequestIdsRef.current.has(event.request.requestId)) {
        return;
      }

      setResolvingRequestIds((current) =>
        current.filter((requestId) => requestId !== event.request.requestId)
      );
      setPendingRequests((current) => {
        const next = current.filter(
          (entry) => entry.requestId !== event.request.requestId
        );
        next.unshift(event.request);
        return next;
      });
      return;
    }

    if (event.type === "server-request-resolved") {
      resolvedRequestIdsRef.current.add(event.requestId);
      setResolvingRequestIds((current) =>
        current.filter((requestId) => requestId !== event.requestId)
      );
      setPendingRequests((current) =>
        current.filter((entry) => entry.requestId !== event.requestId)
      );
      return;
    }

    if (event.type !== "notification") return;

    if (
      event.method === "thread/started" ||
      event.method === "thread/name/updated" ||
      event.method === "thread/status/changed" ||
      event.method === "thread/archived" ||
      event.method === "thread/unarchived" ||
      event.method === "turn/completed"
    ) {
      void refreshThreads();
    }

    if (!selectedThreadId || event.threadId !== selectedThreadId || !selectedThread) {
      return;
    }

    if (event.method === "turn/started") {
      const params = event.params as { turn: DockTurn };
      setTakeoverPromptOpen(false);
      setSelectedThread((current) =>
        current ? upsertTurn(current, params.turn) : current
      );
      return;
    }

    if (event.method === "turn/plan/updated") {
      const params = event.params as {
        turnId: string;
        explanation: string | null;
        plan: Array<{ step: string; status: string }>;
      };
      setSelectedThread((current) =>
        current
          ? upsertTurnPlan(
              current,
              params.turnId,
              params.explanation ?? null,
              Array.isArray(params.plan) ? params.plan : []
            )
          : current
      );
      return;
    }

    if (event.method === "item/started" || event.method === "item/completed") {
      const params = event.params as { item: DockThreadItem; turnId: string };
      setSelectedThread((current) =>
        current
          ? replaceTurnItem(current, params.turnId, params.item)
          : current
      );
      return;
    }

    if (event.method === "item/agentMessage/delta") {
      const params = event.params as {
        turnId: string;
        itemId: string;
        delta: string;
      };
      setSelectedThread((current) =>
        current
          ? updateItem(current, params.turnId, params.itemId, (item) => ({
              type: "agentMessage",
              id: params.itemId,
              text:
                item && item.type === "agentMessage"
                  ? `${item.text}${params.delta}`
                  : params.delta,
              phase: item && item.type === "agentMessage" ? item.phase : null
            }))
          : current
      );
      return;
    }

    if (event.method === "item/plan/delta") {
      const params = event.params as {
        turnId: string;
        itemId: string;
        delta: string;
      };
      setSelectedThread((current) =>
        current
          ? updateItem(current, params.turnId, params.itemId, (item) => ({
              type: "plan",
              id: params.itemId,
              text:
                item && item.type === "plan"
                  ? `${item.text}${params.delta}`
                  : params.delta
            }))
          : current
      );
      return;
    }

    if (event.method === "item/reasoning/textDelta") {
      const params = event.params as {
        turnId: string;
        itemId: string;
        delta: string;
      };
      setSelectedThread((current) =>
        current
          ? updateItem(current, params.turnId, params.itemId, (item) => ({
              type: "reasoning",
              id: params.itemId,
              summary:
                item && item.type === "reasoning" ? item.summary : [],
              content:
                item && item.type === "reasoning"
                  ? [...(item as Extract<DockThreadItem, { type: "reasoning" }>).content, params.delta]
                  : [params.delta]
            }))
          : current
      );
      return;
    }

    if (event.method === "item/reasoning/summaryTextDelta") {
      const params = event.params as {
        turnId: string;
        itemId: string;
        delta: string;
      };
      setSelectedThread((current) =>
        current
          ? updateItem(current, params.turnId, params.itemId, (item) => {
              const reasoningItem =
                item && item.type === "reasoning"
                  ? (item as Extract<DockThreadItem, { type: "reasoning" }>)
                  : null;

              return {
                type: "reasoning",
                id: params.itemId,
                summary: reasoningItem
                  ? [...reasoningItem.summary, params.delta]
                  : [params.delta],
                content: reasoningItem ? reasoningItem.content : []
              };
            })
          : current
      );
      return;
    }

    if (event.method === "item/commandExecution/outputDelta") {
      const params = event.params as {
        turnId: string;
        itemId: string;
        delta: string;
      };
      setSelectedThread((current) =>
        current
          ? updateItem(current, params.turnId, params.itemId, (item) => ({
              type: "commandExecution",
              id: params.itemId,
              command:
                item && item.type === "commandExecution" ? item.command : "",
              cwd: item && item.type === "commandExecution" ? item.cwd : "",
              processId:
                item && item.type === "commandExecution" ? item.processId : null,
              status:
                item && item.type === "commandExecution"
                  ? item.status
                  : "running",
              commandActions:
                item && item.type === "commandExecution"
                  ? item.commandActions
                  : [],
              aggregatedOutput:
                item && item.type === "commandExecution"
                  ? `${item.aggregatedOutput || ""}${params.delta}`
                  : params.delta,
              exitCode:
                item && item.type === "commandExecution" ? item.exitCode : null,
              durationMs:
                item && item.type === "commandExecution"
                  ? item.durationMs
                  : null
            }))
          : current
      );
      return;
    }

    if (
      event.method === "turn/completed" ||
      event.method === "thread/status/changed" ||
      event.method === "thread/name/updated"
    ) {
      void syncThread(selectedThreadId, {
        background: true,
        suppressErrors: true
      });
    }
  });

  useEffect(() => {
    let cancelled = false;

    startTransition(() => {
      setPendingRequests([]);
    });

    void fetchJson<{ data: DockModel[] }>("/models")
      .then((result) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setModels(result.data);
          const defaultModel =
            result.data.find((model) => model.isDefault) ??
            result.data[0] ??
            null;
          setComposerModel(defaultModel?.model ?? "");
          setComposerReasoningEffort(defaultModel?.defaultReasoningEffort ?? "");
        });
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof Error
            ? localizeRuntimeMessage(cause.message, t)
            : t("error.initializationFailed")
        );
      });

    void fetchJson<StatusPayload>("/status")
      .then((result) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setStatus(result);
          setComposerCwd(result.defaults.cwd);
          setComposerPermissionPreset(
            getPermissionPresetFromSettings(
              result.defaults.approvalPolicy,
              result.defaults.sandbox
            )
          );
        });
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof Error
            ? localizeRuntimeMessage(cause.message, t)
            : t("error.initializationFailed")
        );
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    void refreshThreads().catch((cause) => {
      setError(
        cause instanceof Error
          ? localizeRuntimeMessage(cause.message, t)
          : t("error.refreshThreadsFailed")
      );
    });
  }, [archiveFilter, t]);

  useEffect(() => {
    if (!selectedThreadId) {
      inFlightThreadSyncRef.current?.controller.abort();
      inFlightThreadSyncRef.current = null;
      setSelectedThread(null);
      setRenamingThread(false);
      setThreadNameDraft("");
      setTakeoverPromptOpen(false);
      setLoadingThread(false);
      return;
    }
    const fallbackThread =
      threads.find((thread) => thread.id === selectedThreadId) ?? null;
    setSelectedThread(
      fallbackThread
        ? {
            ...fallbackThread,
            turns: fallbackThread.turns ?? []
          }
        : null
    );
    setComposerCwd(fallbackThread?.cwd ?? "");
    setError(null);
    void loadThread(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThread) {
      return;
    }

    setThreadNameDraft(getThreadLabel(selectedThread, t));
  }, [selectedThread, t]);

  useEffect(() => {
    const selectedSummary =
      selectedThreadId
        ? threads.find((thread) => thread.id === selectedThreadId) ?? null
        : null;

    if (!selectedSummary || !isSidebarArchivedThread(selectedSummary, archiveFilter)) {
      return;
    }

    handleNewThread(selectedSummary.cwd);
  }, [archiveFilter, selectedThreadId, threads]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl(resolvedApiBasePath, "/events"));
    const clearReconnectNoticeTimer = () => {
      if (reconnectNoticeTimerRef.current !== null) {
        window.clearTimeout(reconnectNoticeTimerRef.current);
        reconnectNoticeTimerRef.current = null;
      }
    };

    source.onopen = () => {
      clearReconnectNoticeTimer();
      setConnectionNotice(null);
      if (selectedThreadIdRef.current) {
        void syncThread(selectedThreadIdRef.current, {
          background: true,
          suppressErrors: true
        });
      }
    };

    source.onmessage = (message) => {
      clearReconnectNoticeTimer();
      setConnectionNotice(null);
      const data = JSON.parse(message.data) as DockBridgeEvent;
      handleBridgeEvent(data);
    };

    source.onerror = () => {
      if (reconnectNoticeTimerRef.current !== null) {
        return;
      }

      reconnectNoticeTimerRef.current = window.setTimeout(() => {
        setConnectionNotice({
          kind: "translation",
          key: "notice.liveReconnect"
        });
        reconnectNoticeTimerRef.current = null;
      }, 2500);
    };

    return () => {
      clearReconnectNoticeTimer();
      source.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      inFlightThreadSyncRef.current?.controller.abort();
      inFlightThreadSyncRef.current = null;
    };
  }, []);

  useEffect(() => {
    const activeTurn = getActiveTurn(selectedThread);

    if (!selectedThreadId || !activeTurn) {
      return;
    }

    const interval = window.setInterval(() => {
      if (backgroundSyncInFlightRef.current) {
        return;
      }

      backgroundSyncInFlightRef.current = true;
      void syncThread(selectedThreadId, {
        background: true,
        suppressErrors: true
      }).finally(() => {
        backgroundSyncInFlightRef.current = false;
      });
    }, 2500);

    return () => {
      window.clearInterval(interval);
    };
  }, [selectedThread, selectedThreadId, syncThread]);

  useEffect(() => {
    if (!selectedModel) {
      if (composerReasoningEffort) {
        setComposerReasoningEffort("");
      }
      return;
    }

    const supportedEfforts = selectedModel.supportedReasoningEfforts.map(
      (effort) => effort.reasoningEffort
    );

    if (
      composerReasoningEffort &&
      supportedEfforts.includes(composerReasoningEffort)
    ) {
      return;
    }

    setComposerReasoningEffort(
      selectedModel.defaultReasoningEffort || supportedEfforts[0] || ""
    );
  }, [composerReasoningEffort, selectedModel]);

  async function submitPrompt(options?: { takeoverConfirmed?: boolean }) {
    if (submitting || currentActiveTurn || (!prompt.trim() && !attachments.length)) {
      return;
    }

    if (
      selectedThreadId &&
      isThreadActive(selectedThread) &&
      !currentActiveTurn &&
      !options?.takeoverConfirmed
    ) {
      setTakeoverPromptOpen(true);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const permissionConfig = getPermissionPresetConfig(
        composerPermissionPreset
      );
      const payload = {
        prompt,
        cwd: composerCwd || status?.defaults.cwd || "",
        model: effectiveComposerModel || null,
        reasoningEffort: effectiveComposerReasoningEffort || null,
        approvalPolicy: permissionConfig.approvalPolicy,
        sandbox: permissionConfig.sandbox,
        attachmentPaths: attachments.map((attachment) => attachment.path)
      };

      if (selectedThreadId) {
        const attachmentPaths = attachments.map((attachment) => attachment.path);
        const data = await fetchJson<{ turn: DockTurn }>(
          `/threads/${selectedThreadId}/turns`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          }
        );

        setSelectedThread((current) =>
          current
            ? upsertTurn(
                current,
                seedTurnWithPrompt(data.turn, prompt, attachmentPaths)
              )
            : current
        );
      } else {
        const data = await fetchJson<{ thread: DockThread; turn: DockTurn }>(
          "/threads",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          }
        );

        if (data.thread?.id) {
          const nextThread: DockThread = {
            ...data.thread,
            preview: data.thread.preview || prompt.trim(),
            turns: data.turn
              ? [
                  seedTurnWithPrompt(
                    data.turn,
                    prompt,
                    attachments.map((attachment) => attachment.path)
                  )
                ]
              : data.thread.turns
          };

          setSelectedThreadId(data.thread.id);
          setSelectedThread(nextThread);
          setComposerCwd(nextThread.cwd);
        }
      }

      setTakeoverPromptOpen(false);
      setPrompt("");
      setSubmitScrollToken((current) => current + 1);
      setAttachments((current) => {
        for (const attachment of current) {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        }
        return [];
      });
      await refreshThreads();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? localizeRuntimeMessage(cause.message, t)
          : t("error.sendFailed")
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[] | null) {
    if (!fileList?.length) return;

    const files = [...fileList];
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const data = await fetchJson<{ uploads: UploadItem[] }>("/uploads", {
        method: "POST",
        body: formData
      });

      setAttachments((current) => [
        ...current,
        ...data.uploads.map((upload, index) => ({
          ...upload,
          url: resolveApiAssetUrl(resolvedApiBasePath, upload.url),
          previewUrl: files[index]
            ? URL.createObjectURL(files[index])
            : resolveApiAssetUrl(resolvedApiBasePath, upload.url)
        }))
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? localizeRuntimeMessage(cause.message, t)
          : t("error.uploadFailed")
      );
    }
  }

  async function resolveRequest(
    request: DockServerRequest,
    payload: Record<string, unknown>
  ) {
    setError(null);
    setResolvingRequestIds((current) =>
      current.includes(request.requestId)
        ? current
        : [...current, request.requestId]
    );

    try {
      await fetchJson(`/requests/${request.requestId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          payload,
          rpcId: request.rpcId,
          threadId: request.threadId ?? null,
          method: request.method
        })
      });

      resolvedRequestIdsRef.current.add(request.requestId);
      setPendingRequests((current) =>
        current.filter((entry) => entry.requestId !== request.requestId)
      );

      if (request.threadId) {
        void loadThread(request.threadId);
      } else {
        void refreshThreads();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? localizeRuntimeMessage(cause.message, t)
          : t("error.requestFailed")
      );
    } finally {
      setResolvingRequestIds((current) =>
        current.filter((requestId) => requestId !== request.requestId)
      );
    }
  }

  async function renameSelectedThread() {
    if (!selectedThreadId || !threadNameDraft.trim()) {
      return;
    }

    try {
      const data = await fetchJson<{ thread: DockThread }>(
        `/threads/${selectedThreadId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: threadNameDraft.trim()
          })
        }
      );

      setSelectedThread(data.thread);
      setRenamingThread(false);
      await refreshThreads();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? localizeRuntimeMessage(cause.message, t)
          : t("error.renameFailed")
      );
    }
  }

  function getArchiveTargetThread(threadId: string) {
    return (
      threads.find((thread) => thread.id === threadId) ??
      (selectedThread?.id === threadId ? selectedThread : null)
    );
  }

  async function toggleArchiveThread(threadId: string) {
    const targetThread = getArchiveTargetThread(threadId);

    if (!targetThread) {
      return;
    }

    const nextArchived = !getArchiveState(targetThread);
    setArchivingThreadId(threadId);
    setError(null);

    try {
      const data = await fetchJson<{ thread: DockThread }>(
        `/threads/${threadId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            archived: nextArchived
          })
        }
      );

      startTransition(() => {
        setThreads((current) =>
          updateThreadListWithArchiveState(current, data.thread, archiveFilter)
        );
      });
      setArchiveConfirmThreadId(null);

      if (
        selectedThreadId === threadId &&
        (nextArchived || !matchesArchiveFilter(data.thread, archiveFilter))
      ) {
        handleNewThread(data.thread.cwd);
      } else if (selectedThreadId === threadId) {
        setSelectedThread(data.thread);
      }

      void refreshThreads().catch((refreshCause) => {
        setError(
          refreshCause instanceof Error
            ? localizeRuntimeMessage(refreshCause.message, t)
            : t("error.refreshThreadsFailed")
        );
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? localizeRuntimeMessage(cause.message, t)
          : t("error.archiveFailed")
      );
    } finally {
      setArchivingThreadId((current) =>
        current === threadId ? null : current
      );
    }
  }

  function handleNewThread(nextCwd?: string) {
    setSelectedThreadId(null);
    setSelectedThread(null);
    setStageMode("thread");
    setSidebarOpen(false);
    setPrompt("");
    setTakeoverPromptOpen(false);
    setArchiveConfirmThreadId(null);
    setRenamingThread(false);
    setThreadNameDraft("");
    if (nextCwd) {
      setComposerCwd(nextCwd);
    }
  }

  function renderRequestCard(request: DockServerRequest) {
    const isResolving = resolvingRequestIds.includes(request.requestId);

    return (
      <div className="dock-request-card" key={request.requestId}>
        <div className="dock-request-head">
          <div className="dock-request-heading">
            <strong>{getRequestTitle(request.method, t)}</strong>
          </div>
        </div>

        {request.method === "item/commandExecution/requestApproval" ? (
          <>
            <div className="dock-request-command-shell">
              <pre className="dock-request-command">
                {getCommandApprovalText(request, t)}
              </pre>
            </div>
            <div className="dock-request-meta-row">
              <code>{getCommandApprovalCwd(request, selectedThread?.cwd || composerCwd)}</code>
            </div>
            <div className="dock-request-actions">
                <button
                  className="dock-request-action is-primary"
                  disabled={isResolving}
                  onClick={() =>
                    void resolveRequest(request, getSingleApprovePayload(request.method))
                  }
                  type="button"
                >
                  {isResolving ? t("request.processing") : t("actions.allowOnce")}
                </button>
                <button
                  className="dock-request-action"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getApprovePayload(request.method))}
                  type="button"
                >
                  {t("actions.allowForSession")}
                </button>
                <button
                  className="dock-request-action is-muted"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getDeclinePayload(request.method))}
                  type="button"
                >
                  {t("actions.deny")}
              </button>
            </div>
          </>
        ) : null}

        {request.method === "item/fileChange/requestApproval" ? (
          <>
            {(request.params as { reason?: string | null }).reason ? (
              <p className="dock-request-copy">
                {(request.params as { reason?: string | null }).reason}
              </p>
            ) : null}
            <div className="dock-request-actions">
                <button
                  className="dock-request-action is-primary"
                  disabled={isResolving}
                  onClick={() =>
                    void resolveRequest(request, getSingleApprovePayload(request.method))
                  }
                  type="button"
                >
                  {isResolving ? t("request.processing") : t("actions.allowOnce")}
                </button>
                <button
                  className="dock-request-action"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getApprovePayload(request.method))}
                  type="button"
                >
                  {t("actions.allowForSession")}
                </button>
                <button
                  className="dock-request-action is-muted"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getDeclinePayload(request.method))}
                  type="button"
                >
                  {t("actions.deny")}
              </button>
            </div>
          </>
        ) : null}

        {request.method === "execCommandApproval" ? (
          <>
            <div className="dock-request-command-shell">
              <pre className="dock-request-command">
                {request.params.command.join(" ")}
              </pre>
            </div>
            <div className="dock-request-meta-row">
              <code>{request.params.cwd || selectedThread?.cwd || composerCwd}</code>
            </div>
            <div className="dock-request-actions">
                <button
                  className="dock-request-action is-primary"
                  disabled={isResolving}
                  onClick={() =>
                    void resolveRequest(request, getSingleApprovePayload(request.method))
                  }
                  type="button"
                >
                  {isResolving ? t("request.processing") : t("actions.allowOnce")}
                </button>
                <button
                  className="dock-request-action"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getApprovePayload(request.method))}
                  type="button"
                >
                  {t("actions.allowForSession")}
                </button>
                <button
                  className="dock-request-action is-muted"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getDeclinePayload(request.method))}
                  type="button"
                >
                  {t("actions.deny")}
              </button>
            </div>
          </>
        ) : null}

        {request.method === "applyPatchApproval" ? (
          <>
            {request.params.reason ? (
              <p className="dock-request-copy">{request.params.reason}</p>
            ) : null}
            <pre>{Object.keys(request.params.fileChanges).join("\n")}</pre>
            <div className="dock-request-actions">
                <button
                  className="dock-request-action is-primary"
                  disabled={isResolving}
                  onClick={() =>
                    void resolveRequest(request, getSingleApprovePayload(request.method))
                  }
                  type="button"
                >
                  {isResolving ? t("request.processing") : t("actions.allowOnce")}
                </button>
                <button
                  className="dock-request-action"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getApprovePayload(request.method))}
                  type="button"
                >
                  {t("actions.allowForSession")}
                </button>
                <button
                  className="dock-request-action is-muted"
                  disabled={isResolving}
                  onClick={() => void resolveRequest(request, getDeclinePayload(request.method))}
                  type="button"
                >
                  {t("actions.deny")}
              </button>
            </div>
          </>
        ) : null}

        {request.method === "item/tool/requestUserInput" ? (
          <div className="dock-question-stack">
            {request.params.questions.map((question) => (
              <label className="dock-question" key={question.id}>
                <span>{question.question}</span>
                {question.options?.length ? (
                  <DockSelect
                    ariaLabel={question.header || question.question}
                    className="dock-sidebar-select"
                    onChange={(value) =>
                      setRequestAnswers((current) => ({
                        ...current,
                        [request.requestId]: {
                          ...current[request.requestId],
                          [question.id]: value
                        }
                      }))
                    }
                    options={[
                      { value: "", label: t("request.select"), disabled: true },
                      ...question.options.map(
                        (option): DockSelectOption => ({
                          value: option.label,
                          label: option.label,
                          description: option.description
                        })
                      )
                    ]}
                    placeholder={t("request.select")}
                    value={requestAnswers[request.requestId]?.[question.id] || ""}
                  />
                ) : (
                  <input
                    className="dock-sidebar-input"
                    onChange={(event) =>
                      setRequestAnswers((current) => ({
                        ...current,
                        [request.requestId]: {
                          ...current[request.requestId],
                          [question.id]: event.target.value
                        }
                      }))
                    }
                    type={question.isSecret ? "password" : "text"}
                    value={requestAnswers[request.requestId]?.[question.id] || ""}
                  />
                )}
              </label>
            ))}
              <button
                className="dock-ghost-action"
                disabled={isResolving}
                onClick={() =>
                  void resolveRequest(request, {
                    answers: Object.fromEntries(
                      request.params.questions.map((question) => [
                        question.id,
                      {
                        answers: [requestAnswers[request.requestId]?.[question.id] || ""]
                      }
                    ])
                  )
                })
              }
                type="button"
              >
                {isResolving ? t("request.processing") : t("actions.submitAnswers")}
              </button>
          </div>
        ) : null}
      </div>
    );
  }

  const visibleThreads = threads.filter((thread) => {
    if (projectFilter !== "all" && thread.cwd !== projectFilter) return false;
    if (!deferredSearch) return true;
    const text = `${getThreadLabel(thread, t)} ${thread.cwd} ${thread.preview}`.toLowerCase();
    return text.includes(deferredSearch);
  });

  const projects = [...new Set(threads.map((thread) => thread.cwd))];
  const currentActiveTurn = getActiveTurn(selectedThread);
  const currentRequests = pendingRequests.filter(
    (request) => !selectedThreadId || request.threadId === selectedThreadId
  );
  const workspaceLabel = getProjectName(
    selectedThread?.cwd || composerCwd || status?.defaults.cwd || t("generic.workspace")
  );
  const connectionNoticeText =
    connectionNotice?.kind === "translation"
      ? t(connectionNotice.key)
      : connectionNotice?.kind === "message"
        ? localizeRuntimeMessage(connectionNotice.message, t)
        : null;
  const groupedThreads = Object.entries(
    visibleThreads.reduce<Record<string, DockThread[]>>((accumulator, thread) => {
      const key = thread.cwd;
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(thread);
      return accumulator;
    }, {})
  )
    .map(([cwd, items]) => ({
      cwd,
      name: getProjectName(cwd),
      items: [...items].sort((left, right) => right.updatedAt - left.updatedAt),
      updatedAt: Math.max(...items.map((item) => item.updatedAt))
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);

    return (
      <div
        className="dock-app"
        data-dock-responsive-mode={activeResponsiveMode}
        data-dock-responsive-strategy={responsiveStrategy}
        data-dock-safe-area-top={viewportSafeAreaTop ? "self" : "none"}
        ref={rootRef}
      >
        <DockShellView
          apiBasePath={resolvedApiBasePath}
          archiveConfirmThreadId={archiveConfirmThreadId}
          archiveFilter={archiveFilter}
          archivingThreadId={archivingThreadId}
          attachments={attachments}
          composerCwd={composerCwd}
          composerModel={effectiveComposerModel}
          composerPermissionPreset={composerPermissionPreset}
          composerReasoningEffort={effectiveComposerReasoningEffort}
          connectionNotice={connectionNoticeText}
          currentActiveTurn={currentActiveTurn}
          currentRequests={currentRequests}
          error={error}
          groupedThreads={groupedThreads}
          loadingThread={loadingThread}
          models={models}
          onArchiveFilterChange={(value) => {
            setArchiveConfirmThreadId(null);
            setArchiveFilter(value);
          }}
          onArchiveCancel={() => setArchiveConfirmThreadId(null)}
          onArchiveConfirm={(threadId) => void toggleArchiveThread(threadId)}
          onComposerCwdChange={setComposerCwd}
          onComposerModelChange={setComposerModel}
          onComposerPermissionPresetChange={setComposerPermissionPreset}
          onComposerReasoningEffortChange={setComposerReasoningEffort}
          onInterruptCurrentTurn={() => {
            if (!currentActiveTurn || !selectedThreadId) return;
            void fetchJson(`/threads/${selectedThreadId}/interrupt`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                turnId: currentActiveTurn.id
              })
            }).catch((cause) =>
              setError(
                cause instanceof Error
                  ? localizeRuntimeMessage(cause.message, t)
                  : t("error.interruptFailed")
              )
            );
          }}
          onNewThread={handleNewThread}
          onOpenSidebar={() => setSidebarOpen(true)}
          onProjectFilterChange={setProjectFilter}
          onPromptChange={setPrompt}
          onRefreshThreads={() => void refreshThreads()}
          onRemoveAttachment={(attachmentId) =>
            setAttachments((current) => {
              const attachment = current.find((entry) => entry.id === attachmentId);
              const next = current.filter((entry) => entry.id !== attachmentId);
              if (attachment?.previewUrl) {
                URL.revokeObjectURL(attachment.previewUrl);
              }
              return next;
            })
          }
          onRenameCancel={() => {
            setRenamingThread(false);
            setThreadNameDraft(selectedThread ? getThreadLabel(selectedThread, t) : "");
          }}
          onRenameSave={() => void renameSelectedThread()}
          onResolveRequest={renderRequestCard}
          onSearchChange={setSearch}
          onSelectThread={(thread) => {
            if (isSidebarArchivedThread(thread, archiveFilter)) {
              return;
            }
            setArchiveConfirmThreadId(null);
            setRenamingThread(false);
            setStageMode("thread");
            setSelectedThreadId(thread.id);
            setSidebarOpen(false);
          }}
          onSidebarClose={() => setSidebarOpen(false)}
          onSubmitPrompt={() => void submitPrompt()}
          onTakeoverCancel={() => setTakeoverPromptOpen(false)}
          onTakeoverConfirm={() => void submitPrompt({ takeoverConfirmed: true })}
          onThreadNameDraftChange={setThreadNameDraft}
          onToggleArchive={(threadId) => {
            if (archivingThreadId) {
              return;
            }
            setRenamingThread(false);
            setArchiveConfirmThreadId((current) =>
              current === threadId ? null : threadId
            );
          }}
          onToggleRename={() => {
            setArchiveConfirmThreadId(null);
            setRenamingThread((current) => !current);
          }}
          onToggleStageMode={() =>
            setStageMode((current) =>
              current === "terminal" ? "thread" : "terminal"
            )
          }
          onUploadFiles={(files) => {
            void uploadFiles(files);
          }}
          projectFilter={projectFilter}
          projects={projects}
          prompt={prompt}
          renamingThread={renamingThread}
          renderThreadItem={(item) => (
            <ThreadItemView apiBasePath={resolvedApiBasePath} item={item} />
          )}
          search={search}
          selectedThread={selectedThread}
          selectedThreadId={selectedThreadId}
          stageMode={stageMode}
          responsiveMode={activeResponsiveMode}
          sidebarOpen={sidebarOpen}
          status={status}
          submitScrollToken={submitScrollToken}
          submitting={submitting}
          takeoverPromptOpen={takeoverPromptOpen}
          threadNameDraft={threadNameDraft}
          workspaceLabel={workspaceLabel}
        />
      </div>
    );
}
