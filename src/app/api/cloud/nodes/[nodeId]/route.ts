import { NextResponse } from "next/server";

import { requireCloudApiSession } from "@/lib/cloud-auth-http";
import { unlinkCloudNode, validateCloudNodeConnector } from "@/lib/cloud-registry";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      nodeId: string;
    }>;
  }
) {
  const { nodeId } = await context.params;
  const decodedNodeId = decodeURIComponent(nodeId);
  const connectorToken = request.headers.get("x-codexy-connector-token")?.trim();

  if (connectorToken) {
    if (!validateCloudNodeConnector(decodedNodeId, connectorToken)) {
      return NextResponse.json(
        {
          error: "Node connector is not authorized for this cloud deployment."
        },
        { status: 403 }
      );
    }
  } else {
    const authError = await requireCloudApiSession();
    if (authError) {
      return authError;
    }
  }

  unlinkCloudNode(decodedNodeId);

  return NextResponse.json({
    ok: true
  });
}
