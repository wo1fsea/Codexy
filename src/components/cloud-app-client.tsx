"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";

import { CloudLogoutAction } from "@/components/cloud-logout-action";
import type { CloudNodeRecord, CloudRegistrySnapshot } from "@/lib/cloud-registry";

const CLOUD_DASHBOARD_REFRESH_MS = 2_000;

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

export function CloudAppClient({
  initialDeploymentName,
  initialNodes,
  nodesPath
}: {
  initialDeploymentName: CloudRegistrySnapshot["deploymentName"];
  initialNodes: CloudNodeRecord[];
  nodesPath: CloudRegistrySnapshot["nodesPath"];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [cloudOrigin, setCloudOrigin] = useState("<cloud-url>");

  useEffect(() => {
    setCloudOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshNodes() {
      try {
        const response = await fetch("/api/cloud/nodes", {
          cache: "no-store",
          credentials: "same-origin"
        });

        if (response.status === 401) {
          window.location.assign(
            `/auth/login?returnTo=${encodeURIComponent(window.location.pathname || "/")}`
          );
          return;
        }

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          nodes?: CloudNodeRecord[];
        };

        const nextNodes = Array.isArray(payload.nodes) ? payload.nodes : null;

        if (!active || !nextNodes) {
          return;
        }

        startTransition(() => {
          setNodes(nextNodes);
        });
      } catch {}
    }

    void refreshNodes();
    const timer = window.setInterval(() => {
      void refreshNodes();
    }, CLOUD_DASHBOARD_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const linkExample = `codexy link ${cloudOrigin} --code 123456`;

  return (
    <main className="cloud-app-shell">
      <section className="cloud-hero">
        <div className="cloud-hero-copy">
          <span className="cloud-eyebrow">Self-hosted cloud mode</span>
          <h1>Codexy Cloud</h1>
          <p>Run this on the node you want to connect.</p>
          <div className="cloud-code-fence">
            <span className="cloud-code-fence-label">bash</span>
            <pre className="cloud-code-fence-body">
              <code>{linkExample}</code>
            </pre>
          </div>
        </div>

        <div className="cloud-overview-card">
          <span className="cloud-overview-label">Deployment</span>
          <strong>{initialDeploymentName}</strong>
          <span className="cloud-overview-count">
            {nodes.length} linked node{nodes.length === 1 ? "" : "s"}
          </span>
          <div className="cloud-overview-actions">
            <CloudLogoutAction
              buttonClassName="cloud-overview-logout-button"
              popoverClassName="is-upward"
              returnTo="/auth/login"
              shellClassName="cloud-overview-logout-shell"
            />
          </div>
        </div>
      </section>

      <section className="cloud-panel">
        <div className="cloud-panel-head">
          <div>
            <span className="cloud-eyebrow">Node directory</span>
            <h2>Linked nodes</h2>
          </div>
          <div className="cloud-panel-head-actions">
            <Link className="cloud-panel-link" href="/wall">
              Open wall
            </Link>
            <code>{nodesPath}</code>
          </div>
        </div>

        {nodes.length ? (
          <div className="cloud-node-grid">
            {nodes.map((node) => (
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
