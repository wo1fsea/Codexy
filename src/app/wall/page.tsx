import { notFound } from "next/navigation";

import { CloudWallClient } from "@/components/cloud-wall-client";
import { requireCloudPageSession } from "@/lib/cloud-auth-http";
import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";
import { I18nProvider } from "@/lib/i18n/provider";
import { getRuntimeMode } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";

export default async function CloudWallPage() {
  if (getRuntimeMode() !== "cloud") {
    notFound();
  }

  await requireCloudPageSession("/wall");
  const snapshot = getCloudRegistrySnapshot();

  return (
    <I18nProvider>
      <CloudWallClient
        initialDeploymentName={snapshot.deploymentName}
        initialNodes={snapshot.nodes}
      />
    </I18nProvider>
  );
}
