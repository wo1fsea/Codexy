import { NextResponse } from "next/server";

import { dockEnv } from "@/lib/codex/env";
import { getCodexBridge } from "@/lib/codex/bridge";
import { getCloudLinkStatus } from "@/lib/cloud-link";
import { getTailscaleSummary } from "@/lib/tailscale";

export const runtime = "nodejs";

export async function GET() {
  const bridge = getCodexBridge();
  const tailscale = await getTailscaleSummary();
  const cloud = getCloudLinkStatus();

  return NextResponse.json({
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
