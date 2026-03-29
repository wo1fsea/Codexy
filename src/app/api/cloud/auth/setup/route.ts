import { NextResponse } from "next/server";

import {
  bindCloudAuthenticator,
  createCloudWebSession,
  getCloudAuthStatus
} from "@/lib/cloud-auth";
import {
  getRequestOrigin,
  normalizeReturnTo,
  setCloudSessionCookie
} from "@/lib/cloud-auth-http";

export const runtime = "nodejs";

function buildRedirectUrl(request: Request, pathname: string, searchParams?: URLSearchParams) {
  const url = new URL(pathname, getRequestOrigin(request));

  if (searchParams) {
    url.search = searchParams.toString();
  }

  return url;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const code = String(formData.get("code") ?? "");
  const returnTo = normalizeReturnTo(String(formData.get("returnTo") ?? "/"));
  const auth = getCloudAuthStatus();

  if (auth.bound) {
    return NextResponse.redirect(
      buildRedirectUrl(
        request,
        "/auth/login",
        new URLSearchParams({
          returnTo
        })
      ),
      303
    );
  }

  try {
    bindCloudAuthenticator(code);
    const session = createCloudWebSession();
    const response = NextResponse.redirect(buildRedirectUrl(request, returnTo), 303);
    setCloudSessionCookie(response, session, request.url);
    return response;
  } catch {
    return NextResponse.redirect(
      buildRedirectUrl(
        request,
        "/auth/setup",
        new URLSearchParams({
          error: "invalid-code",
          returnTo
        })
      ),
      303
    );
  }
}
