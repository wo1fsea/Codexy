import { NextResponse } from "next/server";

import { getCodexBridge } from "@/lib/codex/bridge";
import type { ResolveRequestSubmission } from "@/lib/codex/types";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const { requestId } = await context.params;
    const body = (await request.json()) as ResolveRequestSubmission;

    const bridge = getCodexBridge();
    await bridge.resolveServerRequest(requestId, body.payload, {
      rpcId: body.rpcId,
      threadId: body.threadId,
      method: body.method
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to resolve request."
      },
      { status: 500 }
    );
  }
}
