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

export async function GET(_: Request, context: Params) {
  try {
    const { threadId } = await context.params;
    const runtime = getRuntimeAdapter();
    let thread;

    try {
      thread = await enrichThreadWithSessionHistory(await runtime.readThread(threadId));
    } catch (error) {
      const fallbackThread = await readThreadFromSessionHistory(threadId);
      if (!fallbackThread) {
        throw error;
      }

      thread = fallbackThread;
    }

    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read thread."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { threadId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      archived?: boolean;
    };
    const runtime = getRuntimeAdapter();

    if (typeof body.name === "string") {
      await runtime.renameThread(threadId, body.name);
    }

    if (typeof body.archived === "boolean") {
      if (body.archived) {
        await runtime.archiveThread(threadId);
      } else {
        await runtime.unarchiveThread(threadId);
      }
    }

    const thread = await enrichThreadWithSessionHistory(
      await runtime.readThread(threadId)
    );
    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update thread."
      },
      { status: 500 }
    );
  }
}
