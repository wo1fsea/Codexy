import { NextResponse } from "next/server";
import { z } from "zod";

import { touchCloudNodeHeartbeat, validateCloudNodeConnector } from "@/lib/cloud-registry";
import { getCloudTunnelBroker } from "@/lib/cloud-tunnel";

export const runtime = "nodejs";

const streamSchema = z.object({
  nodeId: z.string().trim().min(1),
  connectorToken: z.string().trim().min(1),
  streamId: z.string().trim().min(1),
  chunkBase64: z.string().optional().nullable(),
  done: z.boolean().optional().nullable(),
  error: z.string().optional().nullable()
});

export async function POST(request: Request) {
  try {
    const payload = streamSchema.parse(await request.json());

    if (!validateCloudNodeConnector(payload.nodeId, payload.connectorToken)) {
      return NextResponse.json(
        {
          error: "Node connector is not authorized for this cloud deployment."
        },
        { status: 403 }
      );
    }

    touchCloudNodeHeartbeat(payload.nodeId);
    getCloudTunnelBroker().appendStreamChunk({
      streamId: payload.streamId,
      chunkBase64: payload.chunkBase64 ?? null,
      done: payload.done ?? false,
      error: payload.error ?? null
    });

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to append the stream chunk.";
    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
