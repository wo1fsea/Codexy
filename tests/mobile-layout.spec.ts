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

test("mobile safe top inset keeps the stage header below the status bar", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-top", "48px");
  });

  const metrics = await page.evaluate(() => {
    const app = document.querySelector(".dock-app");
    const shell = document.querySelector(".dock-shell");
    const header = document.querySelector(".dock-stage-header");

    if (
      !(app instanceof HTMLElement) ||
      !(shell instanceof HTMLElement) ||
      !(header instanceof HTMLElement)
    ) {
      return null;
    }

    const appStyle = getComputedStyle(app);
    const shellBox = shell.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();

    return {
      appPaddingTop: Number.parseFloat(appStyle.paddingTop) || 0,
      shellTop: Math.round(shellBox.top),
      headerTop: Math.round(headerBox.top)
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.appPaddingTop).toBe(48);
  expect(metrics!.shellTop).toBeGreaterThanOrEqual(48);
  expect(metrics!.headerTop).toBeGreaterThanOrEqual(48);
  expect(Math.abs(metrics!.headerTop - metrics!.shellTop)).toBeLessThanOrEqual(1);
});

test("mobile bottom dock stays inside the viewport", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-bottom", "34px");
  });

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
      bottomDockPaddingBottom:
        Number.parseFloat(getComputedStyle(bottomDock).paddingBottom) || 0,
      composerBottom: Math.round(composerBox.bottom),
      statusBottom: Math.round(statusBox.bottom),
      statusBottomGap: Math.round(viewportHeight - statusBox.bottom)
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.appBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.shellBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.bottomDockBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.bottomDockPaddingBottom).toBe(34);
  expect(metrics!.composerBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.statusBottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  expect(metrics!.statusBottomGap).toBeLessThanOrEqual(35);
});

test("mobile idle hero does not scroll into blank space", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);

  const metrics = await page.evaluate(() => {
    const stageScroll = document.querySelector(".dock-stage-scroll");
    const stageScrollBody = document.querySelector(".dock-stage-scroll-body");
    const hero = document.querySelector(".dock-hero");

    if (
      !(stageScroll instanceof HTMLElement) ||
      !(stageScrollBody instanceof HTMLElement) ||
      !(hero instanceof HTMLElement)
    ) {
      return null;
    }

    return {
      clientHeight: stageScroll.clientHeight,
      scrollHeight: stageScroll.scrollHeight,
      heroHeight: Math.round(hero.getBoundingClientRect().height),
      bodyHeight: Math.round(stageScrollBody.getBoundingClientRect().height)
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.scrollHeight - metrics!.clientHeight).toBeLessThanOrEqual(1);
  expect(metrics!.bodyHeight).toBeLessThanOrEqual(metrics!.clientHeight + 1);
  expect(metrics!.heroHeight).toBeLessThanOrEqual(metrics!.clientHeight + 1);
});

test("mobile document root does not exceed the viewport height", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDock(page);

  const metrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement;
    if (!(scrollingElement instanceof HTMLElement)) {
      return null;
    }

    return {
      viewportHeight: window.innerHeight,
      clientHeight: scrollingElement.clientHeight,
      scrollHeight: scrollingElement.scrollHeight
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.clientHeight).toBeLessThanOrEqual(metrics!.viewportHeight + 1);
  expect(metrics!.scrollHeight).toBeLessThanOrEqual(metrics!.viewportHeight + 1);
});
