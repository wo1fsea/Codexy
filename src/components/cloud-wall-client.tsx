"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { DockApp } from "@/components/dock-app";
import {
  DockSelect,
  type DockSelectOption
} from "@/components/dock-select";
import { CloudLogoutAction } from "@/components/cloud-logout-action";
import { AppIcon } from "@/components/dock-icons";
import type { CloudNodeRecord, CloudRegistrySnapshot } from "@/lib/cloud-registry";
import {
  getDockResponsiveMode,
  type DockResponsiveMode
} from "@/lib/dock-responsive";

const CLOUD_WALL_REFRESH_MS = 2_000;
const WALL_PANE_COUNT = 4;

function buildInitialPaneNodeIds(nodes: CloudNodeRecord[]) {
  return Array.from({ length: WALL_PANE_COUNT }, (_, index) => nodes[index]?.nodeId ?? "");
}

function CloudWallPane({
  index,
  node,
  nodeId,
  nodeOptions,
  onNodeChange
}: {
  index: number;
  node: CloudNodeRecord | null;
  nodeId: string;
  nodeOptions: DockSelectOption[];
  onNodeChange: (nextValue: string) => void;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const [paneMode, setPaneMode] = useState<DockResponsiveMode>("mobile");
  const paneNumber = index + 1;
  const isConnected = Boolean(node && node.status === "online");

  useLayoutEffect(() => {
    const element = paneRef.current;
    if (!element) {
      return;
    }

    const updatePaneMode = (width: number) => {
      const nextMode = getDockResponsiveMode(width, "container");
      setPaneMode((current) => (current === nextMode ? current : nextMode));
    };

    updatePaneMode(element.clientWidth);
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updatePaneMode(entry.contentRect.width);
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <section
      className={clsx(
        "cloud-wall-pane",
        nodeId && "has-node",
        node?.status === "offline" && "is-offline"
      )}
      data-cloud-wall-connected={isConnected ? "true" : "false"}
      data-cloud-wall-pane=""
      data-cloud-wall-pane-mode={paneMode}
      ref={paneRef}
    >
      <div className="cloud-wall-pane-head">
        <div className="cloud-wall-pane-copy">
          <span className="cloud-wall-pane-label">Pane {paneNumber}</span>
          <span
            className="cloud-wall-pane-name"
            title={node?.nodeId ?? (nodeId || "")}
          >
            {node?.displayName ?? (nodeId ? "Linked node unavailable" : "Choose a node")}
          </span>
        </div>

        <div className="cloud-wall-pane-controls">
          <DockSelect
            ariaLabel={`Wall pane ${paneNumber} node`}
            className="cloud-wall-pane-select"
            onChange={onNodeChange}
            options={nodeOptions}
            value={nodeId}
          />
          {node ? (
            <span
              className={`cloud-node-status${node.status === "offline" ? " is-offline" : ""}`}
            >
              {node.status}
            </span>
          ) : null}
        </div>
      </div>

      <div className="cloud-wall-pane-body">
        {!nodeId ? (
          <div className="cloud-wall-empty-pane">
            <strong>Select a linked node.</strong>
            <p>Each pane is independent, so you can duplicate a node to work on different threads.</p>
          </div>
        ) : !node ? (
          <div className="cloud-wall-empty-pane is-warning">
            <strong>Linked node unavailable.</strong>
            <p>This pane still points at a node id that is no longer in the cloud directory.</p>
          </div>
        ) : node.status === "offline" ? (
          <div className="cloud-wall-empty-pane is-warning">
            <strong>{node.displayName} is offline.</strong>
            <p>Start the node again to bring this pane back online.</p>
          </div>
        ) : (
          <DockApp
            apiBasePath={`/api/cloud/nodes/${encodeURIComponent(node.nodeId)}/proxy`}
            responsiveStrategy="container"
          />
        )}
      </div>
    </section>
  );
}

export function CloudWallClient({
  initialDeploymentName,
  initialNodes
}: {
  initialDeploymentName: CloudRegistrySnapshot["deploymentName"];
  initialNodes: CloudNodeRecord[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [paneNodeIds, setPaneNodeIds] = useState(() => buildInitialPaneNodeIds(initialNodes));

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
            `/auth/login?returnTo=${encodeURIComponent(window.location.pathname || "/wall")}`
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
    }, CLOUD_WALL_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.nodeId, node])),
    [nodes]
  );
  const nodeOptions = useMemo<DockSelectOption[]>(
    () => [
      {
        value: "",
        label: "No node"
      },
      ...nodes.map((node) => ({
        value: node.nodeId,
        label: node.displayName,
        description:
          node.status === "online" ? "Connected through the cloud proxy" : "Offline"
      }))
    ],
    [nodes]
  );

  return (
    <main className="cloud-wall-shell">
      <div className="cloud-wall-scroll">
        <header className="cloud-wall-header">
          <div className="cloud-wall-header-copy">
            <Link
              aria-label="Back to dashboard"
              className="dock-icon-button cloud-remote-icon-button"
              href="/"
              title="Back to dashboard"
            >
              <AppIcon className="cloud-remote-inline-icon" name="back" />
            </Link>
            <span className="cloud-eyebrow">Workspace wall</span>
            <span className="cloud-wall-header-name">{initialDeploymentName}</span>
          </div>

          <div className="cloud-wall-header-actions">
            <span className="cloud-wall-header-count">
              {nodes.length} linked node{nodes.length === 1 ? "" : "s"}
            </span>
            <CloudLogoutAction returnTo="/auth/login" />
          </div>
        </header>

        <div className="cloud-wall-grid">
          {paneNodeIds.map((nodeId, index) => {
            const node = nodeId ? nodeById.get(nodeId) ?? null : null;

            return (
              <CloudWallPane
                index={index}
                key={`pane-${index + 1}`}
                node={node}
                nodeId={nodeId}
                nodeOptions={nodeOptions}
                onNodeChange={(nextValue) => {
                  setPaneNodeIds((current) =>
                    current.map((value, nextIndex) =>
                      nextIndex === index ? nextValue : value
                    )
                  );
                }}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
