import { CloudApp } from "@/components/cloud-app";
import { DockApp } from "@/components/dock-app";
import { I18nProvider } from "@/lib/i18n/provider";
import { getRuntimeMode } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";

export default function HomePage() {
  if (getRuntimeMode() === "cloud") {
    return <CloudApp />;
  }

  return (
    <I18nProvider>
      <DockApp />
    </I18nProvider>
  );
}
