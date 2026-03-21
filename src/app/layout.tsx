import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Codexy",
  description: "Tailscale-first remote control plane for Codex."
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#141416"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
