"use client";

import clsx from "clsx";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { AppIcon, SIDEBAR_ITEMS } from "@/components/dock-icons";
import { DockSelect, type DockSelectOption } from "@/components/dock-select";
import type {
  DockModel,
  DockPermissionPreset,
  DockServerRequest,
  DockThread,
  DockThreadItem,
  DockTurn
} from "@/lib/codex/types";
import { useI18n } from "@/lib/i18n/provider";
import type { TranslateFn } from "@/lib/i18n/messages";
import type { StatusPayload } from "@/lib/status";

type ArchiveFilter = "live" | "archived" | "all";

type UploadItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  url: string;
  previewUrl?: string;
};

type ThreadGroup = {
  cwd: string;
  name: string;
  items: DockThread[];
  updatedAt: number;
};

const DEFAULT_SIDEBAR_WIDTH = 296;
const MIN_SIDEBAR_WIDTH = 248;
const MAX_SIDEBAR_WIDTH = 480;
const SIDEBAR_WIDTH_STORAGE_KEY = "codexy-sidebar-width";

type DockShellViewProps = {
  archiveConfirmOpen: boolean;
  archiveFilter: ArchiveFilter;
  archivingThread: boolean;
  attachments: UploadItem[];
  composerCwd: string;
  composerModel: string;
  composerPermissionPreset: DockPermissionPreset;
  composerReasoningEffort: string;
  connectionNotice: string | null;
  currentActiveTurn: DockTurn | null;
  currentRequests: DockServerRequest[];
  error: string | null;
  groupedThreads: ThreadGroup[];
  loadingThread: boolean;
  models: DockModel[];
  projectFilter: string;
  projects: string[];
  prompt: string;
  renamingThread: boolean;
  search: string;
  selectedThread: DockThread | null;
  selectedThreadId: string | null;
  sidebarOpen: boolean;
  status: StatusPayload | null;
  submitScrollToken: number;
  submitting: boolean;
  takeoverPromptOpen: boolean;
  threadNameDraft: string;
  workspaceLabel: string;
  onArchiveFilterChange: (value: ArchiveFilter) => void;
  onArchiveCancel: () => void;
  onArchiveConfirm: () => void;
  onComposerCwdChange: (value: string) => void;
  onComposerModelChange: (value: string) => void;
  onComposerPermissionPresetChange: (value: DockPermissionPreset) => void;
  onComposerReasoningEffortChange: (value: string) => void;
  onInterruptCurrentTurn: () => void;
  onNewThread: () => void;
  onOpenSidebar: () => void;
  onProjectFilterChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRefreshThreads: () => void;
  onRemoveAttachment: (id: string) => void;
  onRenameCancel: () => void;
  onRenameSave: () => void;
  onResolveRequest: (request: DockServerRequest) => ReactNode;
  onSearchChange: (value: string) => void;
  onSelectThread: (threadId: string) => void;
  onSidebarClose: () => void;
  onSubmitPrompt: () => void;
  onTakeoverCancel: () => void;
  onTakeoverConfirm: () => void;
  onThreadNameDraftChange: (value: string) => void;
  onToggleArchive: () => void;
  onToggleRename: () => void;
  onUploadFiles: (files: FileList | File[] | null) => void;
  renderThreadItem: (item: DockThreadItem) => ReactNode;
};

function getProjectName(cwd: string) {
  const parts = cwd.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || cwd;
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

function formatReasoningEffortLabel(value: string, t: TranslateFn) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "low") return t("reasoningEffort.low");
  if (normalized === "medium") return t("reasoningEffort.medium");
  if (normalized === "high") return t("reasoningEffort.high");
  if (normalized === "xhigh") return t("reasoningEffort.xhigh");

  return humanizeIdentifier(value);
}

function formatReasoningEffortDescription(
  value: string,
  fallback: string,
  t: TranslateFn
) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "low") return t("reasoningEffort.low.description");
  if (normalized === "medium") return t("reasoningEffort.medium.description");
  if (normalized === "high") return t("reasoningEffort.high.description");
  if (normalized === "xhigh") return t("reasoningEffort.xhigh.description");

  return fallback;
}

function getThreadLabel(thread: DockThread, t: TranslateFn) {
  return thread.name?.trim() || thread.preview?.trim() || t("thread.untitled");
}

function getActiveFlagLabel(value: string, t: TranslateFn) {
  if (value === "waitingOnApproval") {
    return t("status.waitingOnApproval");
  }

  return humanizeIdentifier(value);
}

function getThreadStatusText(thread: DockThread, t: TranslateFn) {
  let base: string = thread.status.type;

  if (thread.status.type === "notLoaded") {
    base = t("status.notLoaded");
  } else if (thread.status.type === "idle") {
    base = t("status.idle");
  } else if (thread.status.type === "systemError") {
    base = t("status.systemError");
  } else if (thread.status.type === "active") {
    base = t("status.active");
  }

  if (thread.status.type !== "active") {
    return base;
  }

  return thread.status.activeFlags.length
    ? `${t("status.active")} · ${thread.status.activeFlags
        .map((flag) => getActiveFlagLabel(flag, t))
        .join(", ")}`
    : t("status.active");
}

function getTurnStatusLabel(status: DockTurn["status"], t: TranslateFn) {
  if (status === "completed") return t("turn.status.completed");
  if (status === "interrupted") return t("turn.status.interrupted");
  if (status === "failed") return t("turn.status.failed");
  return t("turn.status.inProgress");
}

function hasMeaningfulTurnText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(trimmed);
}

function isRenderableTurnItem(item: DockThreadItem, turnStatus: DockTurn["status"]) {
  if (item.type === "reasoning") {
    return false;
  }

  if (item.type === "agentMessage") {
    const agentItem = item as Extract<DockThreadItem, { type: "agentMessage" }>;
    if (!agentItem.text.trim()) {
      return false;
    }

    return turnStatus !== "inProgress" || hasMeaningfulTurnText(agentItem.text);
  }

  if (item.type === "plan") {
    const planItem = item as Extract<DockThreadItem, { type: "plan" }>;
    if (!planItem.text.trim()) {
      return false;
    }

    return turnStatus !== "inProgress" || hasMeaningfulTurnText(planItem.text);
  }

  return true;
}

function shouldShowThinkingState(turn: DockTurn) {
  if (turn.status !== "inProgress") {
    return false;
  }

  return !turn.items.some((item) => {
    if (item.type === "userMessage" || item.type === "reasoning") {
      return false;
    }

    if (item.type === "agentMessage") {
      const agentItem = item as Extract<DockThreadItem, { type: "agentMessage" }>;
      return hasMeaningfulTurnText(agentItem.text);
    }

    if (item.type === "plan") {
      const planItem = item as Extract<DockThreadItem, { type: "plan" }>;
      return hasMeaningfulTurnText(planItem.text);
    }

    return true;
  });
}

function getRenderableTurnItems(turn: DockTurn) {
  return turn.items.filter((item) => isRenderableTurnItem(item, turn.status));
}

function getRenderableTranscriptItems(turn: DockTurn) {
  return getRenderableTurnItems(turn).filter((item) => item.type !== "plan");
}

function getLatestPlanItem(
  thread: DockThread | null
): Extract<DockThreadItem, { type: "plan" }> | null {
  if (!thread) {
    return null;
  }

  for (let turnIndex = thread.turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = thread.turns[turnIndex];
    const items = getRenderableTurnItems(turn);

    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (item.type === "plan") {
        return item as Extract<DockThreadItem, { type: "plan" }>;
      }
    }
  }

  return null;
}

export function DockShellView(props: DockShellViewProps) {
  const {
    formatRelativeTime,
    locale,
    localeOptions,
    setLocale,
    t
  } = useI18n();
  const selectedThreadArchived = props.selectedThread?.source === "archive";
  const archiveButtonLabel = props.archivingThread
    ? t("actions.archiving")
    : selectedThreadArchived
      ? t("actions.unarchive")
      : t("actions.archive");
  const archiveConfirmTitle = selectedThreadArchived
    ? t("archive.confirmUnarchiveTitle")
    : t("archive.confirmArchiveTitle");
  const archiveConfirmBody = selectedThreadArchived
    ? t("archive.confirmUnarchiveBody")
    : t("archive.confirmArchiveBody");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const stageScrollRef = useRef<HTMLElement | null>(null);
  const stageScrollBodyRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFollowRef = useRef(true);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior | null>(null);
  const hasDraft = props.prompt.trim().length > 0 || props.attachments.length > 0;
  const composerReady =
    props.composerCwd.trim().length > 0 && props.composerModel.trim().length > 0;
  const canSubmit = !props.submitting && hasDraft && composerReady;
  const primaryActionIsStop = Boolean(props.currentActiveTurn);
  const primaryActionLabel = primaryActionIsStop
    ? t("actions.stop")
    : t("actions.send");
  const latestPlanItem = getLatestPlanItem(props.selectedThread);
  const hasBottomPanels =
    props.connectionNotice ||
    props.takeoverPromptOpen ||
    props.currentRequests.length > 0 ||
    Boolean(props.error);
  const archiveFilterOptions: DockSelectOption[] = [
    { value: "live", label: t("filters.live") },
    { value: "archived", label: t("filters.archived") },
    { value: "all", label: t("filters.all") }
  ];
  const permissionPresetOptions: DockSelectOption[] = [
    { value: "default", label: t("permissions.default") },
    {
      value: "danger-full-access",
      label: t("permissions.danger-full-access")
    }
  ];
  const projectOptions: DockSelectOption[] = [
    { value: "all", label: t("filters.allProjects") },
    ...props.projects.map((project) => ({
      value: project,
      label: getProjectName(project)
    }))
  ];
  const modelOptions: DockSelectOption[] = props.models.map((model) => ({
    value: model.model,
    label: model.displayName
  }));
  const selectedModel =
    props.models.find((model) => model.model === props.composerModel) ??
    props.models[0] ??
    null;
  const reasoningEffortOptions: DockSelectOption[] =
    selectedModel?.supportedReasoningEfforts.map((effort) => ({
      value: effort.reasoningEffort,
      label: formatReasoningEffortLabel(effort.reasoningEffort, t),
      description: formatReasoningEffortDescription(
        effort.reasoningEffort,
        effort.description,
        t
      )
    })) ?? [];

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardItems = [...event.clipboardData.items];
    const pastedImages = clipboardItems
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (!pastedImages.length) {
      return;
    }

    event.preventDefault();
    props.onUploadFiles(pastedImages);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") {
      return;
    }

    const nativeEvent = event.nativeEvent;
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
      return;
    }

    if (event.altKey) {
      event.preventDefault();

      const textarea = event.currentTarget;
      const { selectionEnd, selectionStart, value } = textarea;
      const nextValue =
        value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
      const nextCaretPosition = selectionStart + 1;

      props.onPromptChange(nextValue);
      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
      });
      return;
    }

    if (!canSubmit) {
      return;
    }

    event.preventDefault();
    props.onSubmitPrompt();
  }

  useEffect(() => {
    const savedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!savedWidth) {
      return;
    }

    const parsed = Number(savedWidth);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setSidebarWidth(
      Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed))
    );
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next: Record<string, boolean> = {};

      for (const group of props.groupedThreads) {
        if (current[group.cwd]) {
          next[group.cwd] = true;
        }
      }

      return next;
    });
  }, [props.groupedThreads]);

  useEffect(() => {
    const selectedCwd = props.selectedThread?.cwd;

    if (!selectedCwd) {
      return;
    }

    setCollapsedGroups((current) => {
      if (!current[selectedCwd]) {
        return current;
      }

      return {
        ...current,
        [selectedCwd]: false
      };
    });
  }, [props.selectedThread]);

  useEffect(() => {
    let frameId: number | null = null;

    function getRemainingScrollDistance(element: HTMLElement) {
      return element.scrollHeight - element.clientHeight - element.scrollTop;
    }

    function isNearBottom(element: HTMLElement) {
      return getRemainingScrollDistance(element) <= 72;
    }

    function scrollTranscriptToBottom(behavior: ScrollBehavior) {
      const element = stageScrollRef.current;
      if (!element) {
        return;
      }

      element.scrollTo({
        top: element.scrollHeight,
        behavior
      });
      shouldAutoFollowRef.current = true;
    }

    function scheduleScrollButtonUpdate() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;

        if (pendingScrollBehaviorRef.current) {
          const behavior = pendingScrollBehaviorRef.current;
          pendingScrollBehaviorRef.current = null;
          scrollTranscriptToBottom(behavior);
        }

        updateScrollButton();
      });
    }

    function updateScrollButton() {
      const element = stageScrollRef.current;
      if (!element) {
        setShowScrollToBottom(false);
        return;
      }

      const nearBottom = isNearBottom(element);
      shouldAutoFollowRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom);
    }

    scheduleScrollButtonUpdate();

    const element = stageScrollRef.current;
    const body = stageScrollBodyRef.current;
    if (!element) {
      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    element.addEventListener("scroll", scheduleScrollButtonUpdate, { passive: true });
    window.addEventListener("resize", scheduleScrollButtonUpdate);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (shouldAutoFollowRef.current) {
              pendingScrollBehaviorRef.current = "auto";
            }
            scheduleScrollButtonUpdate();
          });
    resizeObserver?.observe(element);
    if (body) {
      resizeObserver?.observe(body);
    }

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            if (shouldAutoFollowRef.current) {
              pendingScrollBehaviorRef.current = "auto";
            }
            scheduleScrollButtonUpdate();
          });
    if (body) {
      mutationObserver?.observe(body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    return () => {
      element.removeEventListener("scroll", scheduleScrollButtonUpdate);
      window.removeEventListener("resize", scheduleScrollButtonUpdate);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [props.selectedThread, props.loadingThread, props.currentActiveTurn]);

  useEffect(() => {
    if (!props.selectedThreadId) {
      return;
    }

    pendingScrollBehaviorRef.current = "auto";
    const frameId = window.requestAnimationFrame(() => {
      const element = stageScrollRef.current;
      if (!element) {
        return;
      }

      element.scrollTo({
        top: element.scrollHeight,
        behavior: "auto"
      });
      shouldAutoFollowRef.current = true;
      setShowScrollToBottom(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [props.selectedThreadId]);

  useEffect(() => {
    if (!props.submitScrollToken) {
      return;
    }

    pendingScrollBehaviorRef.current = "smooth";
    const frameId = window.requestAnimationFrame(() => {
      const element = stageScrollRef.current;
      if (!element) {
        return;
      }

      element.scrollTo({
        top: element.scrollHeight,
        behavior: "smooth"
      });
      shouldAutoFollowRef.current = true;
      setShowScrollToBottom(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [props.submitScrollToken]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      const nextWidth = state.startWidth + (event.clientX - state.startX);
      setSidebarWidth(
        Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth))
      );
    }

    function handlePointerUp() {
      resizeStateRef.current = null;
      setIsResizingSidebar(false);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const shellStyle = {
    "--dock-sidebar-width": `${sidebarWidth}px`
  } as CSSProperties;

  return (
    <div className="dock-app">
      <div
        className={clsx("dock-mobile-backdrop", props.sidebarOpen && "is-visible")}
        onClick={props.onSidebarClose}
      />

      <div
        className={clsx("dock-shell", isResizingSidebar && "is-resizing")}
        style={shellStyle}
      >
        <div className={clsx("dock-left-stack", props.sidebarOpen && "is-open")}>
          <aside className="dock-nav-rail">
            <div className="dock-nav-head">
              <div className="dock-nav-wordmark">Codexy</div>
            </div>

            <div className="dock-nav-items">
              {SIDEBAR_ITEMS.filter((item) => item.key === "new-thread").map((item) => (
                <button
                  className={clsx(
                    "dock-nav-item",
                    item.primary && "is-primary",
                    item.key === "new-thread" &&
                      !props.selectedThreadId &&
                      "is-active"
                  )}
                  key={item.key}
                  onClick={() => {
                    if (item.key === "new-thread") {
                      props.onNewThread();
                    }
                  }}
                  type="button"
                >
                  <AppIcon className="dock-nav-item-icon" name={item.icon} />
                  <span>{t(item.labelKey)}</span>
                </button>
              ))}
            </div>
          </aside>

          <aside className="dock-thread-sidebar">
            <div className="dock-sidebar-header">
              <div>
                <strong>
                  {props.archiveFilter === "archived"
                    ? t("sidebar.archived")
                    : t("sidebar.threads")}
                </strong>
              </div>
              <div className="dock-sidebar-tools">
                <button
                  className="dock-icon-button"
                  onClick={props.onRefreshThreads}
                  type="button"
                >
                  <AppIcon className="dock-inline-icon" name="refresh" />
                </button>
                <button
                  className="dock-icon-button dock-mobile-only"
                  onClick={props.onSidebarClose}
                  type="button"
                >
                  <AppIcon className="dock-inline-icon" name="menu" />
                </button>
              </div>
            </div>

            <div className="dock-sidebar-body">
              <div className="dock-sidebar-filters">
                <label className="dock-search-field">
                  <AppIcon className="dock-inline-icon" name="search" />
                  <input
                    className="dock-sidebar-input dock-search-input"
                    onChange={(event) => props.onSearchChange(event.target.value)}
                    placeholder={t("sidebar.searchPlaceholder")}
                    value={props.search}
                  />
                </label>
                <div className="dock-sidebar-select-row">
                  <DockSelect
                    ariaLabel={t("aria.threadArchiveFilter")}
                    className="dock-sidebar-select"
                    onChange={(value) =>
                      props.onArchiveFilterChange(value as ArchiveFilter)
                    }
                    options={archiveFilterOptions}
                    value={props.archiveFilter}
                  />
                  <DockSelect
                    ariaLabel={t("aria.projectFilter")}
                    className="dock-sidebar-select"
                    onChange={props.onProjectFilterChange}
                    options={projectOptions}
                    value={props.projectFilter}
                  />
                </div>
              </div>

              <div className="dock-thread-sections">
                {props.groupedThreads.map((group) => (
                  <section className="dock-thread-group" key={group.cwd}>
                    <button
                      aria-expanded={!collapsedGroups[group.cwd]}
                      className={clsx(
                        "dock-project-row",
                        "dock-project-toggle",
                        collapsedGroups[group.cwd] && "is-collapsed"
                      )}
                      onClick={() =>
                        setCollapsedGroups((current) => ({
                          ...current,
                          [group.cwd]: !current[group.cwd]
                        }))
                      }
                      type="button"
                    >
                      <span className="dock-project-toggle-main">
                        <AppIcon className="dock-inline-icon" name="folder" />
                        <span>{group.name}</span>
                      </span>
                      <AppIcon className="dock-project-chevron" name="chevron" />
                    </button>
                    {!collapsedGroups[group.cwd] ? (
                      <div className="dock-thread-group-items">
                        {group.items.map((thread) => (
                          <button
                            className={clsx(
                              "dock-thread-row",
                              props.selectedThreadId === thread.id && "is-selected"
                            )}
                            key={thread.id}
                            onClick={() => props.onSelectThread(thread.id)}
                            type="button"
                          >
                            <div className="dock-thread-row-head">
                              <strong>{getThreadLabel(thread, t)}</strong>
                              <span>{formatRelativeTime(thread.updatedAt)}</span>
                            </div>
                            <div className="dock-thread-row-meta">
                              <span>{getThreadStatusText(thread, t)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}

                {!props.groupedThreads.length ? (
                  <div className="dock-empty-sidebar">{t("sidebar.noThreads")}</div>
                ) : null}
              </div>
            </div>
          </aside>

          <div
            aria-hidden="true"
            className="dock-sidebar-resize-handle"
            onPointerDown={(event) => {
              if (window.matchMedia("(max-width: 860px)").matches) {
                return;
              }

              resizeStateRef.current = {
                startX: event.clientX,
                startWidth: sidebarWidth
              };
              setIsResizingSidebar(true);
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
          />
        </div>

        <main className="dock-stage">
          <header className="dock-stage-header">
            <div className="dock-stage-heading">
              <button
                className="dock-icon-button dock-mobile-only"
                onClick={props.onOpenSidebar}
                type="button"
              >
                <AppIcon className="dock-inline-icon" name="menu" />
              </button>
              <div>
                <div className="dock-stage-title">
                  {props.selectedThread
                    ? getThreadLabel(props.selectedThread, t)
                    : t("thread.new")}
                </div>
                <p className="dock-stage-subtitle">
                  {props.selectedThread
                    ? props.selectedThread.cwd
                    : props.workspaceLabel}
                </p>
              </div>
            </div>

            <div className="dock-stage-toolbar">
              {props.selectedThread ? (
                <>
                  <button
                    className="dock-icon-button"
                    onClick={props.onToggleRename}
                    type="button"
                  >
                    <AppIcon className="dock-inline-icon" name="rename" />
                  </button>
                  <div
                    className={clsx(
                      "dock-toolbar-confirm-shell",
                      props.archiveConfirmOpen && "is-open"
                    )}
                  >
                    <button
                      className={clsx(
                        "dock-icon-button",
                        props.archiveConfirmOpen && "is-armed",
                        props.archivingThread && "is-busy"
                      )}
                      disabled={props.archivingThread}
                      onClick={props.onToggleArchive}
                      title={archiveButtonLabel}
                      type="button"
                    >
                      <AppIcon className="dock-inline-icon" name="archive" />
                    </button>
                    {props.archiveConfirmOpen ? (
                      <div className="dock-toolbar-confirm-popover">
                        <div className="dock-toolbar-confirm-copy">
                          <strong>{archiveConfirmTitle}</strong>
                          <span>{archiveConfirmBody}</span>
                        </div>
                        <div className="dock-toolbar-confirm-actions">
                          <button
                            className="dock-request-action is-primary"
                            disabled={props.archivingThread}
                            onClick={props.onArchiveConfirm}
                            type="button"
                          >
                            {archiveButtonLabel}
                          </button>
                          <button
                            className="dock-ghost-action is-muted"
                            disabled={props.archivingThread}
                            onClick={props.onArchiveCancel}
                            type="button"
                          >
                            {t("actions.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
              <button
                className="dock-icon-button"
                onClick={props.onRefreshThreads}
                type="button"
              >
                <AppIcon className="dock-inline-icon" name="refresh" />
              </button>
              <DockSelect
                ariaLabel={t("aria.language")}
                className="dock-stage-language-select"
                onChange={(value) => setLocale(value as typeof locale)}
                options={localeOptions}
                placement="bottom"
                value={locale}
              />
            </div>
          </header>

          {props.selectedThread && props.renamingThread ? (
            <section className="dock-rename-strip">
              <input
                className="dock-sidebar-input"
                onChange={(event) => props.onThreadNameDraftChange(event.target.value)}
                placeholder={t("stage.threadTitlePlaceholder")}
                value={props.threadNameDraft}
              />
              <div className="dock-request-actions">
                <button className="dock-ghost-action" onClick={props.onRenameSave} type="button">
                  {t("actions.saveTitle")}
                </button>
                <button
                  className="dock-ghost-action is-muted"
                  onClick={props.onRenameCancel}
                  type="button"
                >
                  {t("actions.cancel")}
                </button>
              </div>
            </section>
          ) : null}

          <section className="dock-stage-scroll" ref={stageScrollRef}>
            <div className="dock-stage-scroll-body" ref={stageScrollBodyRef}>
              {props.loadingThread ? (
                <div className="dock-empty-state">{t("stage.loadingThread")}</div>
              ) : null}

              {!props.selectedThread && !props.loadingThread ? (
                <div className="dock-hero">
                  <div className="dock-hero-wordmark">Codexy</div>
                  <strong>{t("stage.startBuilding")}</strong>
                  <div className="dock-hero-project">{props.workspaceLabel}</div>
                </div>
              ) : null}

              {props.selectedThread ? (
                <div className="dock-transcript">
                  {props.selectedThread.turns.map((turn) => {
                    const transcriptItems = getRenderableTranscriptItems(turn);
                    const showThinkingState = shouldShowThinkingState(turn);

                    if (!transcriptItems.length && !showThinkingState) {
                      return null;
                    }

                    return (
                      <section className="dock-turn" key={turn.id}>
                        <div className="dock-turn-head">
                          <span>{getTurnStatusLabel(turn.status, t)}</span>
                          <code>{turn.id.slice(0, 8)}</code>
                        </div>
                        <div className="dock-turn-items">
                          {transcriptItems.map((item) => (
                            <div
                              className={clsx(
                                "dock-turn-item",
                                item.type === "userMessage" && "is-user",
                                item.type === "agentMessage" && "is-agent",
                                item.type === "reasoning" && "is-reasoning"
                              )}
                              key={item.id}
                            >
                              {props.renderThreadItem(item)}
                            </div>
                          ))}
                        </div>
                        {showThinkingState ? (
                          <div
                            aria-live="polite"
                            className="dock-thinking-status"
                            role="status"
                          >
                            <span className="dock-thinking-label">{t("thinking.label")}</span>
                            <span
                              aria-hidden="true"
                              className="dock-thinking-ellipsis"
                            >
                              <span>.</span>
                              <span>.</span>
                              <span>.</span>
                            </span>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {showScrollToBottom ? (
              <div className="dock-stage-scroll-jump">
                <button
                  aria-label={t("aria.jumpToBottom")}
                  className="dock-scroll-bottom-button"
                  onClick={() => {
                    shouldAutoFollowRef.current = true;
                    setShowScrollToBottom(false);
                    stageScrollRef.current?.scrollTo({
                      top: stageScrollRef.current.scrollHeight,
                      behavior: "smooth"
                    });
                  }}
                  type="button"
                >
                  <AppIcon className="dock-scroll-bottom-icon" name="chevron" />
                </button>
              </div>
            ) : null}
          </section>

          <section className="dock-bottom-dock">
            <div className="dock-bottom-center">
              <div className="dock-composer-shell">
                {hasBottomPanels ? (
                  <div className="dock-bottom-panels">
                    {props.connectionNotice ? (
                      <div className="dock-alert-banner is-subtle">
                        {props.connectionNotice}
                      </div>
                    ) : null}

                    {props.takeoverPromptOpen ? (
                      <div className="dock-alert-banner">
                        <div>
                          <strong>{t("takeover.detectedTitle")}</strong>
                          <p>{t("takeover.detectedBody")}</p>
                        </div>
                        <div className="dock-request-actions">
                          <button className="dock-ghost-action" onClick={props.onTakeoverConfirm} type="button">
                            {t("actions.takeoverAndContinue")}
                          </button>
                          <button className="dock-ghost-action is-muted" onClick={props.onTakeoverCancel} type="button">
                            {t("actions.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {props.currentRequests.length ? (
                      <div className="dock-request-stack">
                        {props.currentRequests.map((request) => props.onResolveRequest(request))}
                      </div>
                    ) : null}

                    {props.error ? <div className="dock-error">{props.error}</div> : null}
                  </div>
                ) : null}

                {latestPlanItem ? (
                  <div
                    aria-live="polite"
                    className="dock-composer-plan-panel"
                  >
                    {props.renderThreadItem(latestPlanItem)}
                  </div>
                ) : null}

                <div className="dock-composer-panel">
                  {props.attachments.length ? (
                    <div className="dock-upload-strip">
                      {props.attachments.map((attachment) => (
                        <div className="dock-upload-chip" key={attachment.id}>
                          {attachment.previewUrl ? (
                            <img alt={attachment.name} src={attachment.previewUrl} />
                          ) : null}
                          <div>
                            <strong>{attachment.name}</strong>
                            <p>{Math.max(1, Math.round(attachment.size / 1024))} KB</p>
                          </div>
                          <button
                            className="dock-chip-remove"
                            onClick={() => props.onRemoveAttachment(attachment.id)}
                            type="button"
                          >
                            {t("actions.remove")}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <textarea
                    className="dock-composer-input"
                    onChange={(event) => props.onPromptChange(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={handleComposerPaste}
                    placeholder={t("composer.placeholder")}
                    rows={2}
                    value={props.prompt}
                  />

                  <div className="dock-composer-footer">
                    <div className="dock-composer-controls">
                      <label className="dock-composer-add-button" title={t("actions.uploadImage")}>
                        <AppIcon className="dock-inline-icon" name="plus" />
                        <input
                          accept="image/*"
                          hidden
                          multiple
                          onChange={(event) => {
                            props.onUploadFiles(event.target.files);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      <DockSelect
                        ariaLabel={t("aria.modelSelection")}
                        className="dock-composer-select"
                        onChange={props.onComposerModelChange}
                        options={modelOptions}
                        placement="top"
                        value={props.composerModel}
                      />
                      {reasoningEffortOptions.length ? (
                        <DockSelect
                          ariaLabel={t("aria.reasoningEffort")}
                          className="dock-composer-select dock-composer-effort-select"
                          onChange={props.onComposerReasoningEffortChange}
                          options={reasoningEffortOptions}
                          placement="top"
                          value={props.composerReasoningEffort}
                        />
                      ) : null}
                    </div>

                    <div className="dock-composer-actions">
                      <button
                        aria-label={primaryActionLabel}
                        className={clsx(
                          "dock-send-button",
                          primaryActionIsStop && "is-stop"
                        )}
                        disabled={primaryActionIsStop ? false : !canSubmit}
                        onClick={
                          primaryActionIsStop
                            ? props.onInterruptCurrentTurn
                            : props.onSubmitPrompt
                        }
                        title={primaryActionLabel}
                        type="button"
                      >
                        <AppIcon
                          className="dock-send-icon"
                          name={primaryActionIsStop ? "stop" : "send"}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dock-status-footer">
                <div className="dock-status-group">
                  <DockSelect
                    ariaLabel={t("aria.permissionPreset")}
                    className={clsx(
                      "dock-status-select-shell",
                      props.composerPermissionPreset === "danger-full-access" &&
                        "is-danger"
                    )}
                    onChange={(value) =>
                      props.onComposerPermissionPresetChange(
                        value as DockPermissionPreset
                      )
                    }
                    options={permissionPresetOptions}
                    placement="top"
                    prefix={<AppIcon className="dock-inline-icon" name="security" />}
                    value={props.composerPermissionPreset}
                  />
                </div>
                <div className="dock-status-group">
                  <span className="dock-status-pill dock-tailnet-pill">
                    {props.status?.tailscale.tailnetUrl ||
                      props.status?.tailscale.ips[0] ||
                      props.status?.tailscale.dnsName ||
                      t("status.tailnet")}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
