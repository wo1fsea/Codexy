import { NextResponse } from "next/server";

import { getHostTerminalManager } from "@/lib/host-terminal";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as {
      data?: string | null;
    };
    await getHostTerminalManager().runInput(sessionId, body.data ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send terminal input."
      },
      { status: 400 }
    );
  }
}
