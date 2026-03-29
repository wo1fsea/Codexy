import { NextResponse } from "next/server";

import { getCodexBridge } from "@/lib/codex/bridge";
import {
  listThreadSummariesFromSessionHistory
} from "@/lib/codex/session-history";
import { syncSessionThreadsToBridge } from "@/lib/codex/thread-sync";
import type { DockThread, ThreadListResponse } from "@/lib/codex/types";

export const runtime = "nodejs";

const THREAD_LIST_TIMEOUT_MS = 1_500;
const THREAD_LIST_DEGRADED_TTL_MS = 30_000;

let degradedThreadListUntil = 0;

function getListInput(searchParams: URLSearchParams) {
  return {
    limit: searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : 200,
    cursor: searchParams.get("cursor"),
    searchTerm: searchParams.get("search"),
    cwd: searchParams.get("cwd")
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      promise.finally(() => clearTimeout(timer)).catch(() => {});
    })
  ]);
}

function mergeThreadLists(
  bridgeThreads: DockThread[],
  sessionThreads: DockThread[]
): DockThread[] {
  const merged = new Map<string, DockThread>();

  for (const thread of sessionThreads) {
    merged.set(thread.id, thread);
  }

  for (const thread of bridgeThreads) {
    merged.set(thread.id, thread);
  }

  return [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

async function listBridgeThreads(
  bridge: ReturnType<typeof getCodexBridge>,
  archived: string | null,
  searchParams: URLSearchParams
): Promise<ThreadListResponse> {
  const input = getListInput(searchParams);

  if (archived === "all") {
    const [live, archivedThreads] = await Promise.all([
      bridge.listThreads({
        ...input,
        archived: false
      }),
      bridge.listThreads({
        ...input,
        archived: true
      })
    ]);

    return {
      data: [...live.data, ...archivedThreads.data].sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
      nextCursor: live.nextCursor ?? archivedThreads.nextCursor
    };
  }

  return bridge.listThreads({
    ...input,
    archived: archived === "true"
  });
}

export async function GET(request: Request) {
  try {
    const bridge = getCodexBridge();
    const { searchParams } = new URL(request.url);
    const archived = searchParams.get("archived");
    const sessionFallback =
      archived === "true"
        ? []
        : await listThreadSummariesFromSessionHistory({
            ...getListInput(searchParams),
            archived: false
          });

    if (archived !== "true" && degradedThreadListUntil > Date.now()) {
      return NextResponse.json({
        data: sessionFallback,
        nextCursor: null
      });
    }

    try {
      const response = await withTimeout(
        listBridgeThreads(bridge, archived, searchParams),
        THREAD_LIST_TIMEOUT_MS,
        "thread/list"
      );

      degradedThreadListUntil = 0;

      if (archived !== "true" && sessionFallback.length) {
        void syncSessionThreadsToBridge({
          bridge,
          bridgeThreads: response.data,
          sessionThreads: sessionFallback
        });
      }

      return NextResponse.json({
        data:
          archived === "true"
            ? response.data
            : mergeThreadLists(response.data, sessionFallback),
        nextCursor: response.nextCursor
      });
    } catch (error) {
      if (archived !== "true") {
        degradedThreadListUntil = Date.now() + THREAD_LIST_DEGRADED_TTL_MS;

        return NextResponse.json({
          data: sessionFallback,
          nextCursor: null
        });
      }

      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list threads."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      cwd?: string | null;
      model?: string | null;
      reasoningEffort?: string | null;
      approvalPolicy?: "untrusted" | "on-failure" | "on-request" | "never";
      sandbox?: "read-only" | "workspace-write" | "danger-full-access";
      attachmentPaths?: string[];
    };

    if (!body.prompt?.trim() && !body.attachmentPaths?.length) {
      return NextResponse.json(
        { error: "Prompt or image attachment is required." },
        { status: 400 }
      );
    }

    const bridge = getCodexBridge();
    const result = await bridge.createThread({
      prompt: body.prompt ?? "",
      cwd: body.cwd ?? null,
      model: body.model ?? null,
      reasoningEffort: body.reasoningEffort ?? null,
      approvalPolicy: body.approvalPolicy ?? "on-request",
      sandbox: body.sandbox ?? "workspace-write",
      attachmentPaths: body.attachmentPaths ?? []
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create thread."
      },
      { status: 500 }
    );
  }
}
