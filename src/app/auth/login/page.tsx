import { redirect } from "next/navigation";

import { getCloudAuthStatus } from "@/lib/cloud-auth";
import {
  getCloudSessionFromCookies,
  normalizeReturnTo
} from "@/lib/cloud-auth-http";
import { getRuntimeMode } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  "invalid-code": "The 6-digit code was not valid. Enter the current code from Google Authenticator."
};

export default async function CloudAuthLoginPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
  }>;
}) {
  if (getRuntimeMode() !== "cloud") {
    redirect("/");
  }

  const params = await searchParams;
  const returnTo = normalizeReturnTo(params.returnTo);
  const auth = getCloudAuthStatus();

  if (!auth.bound) {
    redirect(`/auth/setup?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const session = await getCloudSessionFromCookies();
  if (session) {
    redirect(returnTo);
  }

  const errorMessage = params.error ? LOGIN_ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <main className="cloud-auth-shell">
      <div className="cloud-auth-scroll">
        <section className="cloud-auth-card cloud-auth-card-narrow">
          <div className="cloud-auth-copy">
            <span className="cloud-eyebrow">Self-hosted cloud login</span>
            <h1>Enter your authenticator code</h1>
            <p>
              This cloud deployment is single-user. Enter the current Google Authenticator
              6-digit code to open the dashboard.
            </p>
          </div>

          <form action="/api/cloud/auth/login" className="cloud-auth-form" method="post">
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="cloud-auth-field">
              <span>6-digit code</span>
              <input
                autoComplete="one-time-code"
                className="cloud-auth-input"
                inputMode="numeric"
                maxLength={6}
                name="code"
                pattern="[0-9]{6}"
                placeholder="123456"
                required
              />
            </label>

            {errorMessage ? <p className="cloud-auth-error">{errorMessage}</p> : null}

            <button className="cloud-auth-submit" type="submit">
              Sign in
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
