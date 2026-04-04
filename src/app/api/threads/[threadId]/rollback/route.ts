import { NextResponse } from "next/server";

import {
  enrichThreadWithSessionHistory,
  readThreadFromSessionHistory
} from "@/lib/codex/session-history";
import { getRuntimeAdapter } from "@/lib/runtime/registry";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const { threadId } = await context.params;
    const body = (await request.json()) as {
      numTurns?: number;
    };

    const numTurns = Number(body.numTurns);

    if (!Number.isInteger(numTurns) || numTurns < 1) {
      return NextResponse.json(
        { error: "numTurns must be at least 1." },
        { status: 400 }
      );
    }

    const runtime = getRuntimeAdapter();
    const result = await runtime.rollbackThread(threadId, numTurns);
    let thread;

    try {
      thread = await enrichThreadWithSessionHistory(result.thread);
    } catch {
      thread =
        (await readThreadFromSessionHistory(result.thread.id)) ?? result.thread;
    }

    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to rollback thread."
      },
      { status: 500 }
    );
  }
}
