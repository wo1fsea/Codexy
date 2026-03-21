import { expect, test } from "@playwright/test";

import { gotoDock, installDockApiMock } from "./support/dock-api-mock";

test("desktop layout follows the codexy visual contract", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDock(page);

  await expect(page.locator(".dock-shell")).toBeVisible();
  await expect(page.locator(".dock-left-stack")).toBeVisible();
  await expect(page.locator(".dock-stage")).toBeVisible();
  await expect(page.locator(".dock-composer-shell")).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByText("Live stream reconnecting...")).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const sidebar = document.querySelector(".dock-left-stack");
    const stage = document.querySelector(".dock-stage");
    const search = document.querySelector(".dock-search-field");
    const select = document.querySelector(".dock-sidebar-select .dock-select-trigger");
    const sidebarTitle = document.querySelector(".dock-sidebar-header strong");
    const stageTitle = document.querySelector(".dock-stage-title");
    const stageScroll = document.querySelector(".dock-stage-scroll");
    const threadList = document.querySelector(".dock-thread-sections");
    const composer = document.querySelector(".dock-composer-shell");
    const statusFooter = document.querySelector(".dock-status-footer");

    const sidebarBox = sidebar?.getBoundingClientRect() ?? null;
    const stageBox = stage?.getBoundingClientRect() ?? null;
    const composerBox = composer?.getBoundingClientRect() ?? null;
    const statusBox = statusFooter?.getBoundingClientRect() ?? null;

    return {
      bodyOverflow: getComputedStyle(body).overflowY,
      htmlOverflow: getComputedStyle(html).overflowY,
      sidebarWidth: sidebarBox ? Math.round(sidebarBox.width) : 0,
      searchHeight: search ? Math.round(search.getBoundingClientRect().height) : 0,
      selectHeight: select ? Math.round(select.getBoundingClientRect().height) : 0,
      sidebarTitleFontSize: sidebarTitle ? getComputedStyle(sidebarTitle).fontSize : null,
      stageTitleFontSize: stageTitle ? getComputedStyle(stageTitle).fontSize : null,
      stageScrollOverflow: stageScroll ? getComputedStyle(stageScroll).overflowY : null,
      threadListOverflow: threadList ? getComputedStyle(threadList).overflowY : null,
      composerBottomGap:
        composerBox && stageBox
          ? Math.round(stageBox.bottom - composerBox.bottom)
          : null,
      statusBottomGap:
        statusBox && stageBox
          ? Math.round(stageBox.bottom - statusBox.bottom)
          : null,
      composerStatusGap:
        composerBox && statusBox
          ? Math.round(statusBox.top - composerBox.bottom)
          : null
    };
  });

  expect(metrics.bodyOverflow).toBe("hidden");
  expect(metrics.htmlOverflow).toBe("hidden");
  expect(metrics.sidebarWidth).toBeGreaterThanOrEqual(248);
  expect(metrics.sidebarWidth).toBeLessThanOrEqual(480);
  expect(metrics.searchHeight).toBeGreaterThanOrEqual(40);
  expect(metrics.selectHeight).toBeGreaterThanOrEqual(38);
  expect(metrics.sidebarTitleFontSize).toBe("15px");
  expect(metrics.stageTitleFontSize).toBe("15px");
  expect(metrics.stageScrollOverflow).toBe("auto");
  expect(metrics.threadListOverflow).toBe("auto");
  expect(metrics.composerBottomGap).not.toBeNull();
  expect(metrics.statusBottomGap).not.toBeNull();
  expect(metrics.composerStatusGap).not.toBeNull();
  expect(metrics.composerBottomGap!).toBeLessThanOrEqual(110);
  expect(metrics.statusBottomGap!).toBeLessThanOrEqual(32);
  expect(metrics.composerStatusGap!).toBeGreaterThanOrEqual(8);
  expect(metrics.composerStatusGap!).toBeLessThanOrEqual(20);
});

test("custom dropdown renders its popup menu", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDock(page);

  const archiveFilter = page.locator(".dock-sidebar-select .dock-select-trigger").first();
  await expect(archiveFilter).toBeVisible();
  await archiveFilter.click();

  const menu = page.getByRole("listbox").first();
  await expect(menu).toBeVisible();
  await expect(page.getByRole("option", { name: "Live" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Archived" })).toBeVisible();
  await expect(page.getByRole("option", { name: "All" })).toBeVisible();
});

test("new thread nav button stays frameless at rest and gains chrome on hover", async ({
  page
}) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDock(page);

  const newThreadButton = page.getByRole("button", { name: "New thread" });
  await expect(newThreadButton).toBeVisible();

  const restingStyles = await newThreadButton.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor
    };
  });

  expect(restingStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingStyles.borderColor).toBe("rgba(0, 0, 0, 0)");

  await newThreadButton.hover();
  await page.waitForTimeout(220);

  const hoverStyles = await newThreadButton.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor
    };
  });

  expect(hoverStyles.backgroundColor).toBe("rgba(255, 247, 238, 0.04)");
  expect(hoverStyles.borderColor).toBe("rgba(255, 247, 238, 0.08)");
});

test("language switcher persists the browser-local selection", async ({ page }) => {
  await installDockApiMock(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDock(page);

  const languageSwitch = page.locator(
    ".dock-stage-language-select .dock-select-trigger"
  );
  await expect(languageSwitch).toBeVisible();
  await languageSwitch.click();

  await page.getByRole("option", { name: "日本語" }).click();
  await expect(page.locator(".dock-search-input")).toHaveAttribute(
    "placeholder",
    "スレッドまたはプロジェクトを検索"
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator(".dock-stage-language-select .dock-select-value")
  ).toHaveText("日本語");
  await expect(page.locator(".dock-search-input")).toHaveAttribute(
    "placeholder",
    "スレッドまたはプロジェクトを検索"
  );
});
