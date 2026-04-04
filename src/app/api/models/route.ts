import { NextResponse } from "next/server";

import { getRuntimeAdapter } from "@/lib/runtime/registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const runtime = getRuntimeAdapter();
    const data = await runtime.listModels();

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
