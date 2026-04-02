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

test("mobile bottom dock stays inside the viewport", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);

  const metrics = await page.evaluate(() => {
    const app = document.querySelector(".dock-app");
    const shell = document.querySelector(".dock-shell");
    const bottomDock = document.querySelector(".dock-bottom-dock");
    const composerPanel = document.querySelector(".dock-composer-panel");
    const statusFooter = document.querySelector(".dock-status-footer");

    if (
      !(app instanceof HTMLElement) ||
      !(shell instanceof HTMLElement) ||
      !(bottomDock instanceof HTMLElement) ||
      !(composerPanel instanceof HTMLElement) ||
      !(statusFooter instanceof HTMLElement)
    ) {
      return null;
    }

    const viewportHeight = window.innerHeight;
    const appBox = app.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    const bottomDockBox = bottomDock.getBoundingClientRect();
    const composerBox = composerPanel.getBoundingClientRect();
    const statusBox = statusFooter.getBoundingClientRect();

    return {
      viewportHeight,
      appBottom: Math.round(appBox.bottom),
      shellBottom: Math.round(shellBox.bottom),
      bottomDockBottom: Math.round(bottomDockBox.bottom),
      composerBottom: Math.round(composerBox.bottom),
      statusBottom: Math.round(statusBox.bottom)
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.appBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.shellBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.bottomDockBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.composerBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.statusBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
});
