import { NextResponse } from "next/server";

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

    await runtime.compactThread(threadId);

    return NextResponse.json({});
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to compact thread."
      },
      { status: 500 }
    );
  }
}
