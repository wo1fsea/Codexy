import type { CloudLinkStatus } from "@/lib/cloud-link";
import type { TailscaleSummary } from "@/lib/tailscale";

export type StatusPayload = {
  bridge: {
    connected: boolean;
    pendingRequests: number;
  };
  tailscale: TailscaleSummary;
  cloud: CloudLinkStatus;
  defaults: {
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  };
  bridgeUrl: string;
};
