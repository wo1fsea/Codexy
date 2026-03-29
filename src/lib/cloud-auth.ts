import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import QRCode from "qrcode";
import { z } from "zod";

const CLOUD_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const CLOUD_SESSION_COOKIE_NAME = "codexy_cloud_session";

const cloudSessionSchema = z.object({
  tokenHash: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  expiresAt: z.string().trim().min(1),
  lastUsedAt: z.string().trim().min(1)
});

const cloudAuthFileSchema = z.object({
  bindingId: z.string().trim().min(1),
  issuer: z.string().trim().min(1),
  label: z.string().trim().min(1),
  secretBase32: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  boundAt: z.string().trim().min(1).nullable(),
  sessions: z.array(cloudSessionSchema).default([])
});

type CloudAuthFile = z.infer<typeof cloudAuthFileSchema>;
type CloudSessionRecord = z.infer<typeof cloudSessionSchema>;

export type CloudAuthStatus = {
  authPath: string;
  bindingId: string;
  issuer: string;
  label: string;
  bound: boolean;
  createdAt: string;
  boundAt: string | null;
};

export type CloudAuthSetupState = CloudAuthStatus & {
  secretBase32: string;
  otpauthUri: string;
};

export type CloudAuthSession = {
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
};

function getCodexyHomeDir() {
  return process.env.CODEXY_HOME_DIR?.trim() || path.join(os.homedir(), ".codexy");
}

function getCloudDataDir() {
  return path.join(getCodexyHomeDir(), "cloud");
}

export function getCloudAuthPath() {
  return path.join(getCloudDataDir(), "auth.json");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function encodeBase32(buffer: Uint8Array) {
  let bits = 0;
  let value = 0;
  let encoded = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return encoded;
}

function decodeBase32(input: string) {
  const normalized = input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[\s-]+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const next = BASE32_ALPHABET.indexOf(char);
    if (next === -1) {
      throw new Error("Authenticator secret is not valid base32.");
    }

    value = (value << 5) | next;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function normalizeTotpCode(rawCode: string) {
  const normalized = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error("Enter a valid 6-digit authenticator code.");
  }

  return normalized;
}

function createDefaultCloudAuthFile(): CloudAuthFile {
  const deploymentLabel = os.hostname() || "codexy-self-hosted";

  return {
    bindingId: randomUUID(),
    issuer: "Codexy Cloud",
    label: deploymentLabel,
    secretBase32: encodeBase32(randomBytes(20)),
    createdAt: new Date().toISOString(),
    boundAt: null,
    sessions: []
  };
}

function filterActiveSessions(sessions: CloudSessionRecord[]) {
  const now = Date.now();

  return sessions.filter((session) => {
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function writeCloudAuthFile(nextFile: CloudAuthFile) {
  const authPath = getCloudAuthPath();
  mkdirSync(path.dirname(authPath), { recursive: true });
  writeFileSync(
    authPath,
    `${JSON.stringify({ ...nextFile, sessions: filterActiveSessions(nextFile.sessions) }, null, 2)}\n`,
    "utf8"
  );
}

function readCloudAuthFile() {
  const authPath = getCloudAuthPath();

  if (!existsSync(authPath)) {
    const nextFile = createDefaultCloudAuthFile();
    writeCloudAuthFile(nextFile);
    return nextFile;
  }

  const parsed = cloudAuthFileSchema.parse(
    JSON.parse(readFileSync(authPath, "utf8")) as unknown
  );
  const nextFile = {
    ...parsed,
    sessions: filterActiveSessions(parsed.sessions)
  };

  if (nextFile.sessions.length !== parsed.sessions.length) {
    writeCloudAuthFile(nextFile);
  }

  return nextFile;
}

function getOtpAuthUri(file: CloudAuthFile) {
  const label = encodeURIComponent(`${file.issuer}:${file.label}`);
  const query = new URLSearchParams({
    secret: file.secretBase32,
    issuer: file.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}

function createHotpCode(secretBase32: string, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secretBase32))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function verifyTotpCode(secretBase32: string, code: string, now = Date.now()) {
  const normalizedCode = normalizeTotpCode(code);
  const currentCounter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);

  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) {
      continue;
    }

    if (createHotpCode(secretBase32, counter) === normalizedCode) {
      return true;
    }
  }

  return false;
}

function toCloudAuthStatus(file: CloudAuthFile): CloudAuthStatus {
  return {
    authPath: getCloudAuthPath(),
    bindingId: file.bindingId,
    issuer: file.issuer,
    label: file.label,
    bound: Boolean(file.boundAt),
    createdAt: file.createdAt,
    boundAt: file.boundAt
  };
}

function createSessionRecord() {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLOUD_SESSION_TTL_MS);

  return {
    token,
    record: {
      tokenHash: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastUsedAt: now.toISOString()
    }
  };
}

export function getCloudAuthStatus() {
  return toCloudAuthStatus(readCloudAuthFile());
}

export function getCloudAuthSetupState(): CloudAuthSetupState {
  const file = readCloudAuthFile();

  return {
    ...toCloudAuthStatus(file),
    secretBase32: file.secretBase32,
    otpauthUri: getOtpAuthUri(file)
  };
}

export async function createCloudAuthQrCodeDataUrl() {
  const setup = getCloudAuthSetupState();
  return await QRCode.toDataURL(setup.otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 224
  });
}

export function verifyCloudAuthenticatorCode(code: string) {
  const file = readCloudAuthFile();
  if (!file.boundAt) {
    throw new Error("Cloud authenticator binding is not complete yet.");
  }

  return verifyTotpCode(file.secretBase32, code);
}

export function bindCloudAuthenticator(code: string) {
  const file = readCloudAuthFile();
  if (file.boundAt) {
    return toCloudAuthStatus(file);
  }

  if (!verifyTotpCode(file.secretBase32, code)) {
    throw new Error("The authenticator code was not valid.");
  }

  const nextFile = {
    ...file,
    boundAt: new Date().toISOString()
  };
  writeCloudAuthFile(nextFile);

  return toCloudAuthStatus(nextFile);
}

export function createCloudWebSession() {
  const file = readCloudAuthFile();
  if (!file.boundAt) {
    throw new Error("Cloud authenticator binding is not complete yet.");
  }

  const { token, record } = createSessionRecord();
  writeCloudAuthFile({
    ...file,
    sessions: [...file.sessions, record]
  });

  return {
    token,
    expiresAt: record.expiresAt
  };
}

export function loginWithCloudAuthenticator(code: string) {
  if (!verifyCloudAuthenticatorCode(code)) {
    throw new Error("The authenticator code was not valid.");
  }

  return createCloudWebSession();
}

export function getCloudWebSession(token: string | null | undefined): CloudAuthSession | null {
  if (!token) {
    return null;
  }

  const file = readCloudAuthFile();
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();
  const sessions = file.sessions.map((session) => {
    if (session.tokenHash !== tokenHash) {
      return session;
    }

    return {
      ...session,
      lastUsedAt: nowIso
    };
  });
  const matchedSession = sessions.find((session) => session.tokenHash === tokenHash) ?? null;

  if (!matchedSession) {
    return null;
  }

  writeCloudAuthFile({
    ...file,
    sessions
  });

  return {
    createdAt: matchedSession.createdAt,
    expiresAt: matchedSession.expiresAt,
    lastUsedAt: matchedSession.lastUsedAt
  };
}

export function clearCloudWebSession(token: string | null | undefined) {
  if (!token) {
    return;
  }

  const file = readCloudAuthFile();
  const tokenHash = hashToken(token);
  const nextSessions = file.sessions.filter((session) => session.tokenHash !== tokenHash);

  if (nextSessions.length === file.sessions.length) {
    return;
  }

  writeCloudAuthFile({
    ...file,
    sessions: nextSessions
  });
}
