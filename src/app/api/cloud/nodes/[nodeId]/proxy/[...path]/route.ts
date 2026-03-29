import { NextResponse } from "next/server";

import { requireCloudApiSession } from "@/lib/cloud-auth-http";
import { getCloudNode } from "@/lib/cloud-registry";
import { getCloudTunnelBroker } from "@/lib/cloud-tunnel";

export const runtime = "nodejs";

const REQUEST_HEADER_ALLOWLIST = ["accept", "content-type", "cache-control"];
const RESPONSE_HEADER_ALLOWLIST = ["content-type", "cache-control"];

function pickHeaders(headers: Headers, allowlist: string[]) {
  const next: Record<string, string> = {};

  for (const name of allowlist) {
    const value = headers.get(name);
    if (value) {
      next[name] = value;
    }
  }

  return next;
}

async function proxyNodeRequest(
  request: Request,
  context: {
    params: Promise<{
      nodeId: string;
      path: string[];
    }>;
  }
) {
  const authError = await requireCloudApiSession();
  if (authError) {
    return authError;
  }

  const { nodeId, path } = await context.params;
  const node = getCloudNode(nodeId);
  if (!node) {
    return NextResponse.json(
      {
        error: "Linked node not found."
      },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const pathSuffix = path.length ? `/${path.join("/")}` : "";
  const bodyBase64 =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : Buffer.from(await request.arrayBuffer()).toString("base64");
  const broker = getCloudTunnelBroker();

  try {
    if (request.method === "GET" && path[0] === "events") {
      const result = await broker.requestStream({
        nodeId,
        method: request.method,
        path: `/api${pathSuffix}`,
        search: url.search,
        headers: pickHeaders(request.headers, REQUEST_HEADER_ALLOWLIST),
        bodyBase64
      });

      return new Response(
        result.kind === "buffered" ? Buffer.from(result.body) : result.stream,
        {
          status: result.status,
          headers: pickHeaders(
            new Headers(result.headers),
            RESPONSE_HEADER_ALLOWLIST
          )
        }
      );
    }

    const result = await broker.request({
      nodeId,
      method: request.method,
      path: `/api${pathSuffix}`,
      search: url.search,
      headers: pickHeaders(request.headers, REQUEST_HEADER_ALLOWLIST),
      bodyBase64
    });

    return new Response(Buffer.from(result.body), {
      status: result.status,
      headers: pickHeaders(new Headers(result.headers), RESPONSE_HEADER_ALLOWLIST)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : `Failed to proxy the linked node ${node.displayName}.`
      },
      { status: 504 }
    );
  }
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      nodeId: string;
      path: string[];
    }>;
  }
) {
  return await proxyNodeRequest(request, context);
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      nodeId: string;
      path: string[];
    }>;
  }
) {
  return await proxyNodeRequest(request, context);
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      nodeId: string;
      path: string[];
    }>;
  }
) {
  return await proxyNodeRequest(request, context);
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      nodeId: string;
      path: string[];
    }>;
  }
) {
  return await proxyNodeRequest(request, context);
}
