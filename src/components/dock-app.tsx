"use client";

import clsx from "clsx";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
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
import { DockShellView } from "@/components/dock-shell-view";
import type {
  DockApprovalPolicy,
  DockBridgeEvent,
  DockModel,
  DockServerRequest,
  DockThread,
  DockThreadItem,
  DockTurn,
  DockUserInput
} from "@/lib/codex/types";
import { useI18n } from "@/lib/i18n/provider";
import type { TranslateFn } from "@/lib/i18n/messages";
import type { TailscaleSummary } from "@/lib/tailscale";

type StatusPayload = {
  bridge: {
    connected: boolean;
    pendingRequests: number;
  };
  tailscale: TailscaleSummary;
  defaults: {
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  };
};

type UploadItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  url: string;
  previewUrl?: string;
};

type ArchiveFilter = "live" | "archived" | "all";

type IconName =
  | "codex"
  | "new-thread"
  | "automation"
  | "skills"
  | "settings"
  | "folder"
  | "menu"
  | "search"
  | "play"
  | "refresh"
  | "rename"
  | "archive"
  | "image"
  | "send"
  | "stop"
  | "workspace"
  | "security"
  | "repo"
  | "desktop";

const APP_MENU_ITEMS = ["File", "Edit", "View", "Window", "Help"];

const SIDEBAR_ITEMS: Array<{
  key: string;
  label: string;
  icon: IconName;
  primary?: boolean;
}> = [
  { key: "new-thread", label: "New thread", icon: "new-thread", primary: true },
  { key: "automation", label: "Automation", icon: "automation" },
  { key: "skills", label: "Skills", icon: "skills" }
];

function AppIcon({
  name,
  className
}: {
  name: IconName;
  className?: string;
}) {
  if (name === "codex") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M8.2 4.2c1.2 0 2 .6 2.5 1.5.4-.5 1-.9 1.8-.9 1.6 0 2.8 1.3 2.8 2.9 0 .5-.1.9-.3 1.3 1.5.2 2.7 1.5 2.7 3.1 0 1.8-1.4 3.2-3.2 3.2-.3 0-.6 0-.9-.1-.1 1.7-1.5 3.1-3.2 3.1-1.1 0-2-.5-2.6-1.3-.6.6-1.4 1-2.3 1-1.8 0-3.2-1.4-3.2-3.2 0-.4.1-.8.2-1.1-1.4-.3-2.5-1.6-2.5-3.1 0-1.7 1.4-3.1 3.1-3.1.2 0 .3 0 .5.1C5.9 5.4 6.9 4.2 8.2 4.2Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  const props = {
    "aria-hidden": true,
    className,
    fill: "none",
    viewBox: "0 0 24 24"
  } as const;

  switch (name) {
    case "new-thread":
      return (
        <svg {...props}>
          <path
            d="M4.5 6.5h8m-8 5h15m-15 5h10M17 4.5v5m-2.5-2.5h5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "automation":
      return (
        <svg {...props}>
          <path
            d="M12 4.5v3m0 9v3m7.5-7.5h-3m-9 0h-3m10.8-5.3-2 2m-6.6 6.6-2 2m0-11.2 2 2m6.6 6.6 2 2M12 8.3a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "skills":
      return (
        <svg {...props}>
          <path
            d="M7 6.5h3.5v3.5H7zM13.5 6.5H17v3.5h-3.5zM7 13h3.5v3.5H7zM13.5 13H17v3.5h-3.5z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <path
            d="M12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Zm7 3.2-.9.4a6.8 6.8 0 0 1-.4 1l.5.9-1.7 1.7-.9-.5a6.8 6.8 0 0 1-1 .4l-.4.9h-2.4l-.4-.9a6.8 6.8 0 0 1-1-.4l-.9.5-1.7-1.7.5-.9a6.8 6.8 0 0 1-.4-1L5 12l.4-2.4.9-.4c.1-.4.2-.7.4-1l-.5-.9 1.7-1.7.9.5c.3-.2.7-.3 1-.4l.4-.9h2.4l.4.9c.4.1.7.2 1 .4l.9-.5 1.7 1.7-.5.9c.2.3.3.6.4 1l.9.4L19 12Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      );
    case "folder":
      return (
        <svg {...props}>
          <path
            d="M4.5 8.5a2 2 0 0 1 2-2h3l1.2 1.4H17.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-7.5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <path
            d="M5 7h14M5 12h14M5 17h14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <path
            d="M11 5.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm7.5 13.5-3.3-3.3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "play":
      return (
        <svg {...props}>
          <path
            d="m9 7 8 5-8 5V7Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "refresh":
      return (
        <svg {...props}>
          <path
            d="M18.5 9.2A7 7 0 0 0 6.8 7.1M5.5 4.8v3.5H9M5.5 14.8A7 7 0 0 0 17.2 17m1.3 2.2v-3.5H15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "rename":
      return (
        <svg {...props}>
          <path
            d="m5 16.5 8.8-8.8 2.5 2.5-8.8 8.8L5 19l.2-2.5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "archive":
      return (
        <svg {...props}>
          <path
            d="M5.5 6.5h13l-1 11a1.6 1.6 0 0 1-1.6 1.4H8.1a1.6 1.6 0 0 1-1.6-1.4l-1-11Zm-1-2h15m-8 6.2h1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "image":
      return (
        <svg {...props}>
          <path
            d="M6.5 6.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm2.5 3.2h.01M7 15l3-3 2.2 2.2 2.3-2.7L17 15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "send":
      return (
        <svg {...props}>
          <path
            d="m7 12 10-5-3 10-2.5-3L7 12Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "stop":
      return (
        <svg {...props}>
          <path
            d="M8 8h8v8H8z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "workspace":
      return (
        <svg {...props}>
          <path
            d="M4.5 6.5h15v9h-15zm5.5 12h4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "security":
      return (
        <svg {...props}>
          <path
            d="M8.2 10.4V8.8a3.8 3.8 0 1 1 7.6 0v1.6m-7 0h6.4a1.6 1.6 0 0 1 1.6 1.6v4a1.6 1.6 0 0 1-1.6 1.6H8.8A1.6 1.6 0 0 1 7.2 16v-4a1.6 1.6 0 0 1 1.6-1.6Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "repo":
      return (
        <svg {...props}>
          <path
            d="M7.5 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 9.5l6 5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "desktop":
      return (
        <svg {...props}>
          <path
            d="M4.5 6.5h15v9h-15zm5.5 12h4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    default:
      return null;
  }
}

function formatRelativeTime(unixSeconds: number) {
  const diff = Date.now() - unixSeconds * 1000;
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;

  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))}m ago`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))}h ago`;
  return `${Math.max(1, Math.round(diff / day))}d ago`;
}

function formatSidebarTime(unixSeconds: number) {
  const diff = Date.now() - unixSeconds * 1000;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (diff < day) {
    return new Date(unixSeconds * 1000).toLocaleTimeString("zh-CN", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return new Date(unixSeconds * 1000).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  });
}

function formatDateTime(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
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

function getThreadStatusText(thread: DockThread) {
  const base = thread.status.type;
  if (thread.status.type !== "active") {
    return base;
  }

  return thread.status.activeFlags.length
    ? `active · ${thread.status.activeFlags.join(", ")}`
    : "active";
}

function getApprovalPolicyLabel(policy: DockApprovalPolicy) {
  if (policy === "untrusted") return "Full access";
  if (policy === "on-failure") return "Ask on failure";
  if (policy === "never") return "Never ask";
  return "Default approval";
}

function isThreadActive(thread: DockThread | null) {
  return thread?.status.type === "active";
}

function getActiveTurn(thread: DockThread | null) {
  const turns = thread?.turns ?? [];
  return [...turns].reverse().find((turn: DockTurn) => turn.status === "inProgress") ?? null;
}

function upsertTurn(thread: DockThread, turn: DockTurn) {
  const turns = [...thread.turns];
  const index = turns.findIndex((entry) => entry.id === turn.id);

  if (index >= 0) {
    turns[index] = {
      ...turns[index],
      ...turn,
      items: turn.items.length ? turn.items : turns[index].items
    };
  } else {
    turns.push(turn);
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

    return currentAgentItem.text.length > incomingAgentItem.text.length
      ? {
          ...incomingAgentItem,
          text: currentAgentItem.text,
          phase: incomingAgentItem.phase ?? currentAgentItem.phase
        }
      : incomingAgentItem;
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

    return currentPlanItem.text.length > incomingPlanItem.text.length
      ? {
          ...incomingPlanItem,
          text: currentPlanItem.text
        }
      : incomingPlanItem;
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

    return currentSummaryLength + currentContentLength >
      incomingSummaryLength + incomingContentLength
      ? {
          ...incomingReasoningItem,
          summary: currentReasoningItem.summary,
          content: currentReasoningItem.content
        }
      : incomingReasoningItem;
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
      if (currentItem.type !== "userMessage") {
        mergedItems.push(currentItem);
      }
      continue;
    }

    if (!isNarrativeTurnItem(currentItem)) {
      mergedItems.push(currentItem);
    }
  }

  return mergedItems.length === incomingTurn.items.length
    ? incomingTurn
    : {
        ...incomingTurn,
        items: mergedItems
      };
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

function getUploadAssetUrl(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const marker = "/.codex-dock/uploads/";
  const markerIndex = normalized.lastIndexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const uploadId = normalized.slice(markerIndex + marker.length);
  if (!uploadId) {
    return null;
  }

  return `/api/uploads/${encodeURIComponent(uploadId)}`;
}

type UserAttachmentPreview = {
  key: string;
  src: string;
  label: string;
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

function getFileChangeRows(
  item: Extract<DockThreadItem, { type: "fileChange" }>,
  t: TranslateFn
) {
  if (!item.changes.length) {
    return [
      {
        key: `${item.id}-0`,
        action: t("status.fileEdited"),
        label: t("generic.file"),
        additions: null,
        deletions: null
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

    const diffCounts = countDiffLines(
      (typeof change.diff === "string" && change.diff) ||
        (typeof change.unifiedDiff === "string" && change.unifiedDiff) ||
        (typeof change.unified_diff === "string" && change.unified_diff) ||
        null
    );

    const additions =
      (typeof change.additions === "number" && change.additions) ||
      (typeof change.addedLines === "number" && change.addedLines) ||
      (typeof change.insertions === "number" && change.insertions) ||
      diffCounts.additions;

    const deletions =
      (typeof change.deletions === "number" && change.deletions) ||
      (typeof change.removals === "number" && change.removals) ||
      (typeof change.deletedLines === "number" && change.deletedLines) ||
      diffCounts.deletions;

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
      deletions
    };
  });
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
  t: TranslateFn
): UserAttachmentPreview | null {
  if (entry.type === "localImage") {
    const src = getUploadAssetUrl(entry.path);

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
      src: entry.url,
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

function UserMessageView({
  item
}: {
  item: Extract<DockThreadItem, { type: "userMessage" }>;
}) {
  const { t } = useI18n();
  const attachments = item.content
    .map((entry, index) =>
      getUserAttachmentPreview(entry, `${item.id}-attachment-${index}`, t)
    )
    .filter((entry): entry is UserAttachmentPreview => Boolean(entry));

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

  const [activeAttachment, setActiveAttachment] =
    useState<UserAttachmentPreview | null>(null);

  useEffect(() => {
    if (!activeAttachment) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveAttachment(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeAttachment]);

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
        <div
          aria-modal="true"
          className="dock-lightbox"
          onClick={() => setActiveAttachment(null)}
          role="dialog"
        >
          <div
            className="dock-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="dock-lightbox-close"
              onClick={() => setActiveAttachment(null)}
              type="button"
            >
              {t("actions.close")}
            </button>
            <img
              alt={activeAttachment.label}
              className="dock-lightbox-image"
              src={activeAttachment.src}
            />
            <div className="dock-lightbox-caption">{activeAttachment.label}</div>
          </div>
        </div>
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

function ThreadItemView({ item }: { item: DockThreadItem }) {
  const { t } = useI18n();

  if (item.type === "userMessage") {
    return (
      <UserMessageView
        item={item as Extract<DockThreadItem, { type: "userMessage" }>}
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
    const planItem = item as Extract<DockThreadItem, { type: "plan" }>;
    return (
      <div className="dock-artifact">
        <div className="dock-artifact-head">{t("generic.plan")}</div>
        <pre>{planItem.text}</pre>
      </div>
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
          <div className="dock-filechange-chip" key={change.key}>
            <span className="dock-filechange-text">
              {change.action} {change.label}
            </span>
            {typeof change.additions === "number" ? (
              <span className="dock-diff-count is-added">+{change.additions}</span>
            ) : null}
            {typeof change.deletions === "number" ? (
              <span className="dock-diff-count is-removed">-{change.deletions}</span>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dock-artifact">
      <div className="dock-artifact-head">{item.type}</div>
      <pre>{JSON.stringify(item, null, 2)}</pre>
    </div>
  );
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

  return method;
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

export function DockApp() {
  const { t } = useI18n();
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
  const [composerApprovalPolicy, setComposerApprovalPolicy] =
    useState<DockApprovalPolicy>("on-request");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<UploadItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DockServerRequest[]>([]);
  const [requestAnswers, setRequestAnswers] = useState<Record<string, Record<string, string>>>({});
  const [resolvingRequestIds, setResolvingRequestIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingThread, setRenamingThread] = useState(false);
  const [threadNameDraft, setThreadNameDraft] = useState("");
  const [takeoverPromptOpen, setTakeoverPromptOpen] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitScrollToken, setSubmitScrollToken] = useState(0);
  const reconnectNoticeTimerRef = useRef<number | null>(null);
  const backgroundSyncInFlightRef = useRef(false);
  const selectedThreadIdRef = useRef<string | null>(null);

  selectedThreadIdRef.current = selectedThreadId;

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedModel =
    models.find((model) => model.model === composerModel) ?? models[0] ?? null;

  async function fetchJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  }

  async function refreshThreads() {
    const params = new URLSearchParams();
    params.set(
      "archived",
      archiveFilter === "all" ? "all" : archiveFilter === "archived" ? "true" : "false"
    );

    const data = await fetchJson<{ data: DockThread[] }>(
      `/api/threads?${params.toString()}`
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

      if (!isBackground) {
        setLoadingThread(true);
      }

      try {
        const data = await fetchJson<{ thread: DockThread }>(
          `/api/threads/${threadId}`
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
        const message =
          cause instanceof Error ? cause.message : t("error.failedLoadThread");

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
        if (!isBackground) {
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
          : event.message || t("notice.bridgeDisconnected")
      );
      return;
    }

    if (event.type === "server-request") {
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
    void (async () => {
      const [threadResult, modelResult, statusResult] = await Promise.allSettled([
          fetchJson<{ data: DockThread[] }>("/api/threads"),
          fetchJson<{ data: DockModel[] }>("/api/models"),
          fetchJson<StatusPayload>("/api/status")
      ]);

      startTransition(() => {
        if (threadResult.status === "fulfilled") {
          setThreads(threadResult.value.data);
        }

        if (modelResult.status === "fulfilled") {
          setModels(modelResult.value.data);
          const defaultModel =
            modelResult.value.data.find((model) => model.isDefault) ??
            modelResult.value.data[0] ??
            null;
          setComposerModel(defaultModel?.model ?? "");
          setComposerReasoningEffort(defaultModel?.defaultReasoningEffort ?? "");
        }

        if (statusResult.status === "fulfilled") {
          setStatus(statusResult.value);
          setComposerCwd(statusResult.value.defaults.cwd);
          setComposerApprovalPolicy(
            statusResult.value.defaults.approvalPolicy as DockApprovalPolicy
          );
        }

        setPendingRequests([]);
      });

      const failures = [threadResult, modelResult, statusResult].filter(
        (result) => result.status === "rejected"
      ) as PromiseRejectedResult[];

      if (failures.length) {
        const firstFailure = failures[0]?.reason;
        setError(
          firstFailure instanceof Error
            ? firstFailure.message
            : t("error.initializationFailed")
        );
      }
    })();
  }, [t]);

  useEffect(() => {
    void refreshThreads().catch((cause) => {
      setError(
        cause instanceof Error ? cause.message : t("error.refreshThreadsFailed")
      );
    });
  }, [archiveFilter, t]);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      setRenamingThread(false);
      setThreadNameDraft("");
      setTakeoverPromptOpen(false);
      return;
    }
    void loadThread(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThread) {
      return;
    }

    setThreadNameDraft(getThreadLabel(selectedThread, t));
  }, [selectedThread, t]);

  useEffect(() => {
    const source = new EventSource("/api/events");
    const clearReconnectNoticeTimer = () => {
      if (reconnectNoticeTimerRef.current !== null) {
        window.clearTimeout(reconnectNoticeTimerRef.current);
        reconnectNoticeTimerRef.current = null;
      }
    };

    source.onopen = () => {
      clearReconnectNoticeTimer();
      setConnectionNotice(null);
      if (selectedThreadId) {
        void syncThread(selectedThreadId, {
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
        setConnectionNotice(t("notice.liveReconnect"));
        reconnectNoticeTimerRef.current = null;
      }, 2500);
    };

    return () => {
      clearReconnectNoticeTimer();
      source.close();
    };
  }, [handleBridgeEvent, selectedThreadId, syncThread, t]);

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
      const payload = {
        prompt,
        cwd: composerCwd || status?.defaults.cwd || "",
        model: composerModel || null,
        reasoningEffort: composerReasoningEffort || null,
        approvalPolicy: composerApprovalPolicy,
        attachmentPaths: attachments.map((attachment) => attachment.path)
      };

      if (selectedThreadId) {
        const attachmentPaths = attachments.map((attachment) => attachment.path);
        const data = await fetchJson<{ turn: DockTurn }>(
          `/api/threads/${selectedThreadId}/turns`,
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
          "/api/threads",
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
      setError(cause instanceof Error ? cause.message : t("error.sendFailed"));
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
      const data = await fetchJson<{ uploads: UploadItem[] }>("/api/uploads", {
        method: "POST",
        body: formData
      });

      setAttachments((current) => [
        ...current,
        ...data.uploads.map((upload, index) => ({
          ...upload,
          previewUrl: files[index] ? URL.createObjectURL(files[index]) : upload.url
        }))
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.uploadFailed"));
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
      await fetchJson(`/api/requests/${request.requestId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      setPendingRequests((current) =>
        current.filter((entry) => entry.requestId !== request.requestId)
      );

      if (request.threadId) {
        void loadThread(request.threadId);
      } else {
        void refreshThreads();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.requestFailed"));
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
        `/api/threads/${selectedThreadId}`,
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
      setError(cause instanceof Error ? cause.message : t("error.renameFailed"));
    }
  }

  async function toggleArchiveSelectedThread() {
    if (!selectedThreadId || !selectedThread) {
      return;
    }

    const nextArchived = !getArchiveState(selectedThread);

    try {
      const data = await fetchJson<{ thread: DockThread }>(
        `/api/threads/${selectedThreadId}`,
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

      setSelectedThread(data.thread);
      await refreshThreads();

      if (nextArchived && archiveFilter === "live") {
        setSelectedThreadId(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.archiveFailed"));
    }
  }

  function handleNewThread() {
    setSelectedThreadId(null);
    setSelectedThread(null);
    setSidebarOpen(false);
    setPrompt("");
    setTakeoverPromptOpen(false);
  }

  function renderRequestCard(request: DockServerRequest) {
    const isResolving = resolvingRequestIds.includes(request.requestId);

    return (
      <div className="dock-request-card" key={request.requestId}>
        <div className="dock-request-head">
          <div className="dock-request-heading">
            <strong>{getRequestTitle(request.method, t)}</strong>
            <span className="dock-request-subtitle">
              {t("request.confirmationRequired")}
            </span>
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
              <span className="dock-request-meta-label">
                {t("request.workingDirectory")}
              </span>
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
            <p className="dock-request-copy">
              {
                (request.params as { reason?: string | null }).reason ||
                  t("request.fileNeedsApproval")
              }
            </p>
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
              <span className="dock-request-meta-label">
                {t("request.workingDirectory")}
              </span>
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
            <p className="dock-request-copy">
              {request.params.reason || t("request.fileNeedsApproval")}
            </p>
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
    <DockShellView
      archiveFilter={archiveFilter}
      attachments={attachments}
      composerApprovalPolicy={composerApprovalPolicy}
      composerCwd={composerCwd}
      composerModel={composerModel}
      composerReasoningEffort={composerReasoningEffort}
      connectionNotice={connectionNotice}
      currentActiveTurn={currentActiveTurn}
      currentRequests={currentRequests}
      error={error}
      groupedThreads={groupedThreads}
      loadingThread={loadingThread}
      models={models}
      onArchiveFilterChange={setArchiveFilter}
      onComposerApprovalPolicyChange={setComposerApprovalPolicy}
      onComposerCwdChange={setComposerCwd}
      onComposerModelChange={setComposerModel}
      onComposerReasoningEffortChange={setComposerReasoningEffort}
      onInterruptCurrentTurn={() => {
        if (!currentActiveTurn || !selectedThreadId) return;
        void fetchJson(`/api/threads/${selectedThreadId}/interrupt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            turnId: currentActiveTurn.id
          })
        }).catch((cause) =>
          setError(cause instanceof Error ? cause.message : t("error.interruptFailed"))
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
      onSelectThread={(threadId) => {
        setSelectedThreadId(threadId);
        setSidebarOpen(false);
      }}
      onSidebarClose={() => setSidebarOpen(false)}
      onSubmitPrompt={() => void submitPrompt()}
      onTakeoverCancel={() => setTakeoverPromptOpen(false)}
      onTakeoverConfirm={() => void submitPrompt({ takeoverConfirmed: true })}
      onThreadNameDraftChange={setThreadNameDraft}
      onToggleArchive={() => void toggleArchiveSelectedThread()}
      onToggleRename={() => setRenamingThread((current) => !current)}
      onUploadFiles={(files) => {
        void uploadFiles(files);
      }}
      projectFilter={projectFilter}
      projects={projects}
      prompt={prompt}
      renamingThread={renamingThread}
      renderThreadItem={(item) => <ThreadItemView item={item} />}
      search={search}
      selectedThread={selectedThread}
      selectedThreadId={selectedThreadId}
      sidebarOpen={sidebarOpen}
      status={status}
      submitScrollToken={submitScrollToken}
      submitting={submitting}
      takeoverPromptOpen={takeoverPromptOpen}
      threadNameDraft={threadNameDraft}
      workspaceLabel={workspaceLabel}
    />
  );
}
