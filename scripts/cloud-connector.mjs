#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { getCloudLinkState } from "./cloud-link.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const runtimeKey = createHash("sha1").update(repoRoot).digest("hex").slice(0, 12);
const codexyHome = process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");
const nodeMetadataPath = path.join(codexyHome, "state", runtimeKey, "node", "service.json");

let stopped = false;

function readNodeMetadata() {
  if (!existsSync(nodeMetadataPath)) {
    throw new Error(`Node service metadata is missing at ${nodeMetadataPath}.`);
  }

  return JSON.parse(readFileSync(nodeMetadataPath, "utf8"));
}

function getLocalNodeUrl() {
  const metadata = readNodeMetadata();
  const port = Number(metadata?.port);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Node service metadata does not include a valid port.");
  }

  return `http://127.0.0.1:${port}`;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Cloud request failed with status ${response.status}.`);
  }
}

async function postBufferedResponse(cloudUrl, cloud, requestId, response) {
  const body = Buffer.from(await response.arrayBuffer()).toString("base64");

  await postJson(`${cloudUrl}/api/cloud/connectors/responses`, {
    nodeId: cloud.nodeId,
    connectorToken: cloud.connectorToken,
    requestId,
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/octet-stream",
      "cache-control": response.headers.get("cache-control") || "no-store"
    },
    bodyBase64: body
  });
}

async function postErrorResponse(cloudUrl, cloud, requestId, message, status = 502) {
  await postJson(`${cloudUrl}/api/cloud/connectors/responses`, {
    nodeId: cloud.nodeId,
    connectorToken: cloud.connectorToken,
    requestId,
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    },
    bodyBase64: Buffer.from(message, "utf8").toString("base64")
  });
}

async function postStreamResponse(cloudUrl, cloud, request, response) {
  await postJson(`${cloudUrl}/api/cloud/connectors/responses`, {
    nodeId: cloud.nodeId,
    connectorToken: cloud.connectorToken,
    requestId: request.requestId,
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "text/event-stream",
      "cache-control": response.headers.get("cache-control") || "no-cache, no-transform"
    },
    stream: true,
    streamId: request.streamId
  });

  if (!response.body) {
    await postJson(`${cloudUrl}/api/cloud/connectors/streams`, {
      nodeId: cloud.nodeId,
      connectorToken: cloud.connectorToken,
      streamId: request.streamId,
      done: true
    });
    return;
  }

  const reader = response.body.getReader();

  while (!stopped) {
    const { done, value } = await reader.read();
    if (done) {
      await postJson(`${cloudUrl}/api/cloud/connectors/streams`, {
        nodeId: cloud.nodeId,
        connectorToken: cloud.connectorToken,
        streamId: request.streamId,
        done: true
      });
      return;
    }

    await postJson(`${cloudUrl}/api/cloud/connectors/streams`, {
      nodeId: cloud.nodeId,
      connectorToken: cloud.connectorToken,
      streamId: request.streamId,
      chunkBase64: Buffer.from(value).toString("base64")
    });
  }
}

async function executeCloudRequest(request) {
  const cloud = getCloudLinkState();
  if (!cloud.linked || !cloud.url || !cloud.nodeId || !cloud.connectorToken) {
    throw new Error("Node is no longer linked to a self-hosted cloud.");
  }

  const nodeUrl = getLocalNodeUrl();
  const targetUrl = new URL(`${request.path}${request.search || ""}`, nodeUrl);
  const method = String(request.method || "GET").toUpperCase();

  try {
    const response = await fetch(targetUrl, {
      method,
      headers: request.headers ?? {},
      body:
        method === "GET" || method === "HEAD" || !request.bodyBase64
          ? undefined
          : Buffer.from(request.bodyBase64, "base64")
    });

    const contentType = response.headers.get("content-type") || "";
    if (request.stream && request.streamId && contentType.includes("text/event-stream")) {
      await postStreamResponse(cloud.url, cloud, request, response);
      return;
    }

    await postBufferedResponse(cloud.url, cloud, request.requestId, response);
  } catch (error) {
    await postErrorResponse(
      cloud.url,
      cloud,
      request.requestId,
      error instanceof Error ? error.message : "Node request failed."
    );
  }
}

async function pollCloud() {
  const cloud = getCloudLinkState();

  if (!cloud.linked || !cloud.url || !cloud.nodeId || !cloud.connectorToken) {
    throw new Error("Node is not linked to a self-hosted cloud.");
  }

  const response = await fetch(`${cloud.url}/api/cloud/connectors/poll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nodeId: cloud.nodeId,
      connectorToken: cloud.connectorToken
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Cloud poll failed with status ${response.status}.`);
  }

  const payload = await response.json();
  return payload.request ?? null;
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stopped = true;
  });
}

while (!stopped) {
  try {
    const request = await pollCloud();
    if (!request) {
      continue;
    }

    await executeCloudRequest(request);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Cloud connector failed.");
    await delay(2000);
  }
}
