import { DockApp } from "@/components/dock-app";
import { I18nProvider } from "@/lib/i18n/provider";

export default function HomePage() {
  return (
    <I18nProvider>
      <DockApp />
    </I18nProvider>
  );
}
