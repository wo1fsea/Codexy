import { NextResponse } from "next/server";

import { getHostTerminalManager } from "@/lib/host-terminal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cwd?: string | null;
    };
    const manager = getHostTerminalManager();
    const session = await manager.createSession(body.cwd ?? process.cwd());
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create terminal session."
      },
      { status: 400 }
    );
  }
}
