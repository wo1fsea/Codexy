import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function getCodexyHomeDir() {
  return process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");
}

export function getCodexyConfigPath() {
  return path.join(getCodexyHomeDir(), "config.json");
}

function emptyConfig() {
  return {};
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRawConfig() {
  const configPath = getCodexyConfigPath();
  if (!existsSync(configPath)) {
    return {
      config: emptyConfig(),
      configPath,
      error: null
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (!isRecord(parsed)) {
      return {
        config: emptyConfig(),
        configPath,
        error: `Codexy config at ${configPath} must be a JSON object.`
      };
    }

    return {
      config: parsed,
      configPath,
      error: null
    };
  } catch (error) {
    return {
      config: emptyConfig(),
      configPath,
      error:
        error instanceof Error
          ? `Unable to read Codexy config at ${configPath}: ${error.message}`
          : `Unable to read Codexy config at ${configPath}.`
    };
  }
}

function writeRawConfig(config) {
  const configPath = getCodexyConfigPath();
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

function ensureNodeIdentity(config) {
  const currentNode = isRecord(config.node) ? config.node : {};
  const nodeId =
    typeof currentNode.id === "string" && currentNode.id.trim()
      ? currentNode.id.trim()
      : randomUUID();
  const nodeName = os.hostname().trim() || "codexy-node";

  return {
    ...config,
    node: {
      id: nodeId,
      name: nodeName
    }
  };
}

export function ensureLocalNodeIdentity() {
  const current = readRawConfig();

  if (current.error) {
    throw new Error(current.error);
  }

  const nextConfig = ensureNodeIdentity(current.config);
  const configPath = writeRawConfig(nextConfig);
  const { nodeId, nodeName } = readNodeIdentity(nextConfig);

  return {
    nodeId,
    nodeName,
    configPath
  };
}

function readNodeIdentity(config) {
  if (!isRecord(config.node)) {
    return {
      nodeId: null,
      nodeName: null
    };
  }

  return {
    nodeId: typeof config.node.id === "string" && config.node.id.trim() ? config.node.id.trim() : null,
    nodeName:
      typeof config.node.name === "string" && config.node.name.trim()
        ? config.node.name.trim()
        : null
  };
}

export function normalizeCloudUrl(rawUrl) {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    throw new Error("A self-hosted cloud URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid cloud URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Cloud URL must use http or https.");
  }

  if (!parsed.hostname) {
    throw new Error("Cloud URL must include a hostname.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Cloud URL must not embed credentials.");
  }

  parsed.search = "";
  parsed.hash = "";

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${normalizedPath}`;
}

export function getCloudLinkState() {
  const { config, configPath, error } = readRawConfig();
  const { nodeId, nodeName } = readNodeIdentity(config);

  if (error) {
    return {
      linked: false,
      url: null,
      linkedAt: null,
      nodeId,
      nodeName,
      configPath,
      error
    };
  }

  const cloud = isRecord(config.cloud) ? config.cloud : null;
  const url =
    cloud && typeof cloud.url === "string" && cloud.url.trim() ? cloud.url.trim() : null;
  const linkedAt =
    cloud && typeof cloud.linkedAt === "string" && cloud.linkedAt.trim()
      ? cloud.linkedAt.trim()
      : null;
  const connectorToken =
    cloud && typeof cloud.connectorToken === "string" && cloud.connectorToken.trim()
      ? cloud.connectorToken.trim()
      : null;

  return {
    linked: Boolean(url),
    url,
    linkedAt,
    connectorToken,
    nodeId,
    nodeName,
    configPath,
    error: null
  };
}

export function writeCloudLink(rawUrl, options = {}) {
  const normalizedUrl = normalizeCloudUrl(rawUrl);
  const current = readRawConfig();

  if (current.error) {
    throw new Error(current.error);
  }

  const configWithNode = ensureNodeIdentity(current.config);
  const nextConfig = {
    ...configWithNode,
    cloud: {
      url: normalizedUrl,
      linkedAt:
        typeof options.linkedAt === "string" && options.linkedAt.trim()
          ? options.linkedAt.trim()
          : new Date().toISOString(),
      ...(typeof options.connectorToken === "string" && options.connectorToken.trim()
        ? {
            connectorToken: options.connectorToken.trim()
          }
        : {})
    }
  };

  const configPath = writeRawConfig(nextConfig);
  const state = getCloudLinkState();

  return {
    ...state,
    url: normalizedUrl,
    configPath
  };
}

export function clearCloudLink() {
  const current = readRawConfig();

  if (current.error) {
    throw new Error(current.error);
  }

  const nextConfig = { ...current.config };
  delete nextConfig.cloud;

  if (!Object.keys(nextConfig).length) {
    rmSync(current.configPath, { force: true });
  } else {
    writeRawConfig(nextConfig);
  }

  return getCloudLinkState();
}
