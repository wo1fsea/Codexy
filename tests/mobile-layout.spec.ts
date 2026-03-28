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
    const composer = document.querySelector(".dock-composer-shell");
    const themeColor = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute("content");

    return {
      themeColor,
      shellBackground: shell ? getComputedStyle(shell).backgroundColor : null,
      shellBackgroundImage: shell ? getComputedStyle(shell).backgroundImage : null,
      stageBackground: stage ? getComputedStyle(stage).backgroundColor : null,
      stageBackgroundImage: stage ? getComputedStyle(stage).backgroundImage : null,
      headerBackground: header ? getComputedStyle(header).backgroundColor : null,
      headerBackgroundImage: header ? getComputedStyle(header).backgroundImage : null,
      composerBackgroundImage: composer
        ? getComputedStyle(composer).backgroundImage
        : null
    };
  });

  expect(surfaces.themeColor).toBe("#141416");
  expect(surfaces.shellBackground).toBe("rgb(20, 20, 22)");
  expect(surfaces.shellBackgroundImage).toBe("none");
  expect(surfaces.stageBackground).toBe("rgb(20, 20, 22)");
  expect(surfaces.stageBackgroundImage).toBe("none");
  expect(surfaces.headerBackground).toBe("rgb(20, 20, 22)");
  expect(surfaces.headerBackgroundImage).toBe("none");
  expect(surfaces.composerBackgroundImage).toBe("none");
});
