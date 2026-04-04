import { expect, test } from "@playwright/test";

import { gotoDock, installDockApiMock } from "./support/dock-api-mock";

test("node runtime exposes standalone web app metadata", async ({
  page,
  request
}) => {
  await installDockApiMock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);

  const head = await page.evaluate(() => ({
    manifestHref:
      document.querySelector('link[rel="manifest"]')?.getAttribute("href") ??
      null,
    appleTouchIconHref:
      document
        .querySelector('link[rel="apple-touch-icon"]')
        ?.getAttribute("href") ?? null,
    appleCapable:
      document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute("content") ?? null,
    appleTitle:
      document
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.getAttribute("content") ?? null,
    appleStatusBar:
      document
        .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
        ?.getAttribute("content") ?? null
  }));

  expect(head.manifestHref).toContain("/manifest.webmanifest");
  expect(head.appleTouchIconHref).toContain("/apple-icon");
  expect(head.appleCapable).toBe("yes");
  expect(head.appleTitle).toBe("Codexy");
  expect(head.appleStatusBar).toBe("black-translucent");

  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = (await response.json()) as {
    display?: string;
    display_override?: string[];
    name?: string;
    start_url?: string;
    shortcuts?: Array<{ url: string }>;
  };

  expect(manifest.display).toBe("standalone");
  expect(manifest.display_override).toContain("standalone");
  expect(manifest.name).toBe("Codexy");
  expect(manifest.start_url).toBe("/");
  expect(manifest.shortcuts?.some((shortcut) => shortcut.url === "/")).toBeTruthy();
  expect(
    manifest.shortcuts?.some((shortcut) => shortcut.url === "/wall") ?? false
  ).toBeFalsy();
});
