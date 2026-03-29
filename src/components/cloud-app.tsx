import Link from "next/link";

import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function CloudApp() {
  const snapshot = getCloudRegistrySnapshot();

  return (
    <main className="cloud-app-shell">
      <section className="cloud-hero">
        <div className="cloud-hero-copy">
          <span className="cloud-eyebrow">Self-hosted cloud mode</span>
          <h1>Codexy Cloud</h1>
          <p>
            This deployment is running from the same open-source Codexy app entrypoint.
            Link nodes with <code>codexy link &lt;cloud-url&gt;</code> and they will appear here.
          </p>
        </div>

        <div className="cloud-overview-card">
          <span className="cloud-overview-label">Deployment</span>
          <strong>{snapshot.deploymentName}</strong>
          <span>{snapshot.nodeCount} linked node{snapshot.nodeCount === 1 ? "" : "s"}</span>
        </div>
      </section>

      <section className="cloud-panel">
        <div className="cloud-panel-head">
          <div>
            <span className="cloud-eyebrow">Node directory</span>
            <h2>Linked nodes</h2>
          </div>
          <code>{snapshot.nodesPath}</code>
        </div>

        {snapshot.nodes.length ? (
          <div className="cloud-node-grid">
            {snapshot.nodes.map((node) => (
              <article className="cloud-node-card" key={node.nodeId}>
                <div className="cloud-node-card-head">
                  <strong>{node.displayName}</strong>
                  <span
                    className={`cloud-node-status${node.status === "offline" ? " is-offline" : ""}`}
                  >
                    {node.status}
                  </span>
                </div>
                <p>{node.cloudUrl}</p>
                <dl className="cloud-node-meta">
                  <div>
                    <dt>Node ID</dt>
                    <dd>{node.nodeId}</dd>
                  </div>
                  <div>
                    <dt>Linked</dt>
                    <dd>{formatTimestamp(node.linkedAt)}</dd>
                  </div>
                  <div>
                    <dt>Last heartbeat</dt>
                    <dd>{formatTimestamp(node.lastHeartbeatAt)}</dd>
                  </div>
                </dl>
                <div className="cloud-node-actions">
                  <Link className="cloud-node-open" href={`/nodes/${encodeURIComponent(node.nodeId)}`}>
                    Open
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="cloud-empty-state">
            <strong>No nodes linked yet.</strong>
            <p>
              Start a node with <code>codexy start</code>, then run{" "}
              <code>codexy link &lt;cloud-url&gt;</code> against this deployment.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
