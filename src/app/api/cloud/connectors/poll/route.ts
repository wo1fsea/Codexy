import { NextResponse } from "next/server";
import { z } from "zod";

import { touchCloudNodeHeartbeat, validateCloudNodeConnector } from "@/lib/cloud-registry";
import { getCloudTunnelBroker } from "@/lib/cloud-tunnel";

export const runtime = "nodejs";

const pollSchema = z.object({
  nodeId: z.string().trim().min(1),
  connectorToken: z.string().trim().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = pollSchema.parse(await request.json());

    if (!validateCloudNodeConnector(payload.nodeId, payload.connectorToken)) {
      return NextResponse.json(
        {
          error: "Node connector is not authorized for this cloud deployment."
        },
        { status: 403 }
      );
    }

    touchCloudNodeHeartbeat(payload.nodeId);
    const nextRequest = await getCloudTunnelBroker().waitForNodeRequest(payload.nodeId);

    return NextResponse.json({
      request: nextRequest
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to poll the cloud connector queue.";
    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
