import Link from "next/link";
import { notFound } from "next/navigation";

import { DockApp } from "@/components/dock-app";
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
  const node = getCloudNode(nodeId);

  if (!node) {
    notFound();
  }

  return (
    <main className="cloud-remote-shell">
      <header className="cloud-remote-header">
        <div className="cloud-remote-copy">
          <Link className="cloud-remote-back" href="/">
            Back to dashboard
          </Link>
          <span className="cloud-eyebrow">Remote node workspace</span>
          <h1>{node.displayName}</h1>
          <p>
            This workspace is proxied through the self-hosted cloud connector. The node
            does not need a directly reachable browser address.
          </p>
        </div>
        <div className="cloud-remote-status">
          <span
            className={`cloud-node-status${node.status === "offline" ? " is-offline" : ""}`}
          >
            {node.status}
          </span>
          <code>{node.nodeId}</code>
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
