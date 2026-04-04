import type {
  DockBridgeEvent,
  DockPlanStep,
  DockPlanStepStatus,
  DockThread,
  DockThreadItem,
  DockTurn
} from "@/lib/codex/types";

function normalizePlanStepStatus(status: string): DockPlanStepStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "inProgress":
    case "in_progress":
      return "inProgress";
    default:
      return "pending";
  }
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
  const diff = turn.diff ?? previousTurn?.diff ?? null;

  return {
    ...turn,
    diff,
    startedAt,
    completedAt,
    durationMs
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

    if (incomingItem.type === "commandExecution") {
      const incomingCommandItem = incomingItem as Extract<
        DockThreadItem,
        { type: "commandExecution" }
      >;
      const currentCommandItem = currentItem as Extract<
        DockThreadItem,
        { type: "commandExecution" }
      >;

      return {
        ...incomingCommandItem,
        aggregatedOutput:
          incomingCommandItem.aggregatedOutput ??
          currentCommandItem.aggregatedOutput ??
          null
      };
    }

    if (incomingItem.type === "fileChange") {
      const incomingFileChangeItem = incomingItem as Extract<
        DockThreadItem,
        { type: "fileChange" }
      >;
      const currentFileChangeItem = currentItem as Extract<
        DockThreadItem,
        { type: "fileChange" }
      >;

      return {
        ...incomingFileChangeItem,
        aggregatedDiff:
          incomingFileChangeItem.aggregatedDiff ??
          currentFileChangeItem.aggregatedDiff ??
          null,
        aggregatedOutput:
          incomingFileChangeItem.aggregatedOutput ??
          currentFileChangeItem.aggregatedOutput ??
          null
      };
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

export function mergeThreadPreservingRichTurns(
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

export function upsertTurn(thread: DockThread, turn: DockTurn) {
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

export function upsertTurnPlan(
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

export function replaceTurnItem(
  thread: DockThread,
  turnId: string,
  nextItem: DockThreadItem
) {
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

export function updateItem(
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

export function updateTurn(
  thread: DockThread,
  turnId: string,
  update: (turn: DockTurn) => DockTurn
) {
  const turns = thread.turns.map((turn) =>
    turn.id === turnId ? withTurnTimingMetadata(update(turn), turn) : turn
  );

  return {
    ...thread,
    turns
  };
}

export function shouldRefreshThreadsForNotification(
  event: Extract<DockBridgeEvent, { type: "notification" }>
) {
  return (
    event.method === "thread/started" ||
    event.method === "thread/name/updated" ||
    event.method === "thread/status/changed" ||
    event.method === "thread/archived" ||
    event.method === "thread/unarchived" ||
    event.method === "turn/completed"
  );
}

export function shouldSyncSelectedThreadForNotification(
  event: Extract<DockBridgeEvent, { type: "notification" }>
) {
  return (
    event.method === "turn/completed" ||
    event.method === "thread/status/changed" ||
    event.method === "thread/name/updated"
  );
}

export function applyNotificationToThread(
  current: DockThread | null,
  event: Extract<DockBridgeEvent, { type: "notification" }>
) {
  if (!current) {
    return current;
  }

  if (event.threadId && current.id !== event.threadId) {
    return current;
  }

  if (event.method === "turn/started") {
    const params = event.params as { turn: DockTurn };
    return upsertTurn(current, params.turn);
  }

  if (event.method === "turn/plan/updated") {
    const params = event.params as {
      turnId: string;
      explanation: string | null;
      plan: Array<{ step: string; status: string }>;
    };
    return upsertTurnPlan(
      current,
      params.turnId,
      params.explanation ?? null,
      Array.isArray(params.plan) ? params.plan : []
    );
  }

  if (event.method === "item/started" || event.method === "item/completed") {
    const params = event.params as { item: DockThreadItem; turnId: string };
    return replaceTurnItem(current, params.turnId, params.item);
  }

  if (event.method === "item/agentMessage/delta") {
    const params = event.params as {
      turnId: string;
      itemId: string;
      delta: string;
    };
    return updateItem(current, params.turnId, params.itemId, (item) => ({
      type: "agentMessage",
      id: params.itemId,
      text:
        item && item.type === "agentMessage"
          ? `${item.text}${params.delta}`
          : params.delta,
      phase: item && item.type === "agentMessage" ? item.phase : null
    }));
  }

  if (event.method === "item/plan/delta") {
    const params = event.params as {
      turnId: string;
      itemId: string;
      delta: string;
    };
    return updateItem(current, params.turnId, params.itemId, (item) => ({
      type: "plan",
      id: params.itemId,
      text:
        item && item.type === "plan" ? `${item.text}${params.delta}` : params.delta
    }));
  }

  if (event.method === "item/reasoning/textDelta") {
    const params = event.params as {
      turnId: string;
      itemId: string;
      delta: string;
    };
    return updateItem(current, params.turnId, params.itemId, (item) => ({
      type: "reasoning",
      id: params.itemId,
      summary: item && item.type === "reasoning" ? item.summary : [],
      content:
        item && item.type === "reasoning"
          ? [
              ...(item as Extract<DockThreadItem, { type: "reasoning" }>).content,
              params.delta
            ]
          : [params.delta]
    }));
  }

  if (event.method === "item/reasoning/summaryTextDelta") {
    const params = event.params as {
      turnId: string;
      itemId: string;
      delta: string;
    };
    return updateItem(current, params.turnId, params.itemId, (item) => {
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
    });
  }

  if (event.method === "item/commandExecution/outputDelta") {
    const params = event.params as {
      turnId: string;
      itemId: string;
      delta: string;
    };
    return updateItem(current, params.turnId, params.itemId, (item) => ({
      type: "commandExecution",
      id: params.itemId,
      command: item && item.type === "commandExecution" ? item.command : "",
      cwd: item && item.type === "commandExecution" ? item.cwd : "",
      processId: item && item.type === "commandExecution" ? item.processId : null,
      status: item && item.type === "commandExecution" ? item.status : "running",
      commandActions:
        item && item.type === "commandExecution" ? item.commandActions : [],
      aggregatedOutput:
        item && item.type === "commandExecution"
          ? `${item.aggregatedOutput || ""}${params.delta}`
          : params.delta,
      exitCode: item && item.type === "commandExecution" ? item.exitCode : null,
      durationMs: item && item.type === "commandExecution" ? item.durationMs : null
    }));
  }

  if (event.method === "item/fileChange/outputDelta") {
    const params = event.params as {
      threadId?: string;
      turnId: string;
      itemId: string;
      delta: string;
    };
    if (params.threadId && current.id !== params.threadId) {
      return current;
    }

    return updateItem(current, params.turnId, params.itemId, (item) => ({
      type: "fileChange",
      id: params.itemId,
      changes: item && item.type === "fileChange" ? item.changes : [],
      status: item && item.type === "fileChange" ? item.status : "completed",
      aggregatedDiff:
        item && item.type === "fileChange" ? item.aggregatedDiff ?? null : null,
      aggregatedOutput:
        item && item.type === "fileChange"
          ? `${item.aggregatedOutput || ""}${params.delta}`
          : params.delta
    }));
  }

  if (event.method === "turn/diff/updated") {
    const params = event.params as {
      threadId?: string;
      turnId: string;
      diff: string;
    };
    if (params.threadId && current.id !== params.threadId) {
      return current;
    }

    return updateTurn(current, params.turnId, (turn) => ({
      ...turn,
      diff: params.diff
    }));
  }

  if (event.method === "error") {
    const params = event.params as {
      threadId?: string;
      turnId: string;
      error?: { message?: string } | null;
      willRetry?: boolean;
    };
    if (params.threadId && current.id !== params.threadId) {
      return current;
    }

    return updateTurn(current, params.turnId, (turn) => ({
      ...turn,
      status:
        params.willRetry || turn.status !== "inProgress" ? turn.status : "failed",
      error: params.error ?? turn.error
    }));
  }

  return current;
}
