import { NextResponse } from "next/server";

import { getCodexBridge } from "@/lib/codex/bridge";

export const runtime = "nodejs";

export async function GET() {
  try {
    const bridge = getCodexBridge();
    const data = await bridge.listModels();

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list models."
      },
      { status: 500 }
    );
  }
}
