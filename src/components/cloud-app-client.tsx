"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/dock-icons";
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
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCloudOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
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

  async function handleCopyLinkExample() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(linkExample);
      } else {
        const input = document.createElement("textarea");
        input.value = linkExample;
        input.setAttribute("readonly", "true");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.append(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }

      setCopyState("copied");
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
      }, 1600);
    } catch {}
  }

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
              <button
                aria-label={copyState === "copied" ? "Copied command" : "Copy command"}
                className={`cloud-code-copy${copyState === "copied" ? " is-copied" : ""}`}
                onClick={() => {
                  void handleCopyLinkExample();
                }}
                title={copyState === "copied" ? "Copied" : "Copy"}
                type="button"
              >
                <AppIcon
                  className="cloud-code-copy-icon"
                  name={copyState === "copied" ? "check" : "copy"}
                />
              </button>
            </pre>
          </div>
        </div>

        <div className="cloud-overview-card">
          <div className="cloud-overview-head">
            <span className="cloud-overview-label">Deployment</span>
            <CloudLogoutAction
              buttonClassName="cloud-overview-logout-button"
              popoverClassName="is-upward"
              returnTo="/auth/login"
              shellClassName="cloud-overview-logout-shell"
            />
          </div>
          <strong>{initialDeploymentName}</strong>
          <span className="cloud-overview-count">
            {nodes.length} linked node{nodes.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="cloud-panel">
        <div className="cloud-panel-head">
          <div className="cloud-panel-head-copy">
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
                  <div className="cloud-node-card-copy">
                    <strong>{node.displayName}</strong>
                    <p>{node.cloudUrl}</p>
                  </div>
                  <div className="cloud-node-card-controls">
                    <span
                      className={`cloud-node-status${node.status === "offline" ? " is-offline" : ""}`}
                    >
                      {node.status}
                    </span>
                    <Link
                      className="cloud-node-open"
                      href={`/nodes/${encodeURIComponent(node.nodeId)}`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
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
