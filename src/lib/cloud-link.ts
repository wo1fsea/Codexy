import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type LocalConfig = {
  node?: {
    id?: string;
    name?: string;
  };
  cloud?: {
    url?: string;
    linkedAt?: string;
  };
};

export type CloudLinkStatus = {
  linked: boolean;
  url: string | null;
  linkedAt: string | null;
  nodeId: string | null;
  nodeName: string | null;
  configPath: string;
  error: string | null;
};

function getCodexyHomeDir() {
  return process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");
}

export function getCodexyConfigPath() {
  return path.join(getCodexyHomeDir(), "config.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLocalConfig(): {
  config: LocalConfig;
  configPath: string;
  error: string | null;
} {
  const configPath = getCodexyConfigPath();
  if (!existsSync(configPath)) {
    return {
      config: {},
      configPath,
      error: null
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return {
        config: {},
        configPath,
        error: `Codexy config at ${configPath} must be a JSON object.`
      };
    }

    return {
      config: parsed as LocalConfig,
      configPath,
      error: null
    };
  } catch (error) {
    return {
      config: {},
      configPath,
      error:
        error instanceof Error
          ? `Unable to read Codexy config at ${configPath}: ${error.message}`
          : `Unable to read Codexy config at ${configPath}.`
    };
  }
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getCloudLinkStatus(): CloudLinkStatus {
  const { config, configPath, error } = readLocalConfig();
  const node = isRecord(config.node) ? config.node : null;
  const cloud = isRecord(config.cloud) ? config.cloud : null;

  const nodeId = getString(node?.id);
  const nodeName = getString(node?.name);
  const url = getString(cloud?.url);
  const linkedAt = getString(cloud?.linkedAt);

  return {
    linked: Boolean(url) && !error,
    url,
    linkedAt,
    nodeId,
    nodeName,
    configPath,
    error
  };
}
