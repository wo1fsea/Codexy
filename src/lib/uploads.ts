import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { dockEnv } from "@/lib/codex/env";

export type StoredUpload = {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  url: string;
};

function pickExtension(name: string, mimeType: string) {
  const ext = path.extname(name);
  if (ext) {
    return ext;
  }

  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";

  return ".bin";
}

export function getUploadUrl(uploadId: string) {
  return `/api/uploads/${encodeURIComponent(uploadId)}`;
}

function getCandidateUploadRoots() {
  return [...new Set([dockEnv.uploadRoot, ...dockEnv.legacyUploadRoots].map((root) => path.resolve(root)))];
}

export function getUploadPublicUrl(uploadPath: string) {
  const normalizedPath = path.resolve(uploadPath);

  for (const normalizedRoot of getCandidateUploadRoots()) {
    if (normalizedPath.startsWith(normalizedRoot)) {
      return getUploadUrl(path.basename(normalizedPath));
    }
  }

  return null;
}

export function getContentTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";

  return "application/octet-stream";
}

export async function resolveUploadPath(uploadId: string) {
  const safeName = path.basename(uploadId);
  for (const normalizedRoot of getCandidateUploadRoots()) {
    const resolvedPath = path.resolve(normalizedRoot, safeName);

    if (!resolvedPath.startsWith(normalizedRoot)) {
      continue;
    }

    try {
      await stat(resolvedPath);
      return resolvedPath;
    } catch {}
  }

  throw new Error("Upload not found.");
}

export async function storeFiles(files: File[]): Promise<StoredUpload[]> {
  await mkdir(dockEnv.uploadRoot, { recursive: true });

  const uploads: StoredUpload[] = [];

  for (const file of files) {
    const extension = pickExtension(file.name, file.type);
    const id = `${Date.now()}-${randomUUID()}${extension}`;
    const destination = path.join(dockEnv.uploadRoot, id);
    const bytes = Buffer.from(await file.arrayBuffer());

    await writeFile(destination, bytes);

    uploads.push({
      id,
      name: file.name,
      path: destination,
      size: file.size,
      type: file.type,
      url: getUploadUrl(id)
    });
  }

  return uploads;
}
