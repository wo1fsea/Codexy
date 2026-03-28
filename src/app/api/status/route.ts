import { NextResponse } from "next/server";

import { dockEnv } from "@/lib/codex/env";
import { getCodexBridge } from "@/lib/codex/bridge";
import { getTailscaleSummary } from "@/lib/tailscale";

export const runtime = "nodejs";

export async function GET() {
  const bridge = getCodexBridge();
  const tailscale = await getTailscaleSummary();

  return NextResponse.json({
    bridge: bridge.getState(),
    tailscale,
    defaults: {
      cwd: dockEnv.defaultCwd,
      approvalPolicy: dockEnv.defaultApprovalPolicy,
      sandbox: dockEnv.defaultSandboxMode
    },
    bridgeUrl: bridge.getEndpointUrl()
  });
}
