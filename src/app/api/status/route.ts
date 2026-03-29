import { NextResponse } from "next/server";

import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";
import { dockEnv } from "@/lib/codex/env";
import { getCodexBridge } from "@/lib/codex/bridge";
import { getCloudLinkStatus } from "@/lib/cloud-link";
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

  const bridge = getCodexBridge();
  const tailscale = await getTailscaleSummary();
  const cloud = getCloudLinkStatus();

  return NextResponse.json({
    runtimeMode: "node",
    bridge: bridge.getState(),
    tailscale,
    cloud,
    defaults: {
      cwd: dockEnv.defaultCwd,
      approvalPolicy: dockEnv.defaultApprovalPolicy,
      sandbox: dockEnv.defaultSandboxMode
    },
    bridgeUrl: bridge.getEndpointUrl()
  });
}
