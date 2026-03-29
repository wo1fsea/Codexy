import { NextResponse } from "next/server";

import { getCloudAuthStatus } from "@/lib/cloud-auth";
import { getCloudSessionFromCookies } from "@/lib/cloud-auth-http";
import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";

export const runtime = "nodejs";

export async function GET() {
  const auth = getCloudAuthStatus();
  const session = await getCloudSessionFromCookies();
  const snapshot = getCloudRegistrySnapshot();

  if (!session) {
    return NextResponse.json({
      runtimeMode: "cloud",
      deploymentName: snapshot.deploymentName,
      auth: {
        bound: auth.bound,
        authenticated: false,
        bindingId: auth.bindingId
      }
    });
  }

  return NextResponse.json({
    runtimeMode: "cloud",
    deploymentName: snapshot.deploymentName,
    nodeCount: snapshot.nodeCount,
    nodesPath: snapshot.nodesPath,
    auth: {
      bound: auth.bound,
      authenticated: true,
      bindingId: auth.bindingId
    }
  });
}
