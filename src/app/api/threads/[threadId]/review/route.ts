import { NextResponse } from "next/server";

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
      delivery?: "inline" | "detached" | null;
      target?:
        | { type: "uncommittedChanges" }
        | { type: "baseBranch"; branch: string }
        | { type: "commit"; sha: string; title?: string | null }
        | { type: "custom"; instructions: string };
    };

    const runtime = getRuntimeAdapter();
    const result = await runtime.startReview({
      threadId,
      delivery: body.delivery ?? "inline",
      target: body.target ?? { type: "uncommittedChanges" }
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to start review."
      },
      { status: 500 }
    );
  }
}
