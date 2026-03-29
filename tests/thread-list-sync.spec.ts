import { expect, test } from "@playwright/test";

import {
  DEFAULT_SESSION_THREAD_SYNC_LIMIT,
  getSessionThreadIdsToSync,
  syncSessionThreadsToBridge
} from "../src/lib/codex/thread-sync";

function createThread(id: string, updatedAt: number) {
  return { id, updatedAt };
}

test("session thread sync only primes missing threads in recency order", async () => {
  const bridgeThreads = [
    createThread("bridge-current", 80),
    createThread("shared-thread", 70)
  ];
  const sessionThreads = [
    createThread("shared-thread", 95),
    createThread("session-newest", 90),
    createThread("session-middle", 60),
    createThread("session-oldest", 10)
  ];

  expect(getSessionThreadIdsToSync(bridgeThreads, sessionThreads, 2)).toEqual([
    "session-newest",
    "session-middle"
  ]);
});

test("session thread sync tolerates primer failures", async () => {
  const calls: string[] = [];

  await expect(
    syncSessionThreadsToBridge({
      bridge: {
        async primeThread(threadId: string) {
          calls.push(threadId);
          if (threadId === "session-fail") {
            throw new Error("resume failed");
          }
        }
      },
      bridgeThreads: [createThread("already-listed", 100)],
      sessionThreads: [
        createThread("session-fail", 95),
        createThread("already-listed", 90),
        createThread("session-ok", 85)
      ],
      limit: DEFAULT_SESSION_THREAD_SYNC_LIMIT
    })
  ).resolves.toBeUndefined();

  expect(calls).toEqual(["session-fail", "session-ok"]);
});
