import { NextResponse } from "next/server";

import { getHostTerminalManager } from "@/lib/host-terminal";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    getHostTerminalManager().closeSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to close terminal session."
      },
      { status: 404 }
    );
  }
}
