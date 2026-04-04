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
      prompt?: string;
      expectedTurnId?: string;
      attachmentPaths?: string[];
    };

    if (!body.expectedTurnId?.trim()) {
      return NextResponse.json(
        { error: "turnId is required." },
        { status: 400 }
      );
    }

    if (!body.prompt?.trim() && !body.attachmentPaths?.length) {
      return NextResponse.json(
        { error: "Prompt or image attachment is required." },
        { status: 400 }
      );
    }

    const runtime = getRuntimeAdapter();
    const result = await runtime.steerTurn({
      threadId,
      expectedTurnId: body.expectedTurnId,
      prompt: body.prompt ?? "",
      attachmentPaths: body.attachmentPaths ?? []
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send update."
      },
      { status: 500 }
    );
  }
}
