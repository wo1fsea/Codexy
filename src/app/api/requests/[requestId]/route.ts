import { NextResponse } from "next/server";

import { getRuntimeAdapter } from "@/lib/runtime/registry";
import type { ResolveRuntimeRequestSubmission } from "@/lib/runtime/types";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const { requestId } = await context.params;
    const body = (await request.json()) as ResolveRuntimeRequestSubmission;

    const runtime = getRuntimeAdapter();
    await runtime.resolveServerRequest(requestId, body.payload, {
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
