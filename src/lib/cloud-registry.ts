import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const HEARTBEAT_STALE_MS = 45_000;

type CloudNodeRegistryEntry = {
  nodeId: string;
  displayName: string;
  machineName: string;
  linkedAt: string;
  lastHeartbeatAt: string;
  cloudUrl: string;
  connectorToken: string;
};

export type CloudNodeRecord = {
  nodeId: string;
  displayName: string;
  machineName: string;
  status: "online" | "offline";
  linkedAt: string;
  lastHeartbeatAt: string;
  cloudUrl: string;
};

type CloudRegistryFile = {
  nodes: CloudNodeRegistryEntry[];
};

export type CloudRegistrySnapshot = {
  deploymentName: string;
  nodes: CloudNodeRecord[];
  nodeCount: number;
  nodesPath: string;
};

function getCodexyHomeDir() {
  return process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");
}

function getCloudDataDir() {
  return path.join(getCodexyHomeDir(), "cloud");
}

export function getCloudNodesPath() {
  return path.join(getCloudDataDir(), "nodes.json");
}

function isOnline(lastHeartbeatAt: string) {
  const heartbeatMs = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(heartbeatMs)) {
    return false;
  }

  return Date.now() - heartbeatMs <= HEARTBEAT_STALE_MS;
}

function toPublicNode(entry: CloudNodeRegistryEntry): CloudNodeRecord {
  return {
    nodeId: entry.nodeId,
    displayName: entry.displayName,
    machineName: entry.machineName,
    status: isOnline(entry.lastHeartbeatAt) ? "online" : "offline",
    linkedAt: entry.linkedAt,
    lastHeartbeatAt: entry.lastHeartbeatAt,
    cloudUrl: entry.cloudUrl
  };
}

function sortEntries(nodes: CloudNodeRegistryEntry[]) {
  return [...nodes].sort((left, right) =>
    right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt)
  );
}

function readRegistryFile(): CloudRegistryFile {
  const nodesPath = getCloudNodesPath();
  if (!existsSync(nodesPath)) {
    return {
      nodes: []
    };
  }

  const parsed = JSON.parse(readFileSync(nodesPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || !("nodes" in parsed)) {
    throw new Error(`Cloud node registry at ${nodesPath} must contain a nodes array.`);
  }

  const nodes = Array.isArray((parsed as { nodes?: unknown }).nodes)
    ? ((parsed as { nodes: CloudNodeRegistryEntry[] }).nodes ?? [])
    : [];

  return {
    nodes: sortEntries(nodes)
  };
}

function writeRegistryFile(registry: CloudRegistryFile) {
  const nodesPath = getCloudNodesPath();
  mkdirSync(path.dirname(nodesPath), { recursive: true });
  writeFileSync(
    nodesPath,
    `${JSON.stringify({ nodes: sortEntries(registry.nodes) }, null, 2)}\n`,
    "utf8"
  );
}

export function getCloudRegistrySnapshot(): CloudRegistrySnapshot {
  const registry = readRegistryFile();
  const nodes = registry.nodes.map(toPublicNode);

  return {
    deploymentName: os.hostname() || "codexy-cloud",
    nodes,
    nodeCount: nodes.length,
    nodesPath: getCloudNodesPath()
  };
}

export function getCloudNode(nodeId: string) {
  const entry = readRegistryFile().nodes.find((node) => node.nodeId === nodeId);
  return entry ? toPublicNode(entry) : null;
}

export function validateCloudNodeConnector(nodeId: string, connectorToken: string) {
  const entry = readRegistryFile().nodes.find((node) => node.nodeId === nodeId);
  if (!entry) {
    return false;
  }

  return entry.connectorToken === connectorToken;
}

export function registerCloudNode(input: {
  cloudUrl: string;
  linkedAt?: string | null;
  nodeId: string;
  nodeName: string;
  connectorToken: string;
}) {
  const registry = readRegistryFile();
  const linkedAt = input.linkedAt?.trim() || new Date().toISOString();
  const lastHeartbeatAt = new Date().toISOString();
  const nextRecord: CloudNodeRegistryEntry = {
    nodeId: input.nodeId,
    displayName: input.nodeName,
    machineName: input.nodeName,
    linkedAt,
    lastHeartbeatAt,
    cloudUrl: input.cloudUrl,
    connectorToken: input.connectorToken
  };
  const nextNodes = registry.nodes.filter((node) => node.nodeId !== input.nodeId);

  nextNodes.unshift(nextRecord);
  writeRegistryFile({
    nodes: nextNodes
  });

  return toPublicNode(nextRecord);
}

export function touchCloudNodeHeartbeat(nodeId: string) {
  const registry = readRegistryFile();
  const nextNodes = registry.nodes.map((node) =>
    node.nodeId === nodeId
      ? {
          ...node,
          lastHeartbeatAt: new Date().toISOString()
        }
      : node
  );

  writeRegistryFile({
    nodes: nextNodes
  });

  const nextNode = nextNodes.find((node) => node.nodeId === nodeId);
  return nextNode ? toPublicNode(nextNode) : null;
}

export function unlinkCloudNode(nodeId: string) {
  const registry = readRegistryFile();
  const nextNodes = registry.nodes.filter((node) => node.nodeId !== nodeId);
  writeRegistryFile({
    nodes: nextNodes
  });
}
