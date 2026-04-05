import { CloudApp } from "@/components/cloud-app";
import { DockApp } from "@/components/dock-app";
import { requireCloudPageSession } from "@/lib/cloud-auth-http";
import { I18nProvider } from "@/lib/i18n/provider";
import { getRuntimeMode } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (getRuntimeMode() === "cloud") {
    await requireCloudPageSession("/");
    return <CloudApp />;
  }

  return (
    <I18nProvider>
      <DockApp viewportSafeAreaTop />
    </I18nProvider>
  );
}
