import { NextResponse } from "next/server";

import { getRuntimeAdapter } from "@/lib/runtime/registry";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  const { threadId } = await context.params;
  const body = (await request.json()) as {
    turnId?: string;
  };

  if (!body.turnId) {
    return NextResponse.json(
      { error: "turnId is required." },
      { status: 400 }
    );
  }

  const runtime = getRuntimeAdapter();
  await runtime.interruptTurn(threadId, body.turnId);

  return NextResponse.json({ ok: true });
}
