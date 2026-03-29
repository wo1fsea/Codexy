import { getCloudRegistrySnapshot } from "@/lib/cloud-registry";

import { CloudAppClient } from "@/components/cloud-app-client";

export function CloudApp() {
  const snapshot = getCloudRegistrySnapshot();

  return (
    <CloudAppClient
      initialDeploymentName={snapshot.deploymentName}
      initialNodes={snapshot.nodes}
      nodesPath={snapshot.nodesPath}
    />
  );
}
