import { NextResponse } from "next/server";

import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = getCloudRegistrySnapshot();

  return NextResponse.json({
    runtimeMode: "cloud",
    deploymentName: snapshot.deploymentName,
    nodeCount: snapshot.nodeCount,
    nodesPath: snapshot.nodesPath
  });
}
