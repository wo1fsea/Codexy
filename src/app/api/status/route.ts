import { NextResponse } from "next/server";

import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";
import { dockEnv } from "@/lib/codex/env";
import { getCloudLinkStatus } from "@/lib/cloud-link";
import { getRuntimeAdapter } from "@/lib/runtime/registry";
import { isCloudMode } from "@/lib/runtime-mode";
import { getTailscaleSummary } from "@/lib/tailscale";

export const runtime = "nodejs";

export async function GET() {
  if (isCloudMode()) {
    const snapshot = getCloudRegistrySnapshot();

    return NextResponse.json({
      runtimeMode: "cloud",
      deploymentName: snapshot.deploymentName,
      nodeCount: snapshot.nodeCount,
      nodesPath: snapshot.nodesPath
    });
  }

  const runtime = getRuntimeAdapter();
  const tailscale = await getTailscaleSummary();
  const cloud = getCloudLinkStatus();

  return NextResponse.json({
    runtimeMode: "node",
    bridge: runtime.getState(),
    tailscale,
    cloud,
    defaults: {
      cwd: dockEnv.defaultCwd,
      approvalPolicy: dockEnv.defaultApprovalPolicy,
      sandbox: dockEnv.defaultSandboxMode
    },
    bridgeUrl: runtime.getEndpointUrl()
  });
}
