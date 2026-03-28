import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";
type NetworkInterfaceEntry = {
  family?: string | number;
  internal?: boolean;
  address?: string;
};

function parseAllowedDevOrigins(raw: string | undefined) {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectActiveIpv4Hosts() {
  const hosts = new Set<string>();
  const interfaces = Object.values(os.networkInterfaces()) as Array<
    NetworkInterfaceEntry[] | undefined
  >;

  for (const networkEntries of interfaces) {
    const entries = networkEntries ?? [];

    for (const entry of entries) {
      const family =
        typeof entry.family === "string" ? entry.family : String(entry.family);
      if (family !== "IPv4" || entry.internal || !entry.address) {
        continue;
      }

      hosts.add(entry.address);
    }
  }

  return [...hosts];
}

const allowedDevOrigins = [
  "127.0.0.1",
  "localhost",
  "*.localhost",
  "**.ts.net",
  ...collectActiveIpv4Hosts(),
  ...parseAllowedDevOrigins(process.env.CODEXY_ALLOWED_DEV_ORIGINS)
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  distDir,
  serverExternalPackages: ["ws"],
  turbopack: {
    root
  }
};

export default nextConfig;
