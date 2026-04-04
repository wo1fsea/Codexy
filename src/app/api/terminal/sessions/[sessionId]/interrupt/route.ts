import { NextResponse } from "next/server";

import { getHostTerminalManager } from "@/lib/host-terminal";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const interrupted = getHostTerminalManager().interrupt(sessionId);
    return NextResponse.json({ ok: interrupted });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to interrupt terminal command."
      },
      { status: 400 }
    );
  }
}
