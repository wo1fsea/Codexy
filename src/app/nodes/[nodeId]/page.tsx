import Link from "next/link";
import { notFound } from "next/navigation";

import { DockApp } from "@/components/dock-app";
import { CloudLogoutAction } from "@/components/cloud-logout-action";
import { AppIcon } from "@/components/dock-icons";
import { requireCloudPageSession } from "@/lib/cloud-auth-http";
import { getCloudNode } from "@/lib/cloud-registry";
import { I18nProvider } from "@/lib/i18n/provider";

export const dynamic = "force-dynamic";

export default async function CloudNodeWorkspacePage({
  params
}: {
  params: Promise<{
    nodeId: string;
  }>;
}) {
  const { nodeId } = await params;
  await requireCloudPageSession(`/nodes/${encodeURIComponent(nodeId)}`);
  const node = getCloudNode(nodeId);

  if (!node) {
    notFound();
  }

  return (
    <main className="cloud-remote-shell">
      <header className="cloud-remote-header">
        <div className="cloud-remote-copy">
          <Link
            aria-label="Back to dashboard"
            className="dock-icon-button cloud-remote-icon-button"
            href="/"
            title="Back to dashboard"
          >
            <AppIcon className="cloud-remote-inline-icon" name="back" />
          </Link>
          <span className="cloud-eyebrow">Remote node workspace</span>
          <span className="cloud-remote-node-name" title={node.nodeId}>
            {node.displayName}
          </span>
        </div>
        <div className="cloud-remote-status">
          <span
            className={`cloud-node-status${node.status === "offline" ? " is-offline" : ""}`}
          >
            {node.status}
          </span>
          <CloudLogoutAction
            returnTo={`/auth/login?returnTo=${encodeURIComponent(`/nodes/${node.nodeId}`)}`}
          />
        </div>
      </header>

      <section className="cloud-remote-stage">
        <I18nProvider>
          <DockApp apiBasePath={`/api/cloud/nodes/${encodeURIComponent(node.nodeId)}/proxy`} />
        </I18nProvider>
      </section>
    </main>
  );
}
