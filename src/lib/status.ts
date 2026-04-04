import type { CloudLinkStatus } from "@/lib/cloud-link";
import type { RuntimeCapabilities } from "@/lib/runtime/types";
import type { TailscaleSummary } from "@/lib/tailscale";

export type StatusPayload = {
  bridge: {
    connected: boolean;
    pendingRequests: number;
  };
  capabilities: RuntimeCapabilities;
  tailscale: TailscaleSummary;
  cloud: CloudLinkStatus;
  defaults: {
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  };
  bridgeUrl: string;
};
