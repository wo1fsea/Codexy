import { NextResponse } from "next/server";

import { getCodexBridge } from "@/lib/codex/bridge";
import {
  enrichThreadWithSessionHistory,
  readThreadFromSessionHistory
} from "@/lib/codex/session-history";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_: Request, context: Params) {
  try {
    const { threadId } = await context.params;
    const bridge = getCodexBridge();
    let thread;

    try {
      thread = await enrichThreadWithSessionHistory(await bridge.readThread(threadId));
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
    const bridge = getCodexBridge();

    if (typeof body.name === "string") {
      await bridge.renameThread(threadId, body.name);
    }

    if (typeof body.archived === "boolean") {
      if (body.archived) {
        await bridge.archiveThread(threadId);
      } else {
        await bridge.unarchiveThread(threadId);
      }
    }

    const thread = await enrichThreadWithSessionHistory(
      await bridge.readThread(threadId)
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
