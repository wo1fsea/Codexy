import { NextResponse } from "next/server";

import { unlinkCloudNode } from "@/lib/cloud-registry";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      nodeId: string;
    }>;
  }
) {
  const { nodeId } = await context.params;
  unlinkCloudNode(decodeURIComponent(nodeId));

  return NextResponse.json({
    ok: true
  });
}
