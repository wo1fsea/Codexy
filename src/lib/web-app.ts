import type { Metadata, MetadataRoute } from "next";

import { getRuntimeMode, type CodexyRuntimeMode } from "@/lib/runtime-mode";

export const APP_THEME_COLOR = "#141416";

type ManifestShortcut = NonNullable<MetadataRoute.Manifest["shortcuts"]>[number];

type WebAppProfile = {
  applicationName: string;
  description: string;
  shortcuts: ManifestShortcut[];
};

export function getWebAppProfile(
  mode: CodexyRuntimeMode = getRuntimeMode()
): WebAppProfile {
  if (mode === "cloud") {
    return {
      applicationName: "Codexy Cloud",
      description:
        "Self-hosted Codexy dashboard for linked nodes, remote workspaces, and wall views.",
      shortcuts: [
        {
          name: "Dashboard",
          short_name: "Dashboard",
          description: "Open the linked-node dashboard.",
          url: "/"
        },
        {
          name: "Node Wall",
          short_name: "Wall",
          description: "Open the multi-pane linked-node wall.",
          url: "/wall"
        }
      ]
    };
  }

  return {
    applicationName: "Codexy",
    description:
      "Tailscale-first local Codexy workspace for threads, approvals, and terminal sessions.",
    shortcuts: [
      {
        name: "Workspace",
        short_name: "Workspace",
        description: "Open the local Codexy workspace.",
        url: "/"
      }
    ]
  };
}

export function getAppMetadata(
  mode: CodexyRuntimeMode = getRuntimeMode()
): Metadata {
  const profile = getWebAppProfile(mode);

  return {
    applicationName: profile.applicationName,
    title: profile.applicationName,
    description: profile.description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: profile.applicationName,
      statusBarStyle: "black-translucent"
    },
    other: {
      "apple-mobile-web-app-capable": "yes"
    },
    formatDetection: {
      telephone: false,
      email: false,
      address: false
    }
  };
}

export function getAppManifest(
  mode: CodexyRuntimeMode = getRuntimeMode()
): MetadataRoute.Manifest {
  const profile = getWebAppProfile(mode);

  return {
    id: "/",
    name: profile.applicationName,
    short_name: profile.applicationName,
    description: profile.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "any",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    categories: ["developer", "productivity"],
    launch_handler: {
      client_mode: "focus-existing"
    },
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: profile.shortcuts
  };
}
