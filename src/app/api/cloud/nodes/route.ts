import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getCloudRegistrySnapshot,
  registerCloudNode
} from "@/lib/cloud-registry";

export const runtime = "nodejs";

const registerNodeSchema = z.object({
  cloudUrl: z.string().trim().min(1),
  linkedAt: z.string().trim().optional().nullable(),
  connectorToken: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  nodeName: z.string().trim().min(1)
});

export async function GET() {
  const snapshot = getCloudRegistrySnapshot();

  return NextResponse.json({
    nodes: snapshot.nodes
  });
}

export async function POST(request: Request) {
  try {
    const payload = registerNodeSchema.parse(await request.json());
    const node = registerCloudNode(payload);

    return NextResponse.json({
      node
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register cloud node.";
    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
