import { NextResponse } from "next/server";
import { z } from "zod";

import { touchCloudNodeHeartbeat, validateCloudNodeConnector } from "@/lib/cloud-registry";
import { getCloudTunnelBroker } from "@/lib/cloud-tunnel";

export const runtime = "nodejs";

const responseSchema = z.object({
  nodeId: z.string().trim().min(1),
  connectorToken: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string(), z.string()).optional().nullable(),
  bodyBase64: z.string().optional().nullable(),
  stream: z.boolean().optional().nullable(),
  streamId: z.string().trim().optional().nullable()
});

export async function POST(request: Request) {
  try {
    const payload = responseSchema.parse(await request.json());

    if (!validateCloudNodeConnector(payload.nodeId, payload.connectorToken)) {
      return NextResponse.json(
        {
          error: "Node connector is not authorized for this cloud deployment."
        },
        { status: 403 }
      );
    }

    touchCloudNodeHeartbeat(payload.nodeId);
    const broker = getCloudTunnelBroker();

    if (payload.stream && payload.streamId) {
      broker.resolveStreamHead({
        requestId: payload.requestId,
        streamId: payload.streamId,
        status: payload.status,
        headers: payload.headers ?? {}
      });
    } else {
      broker.resolveBufferedResponse({
        requestId: payload.requestId,
        status: payload.status,
        headers: payload.headers ?? {},
        bodyBase64: payload.bodyBase64 ?? null
      });
    }

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit the connector response.";
    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
