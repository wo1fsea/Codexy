import { NextResponse } from "next/server";

import { getCodexBridge } from "@/lib/codex/bridge";

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
      model?: string | null;
      reasoningEffort?: string | null;
      cwd?: string | null;
      approvalPolicy?: "untrusted" | "on-failure" | "on-request" | "never";
      sandbox?: "read-only" | "workspace-write" | "danger-full-access";
      attachmentPaths?: string[];
    };

    if (!body.prompt?.trim() && !body.attachmentPaths?.length) {
      return NextResponse.json(
        { error: "Prompt or image attachment is required." },
        { status: 400 }
      );
    }

    const bridge = getCodexBridge();
    const turn = await bridge.appendTurn({
      threadId,
      prompt: body.prompt ?? "",
      model: body.model ?? null,
      reasoningEffort: body.reasoningEffort ?? null,
      cwd: body.cwd ?? null,
      approvalPolicy: body.approvalPolicy ?? null,
      sandbox: body.sandbox ?? null,
      attachmentPaths: body.attachmentPaths ?? []
    });

    return NextResponse.json(turn);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to append turn."
      },
      { status: 500 }
    );
  }
}
