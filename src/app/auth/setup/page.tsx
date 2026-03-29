import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createCloudAuthQrCodeDataUrl,
  getCloudAuthSetupState
} from "@/lib/cloud-auth";
import {
  getCloudSessionFromCookies,
  normalizeReturnTo
} from "@/lib/cloud-auth-http";
import { getRuntimeMode } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";

const SETUP_ERROR_MESSAGES: Record<string, string> = {
  "invalid-code": "The 6-digit code was not valid. Enter the current code from Google Authenticator."
};

export default async function CloudAuthSetupPage({
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
  const auth = getCloudAuthSetupState();
  const session = await getCloudSessionFromCookies();

  if (auth.bound) {
    if (session) {
      redirect(returnTo);
    }

    redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const qrCodeDataUrl = await createCloudAuthQrCodeDataUrl();
  const errorMessage = params.error ? SETUP_ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <main className="cloud-auth-shell">
      <section className="cloud-auth-card">
        <div className="cloud-auth-copy">
          <span className="cloud-eyebrow">Self-hosted cloud setup</span>
          <h1>Bind Google Authenticator</h1>
          <p>
            This deployment does not have a bound authenticator yet. Scan the QR code or
            enter the setup key manually, then confirm with the current 6-digit code.
          </p>
        </div>

        <div className="cloud-auth-grid">
          <div className="cloud-auth-qr-panel">
            <img
              alt="Google Authenticator QR code"
              className="cloud-auth-qr"
              height={224}
              src={qrCodeDataUrl}
              width={224}
            />
            <p className="cloud-auth-note">
              Issuer <code>{auth.issuer}</code> on <code>{auth.label}</code>
            </p>
          </div>

          <div className="cloud-auth-form-panel">
            <div className="cloud-auth-secret">
              <span className="cloud-auth-secret-label">Manual setup key</span>
              <code>{auth.secretBase32}</code>
            </div>

            <form action="/api/cloud/auth/setup" className="cloud-auth-form" method="post">
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
                Bind authenticator
              </button>
            </form>

            <p className="cloud-auth-meta">
              Recovery is local-only. If you lose the authenticator device, reset the
              self-hosted cloud on the host machine and bind again.
            </p>
          </div>
        </div>

        <div className="cloud-auth-footer">
          <Link href="/">Back</Link>
          <code>{auth.authPath}</code>
        </div>
      </section>
    </main>
  );
}
