import type { DockThread } from "./types";

export const DEFAULT_SESSION_THREAD_SYNC_LIMIT = 5;

type ThreadSummary = Pick<DockThread, "id" | "updatedAt">;

type ThreadPrimer = {
  primeThread: (threadId: string) => Promise<void>;
};

export function getSessionThreadIdsToSync(
  bridgeThreads: ThreadSummary[],
  sessionThreads: ThreadSummary[],
  limit = DEFAULT_SESSION_THREAD_SYNC_LIMIT
) {
  if (limit <= 0) {
    return [];
  }

  const bridgeThreadIds = new Set(bridgeThreads.map((thread) => thread.id));

  return sessionThreads
    .filter((thread) => !bridgeThreadIds.has(thread.id))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map((thread) => thread.id);
}

export async function syncSessionThreadsToBridge(input: {
  bridge: ThreadPrimer;
  bridgeThreads: ThreadSummary[];
  sessionThreads: ThreadSummary[];
  limit?: number;
}) {
  const threadIds = getSessionThreadIdsToSync(
    input.bridgeThreads,
    input.sessionThreads,
    input.limit
  );

  if (!threadIds.length) {
    return;
  }

  await Promise.allSettled(
    threadIds.map((threadId) => input.bridge.primeThread(threadId))
  );
}
