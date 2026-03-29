import { NextResponse } from "next/server";

import {
  clearCloudSessionCookie,
  clearCloudSessionFromCookies,
  getRequestOrigin,
  normalizeReturnTo
} from "@/lib/cloud-auth-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizeReturnTo(String(formData.get("returnTo") ?? "/auth/login"));

  await clearCloudSessionFromCookies();
  const response = NextResponse.redirect(new URL(returnTo, getRequestOrigin(request)), 303);
  clearCloudSessionCookie(response, request.url);
  return response;
}
