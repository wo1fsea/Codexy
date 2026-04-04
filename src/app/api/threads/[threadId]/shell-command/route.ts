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
      command?: string;
    };
    const command = body.command?.trim() ?? "";

    if (!command) {
      return NextResponse.json(
        { error: "Command is required." },
        { status: 400 }
      );
    }

    const runtime = getRuntimeAdapter();
    await runtime.runThreadShellCommand({
      threadId,
      command
    });

    return NextResponse.json({});
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run shell command."
      },
      { status: 500 }
    );
  }
}
