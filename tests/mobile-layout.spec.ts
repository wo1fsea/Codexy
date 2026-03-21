import { expect, test } from "@playwright/test";

import { gotoDock, installDockApiMock } from "./support/dock-api-mock";

test("mobile top surface matches the stage tone", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);

  const surfaces = await page.evaluate(() => {
    const shell = document.querySelector(".dock-shell");
    const stage = document.querySelector(".dock-stage");
    const header = document.querySelector(".dock-stage-header");
    const themeColor = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute("content");

    return {
      themeColor,
      shellBackground: shell ? getComputedStyle(shell).backgroundColor : null,
      stageBackground: stage ? getComputedStyle(stage).backgroundColor : null,
      headerBackground: header ? getComputedStyle(header).backgroundColor : null
    };
  });

  expect(surfaces.themeColor).toBe("#141416");
  expect(surfaces.shellBackground).toBe("rgb(20, 20, 22)");
  expect(surfaces.stageBackground).toBe("rgb(20, 20, 22)");
  expect(surfaces.headerBackground).toBe("rgb(20, 20, 22)");
});
