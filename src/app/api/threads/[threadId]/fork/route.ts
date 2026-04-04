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

export async function POST(_: Request, context: Params) {
  try {
    const { threadId } = await context.params;
    const runtime = getRuntimeAdapter();
    const result = await runtime.forkThread({
      threadId
    });
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
        error: error instanceof Error ? error.message : "Failed to fork thread."
      },
      { status: 500 }
    );
  }
}
