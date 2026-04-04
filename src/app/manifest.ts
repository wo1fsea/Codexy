import type { MetadataRoute } from "next";

import { getAppManifest } from "@/lib/web-app";

export default function manifest(): MetadataRoute.Manifest {
  return getAppManifest();
}
