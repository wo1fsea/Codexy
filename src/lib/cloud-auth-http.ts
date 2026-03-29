import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  CLOUD_SESSION_COOKIE_NAME,
  clearCloudWebSession,
  getCloudAuthStatus,
  getCloudWebSession
} from "@/lib/cloud-auth";

export function normalizeReturnTo(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

export function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(/:$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return requestUrl.origin;
  }

  return `${protocol}://${host}`;
}

function isSecureRequest(requestUrl: string) {
  try {
    return new URL(requestUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export async function getCloudSessionFromCookies() {
  const cookieStore = await cookies();
  return getCloudWebSession(cookieStore.get(CLOUD_SESSION_COOKIE_NAME)?.value);
}

export async function requireCloudPageSession(returnTo = "/") {
  const nextReturnTo = normalizeReturnTo(returnTo);
  const auth = getCloudAuthStatus();

  if (!auth.bound) {
    redirect(`/auth/setup?returnTo=${encodeURIComponent(nextReturnTo)}`);
  }

  const session = await getCloudSessionFromCookies();
  if (!session) {
    redirect(`/auth/login?returnTo=${encodeURIComponent(nextReturnTo)}`);
  }

  return session;
}

export async function requireCloudApiSession() {
  const auth = getCloudAuthStatus();

  if (!auth.bound) {
    return NextResponse.json(
      {
        error: "Cloud authenticator binding is not complete yet."
      },
      { status: 503 }
    );
  }

  const session = await getCloudSessionFromCookies();
  if (!session) {
    return NextResponse.json(
      {
        error: "Authentication required."
      },
      { status: 401 }
    );
  }

  return null;
}

export function setCloudSessionCookie(
  response: NextResponse,
  session: {
    token: string;
    expiresAt: string;
  },
  requestUrl: string
) {
  response.cookies.set({
    name: CLOUD_SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(requestUrl),
    path: "/",
    expires: new Date(session.expiresAt)
  });
}

export function clearCloudSessionCookie(response: NextResponse, requestUrl: string) {
  response.cookies.set({
    name: CLOUD_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(requestUrl),
    path: "/",
    expires: new Date(0)
  });
}

export async function clearCloudSessionFromCookies() {
  const cookieStore = await cookies();
  clearCloudWebSession(cookieStore.get(CLOUD_SESSION_COOKIE_NAME)?.value);
}
