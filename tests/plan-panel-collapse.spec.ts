import { expect, test } from "@playwright/test";

import { gotoDock, installDockApiMock } from "./support/dock-api-mock";

test("latest plan card above the composer can collapse and expand", async ({
  page
}) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-plan-collapse",
        preview: "Plan collapse",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774001200,
        updatedAt: 1774001205,
        status: { type: "idle" },
        path: null,
        cwd: "C:\\Users\\wo1fsea\\Documents\\codex_mw",
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Plan collapse thread",
        turns: [
          {
            id: "turn-plan-collapse",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-plan-collapse",
                content: [{ type: "text", text: "Check the latest plan.", text_elements: [] }]
              },
              {
                type: "plan",
                id: "plan-collapse",
                text:
                  "1. Add a collapse control for the composer plan card.\n2. Keep the summary visible when collapsed.\n3. Verify the interaction in Playwright.",
                explanation:
                  "The current card is useful, but it should not permanently occupy composer space.",
                steps: [
                  {
                    step: "Add a collapse control for the composer plan card.",
                    status: "completed"
                  },
                  {
                    step: "Keep the summary visible when collapsed.",
                    status: "inProgress"
                  },
                  {
                    step: "Verify the interaction in Playwright.",
                    status: "pending"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const panel = page.locator(".dock-composer-plan-panel");
  const card = panel.locator(".dock-plan-card");
  const toggle = card.getByRole("button", { name: "Toggle task visibility" });
  const summary = card.locator(".dock-plan-card-summary");

  await expect(card).toBeVisible();
  await expect(card).toContainText("3 tasks, 1 completed");
  await expect(card.locator(".dock-plan-row")).toHaveCount(3);
  await expect(card).toContainText("The current card is useful");
  const initialSummaryBox = await summary.boundingBox();
  const initialToggleBox = await toggle.boundingBox();
  expect(initialSummaryBox).not.toBeNull();
  expect(initialToggleBox).not.toBeNull();
  expect(initialToggleBox!.x).toBeGreaterThan(initialSummaryBox!.x);

  await toggle.click();

  await expect(card.locator(".dock-plan-row")).toHaveCount(0);
  await expect(card.locator(".dock-plan-card-explanation")).toHaveCount(0);
  await expect(card).toContainText("3 tasks, 1 completed");

  const collapsedLayout = await page.evaluate(() => {
    const card = document.querySelector(".dock-composer-plan-panel .dock-plan-card");
    const composer = document.querySelector(".dock-composer-panel");
    const cardRect = card?.getBoundingClientRect() ?? null;
    const composerRect = composer?.getBoundingClientRect() ?? null;
    const spacerStyle = card ? getComputedStyle(card, "::after") : null;

    return {
      cardBottom: cardRect ? Math.round(cardRect.bottom) : null,
      composerTop: composerRect ? Math.round(composerRect.top) : null,
      gap:
        cardRect && composerRect
          ? Math.round(composerRect.top - cardRect.bottom)
          : null,
      collapsedSpacerHeight: spacerStyle
        ? Math.round(parseFloat(spacerStyle.height || "0"))
        : null
    };
  });

  expect(collapsedLayout.cardBottom).not.toBeNull();
  expect(collapsedLayout.composerTop).not.toBeNull();
  expect(collapsedLayout.gap).not.toBeNull();
  expect(collapsedLayout.collapsedSpacerHeight).not.toBeNull();
  expect(collapsedLayout.collapsedSpacerHeight!).toBe(0);
  expect(collapsedLayout.gap!).toBeLessThanOrEqual(12);

  await toggle.click();

  await expect(card.locator(".dock-plan-row")).toHaveCount(3);
  await expect(card).toContainText("Verify the interaction in Playwright.");

  const alignment = await page.evaluate(() => {
    const body = document.querySelector(".dock-composer-plan-panel .dock-plan-card-body");
    const explanation = document.querySelector(
      ".dock-composer-plan-panel .dock-plan-card-explanation"
    );
    const firstStatus = document.querySelector(
      ".dock-composer-plan-panel .dock-plan-row-status"
    );
    const firstIndex = document.querySelector(
      ".dock-composer-plan-panel .dock-plan-row-index"
    );
    const firstStep = document.querySelector(
      ".dock-composer-plan-panel .dock-plan-row-copy"
    );

    return {
      bodyLeft: body ? Math.round(body.getBoundingClientRect().left) : null,
      explanationTextLeft: explanation
        ? Math.round(
            explanation.getBoundingClientRect().left +
              parseFloat(getComputedStyle(explanation).paddingLeft || "0")
          )
        : null,
      statusLeft: firstStatus ? Math.round(firstStatus.getBoundingClientRect().left) : null,
      indexLeft: firstIndex ? Math.round(firstIndex.getBoundingClientRect().left) : null,
      stepLeft: firstStep ? Math.round(firstStep.getBoundingClientRect().left) : null
    };
  });

  expect(alignment.bodyLeft).not.toBeNull();
  expect(alignment.explanationTextLeft).not.toBeNull();
  expect(alignment.statusLeft).not.toBeNull();
  expect(alignment.indexLeft).not.toBeNull();
  expect(alignment.stepLeft).not.toBeNull();
  expect(alignment.statusLeft!).toBeLessThan(alignment.indexLeft!);
  expect(alignment.indexLeft!).toBeLessThan(alignment.stepLeft!);
  expect(alignment.stepLeft! - alignment.bodyLeft!).toBeGreaterThanOrEqual(30);
  expect(Math.abs(alignment.stepLeft! - alignment.explanationTextLeft!)).toBeLessThanOrEqual(1);
});

test("plan header stays pinned while task content scrolls", async ({ page }) => {
  const longSteps = Array.from({ length: 18 }, (_, index) => ({
    step: `Scrollable plan step ${index + 1}`,
    status: index < 3 ? "completed" : index === 3 ? "inProgress" : "pending"
  }));

  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-plan-sticky",
        preview: "Plan sticky",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774002200,
        updatedAt: 1774002205,
        status: { type: "idle" },
        path: null,
        cwd: "C:\\Users\\wo1fsea\\Documents\\codex_mw",
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Plan sticky thread",
        turns: [
          {
            id: "turn-plan-sticky",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-plan-sticky",
                content: [{ type: "text", text: "Keep the header pinned.", text_elements: [] }]
              },
              {
                type: "plan",
                id: "plan-sticky",
                text: longSteps.map((step, index) => `${index + 1}. ${step.step}`).join("\n"),
                explanation: "The plan header should remain visible while the steps scroll.",
                steps: longSteps
              }
            ]
          }
        ]
      }
    ]
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const panel = page.locator(".dock-composer-plan-panel");
  const header = panel.locator(".dock-plan-card-head");
  const body = panel.locator(".dock-plan-card-body");

  await expect(panel).toBeVisible();
  await expect(body).toBeVisible();

  const headerBefore = await header.boundingBox();
  expect(headerBefore).not.toBeNull();

  const scrollTop = await body.evaluate((element) => {
    element.scrollTop = 160;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);

  const headerAfter = await header.boundingBox();
  expect(headerAfter).not.toBeNull();
  expect(Math.abs(headerAfter!.y - headerBefore!.y)).toBeLessThanOrEqual(1);
});

test("mobile task panel keeps the last task above the overlapping composer shell", async ({
  page
}) => {
  const mobileSteps = Array.from({ length: 12 }, (_, index) => ({
    step:
      index === 11
        ? "Final mobile clearance step with enough copy to wrap across multiple lines and expose bottom overlap if the scroll body ends too close to the composer shell."
        : `Mobile clearance step ${index + 1}`,
    status: index < 2 ? "completed" : index === 2 ? "inProgress" : "pending"
  }));

  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-plan-mobile-clearance",
        preview: "Plan mobile clearance",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774003200,
        updatedAt: 1774003205,
        status: { type: "idle" },
        path: null,
        cwd: "C:\\Users\\wo1fsea\\Documents\\codex_mw",
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Plan mobile clearance thread",
        turns: [
          {
            id: "turn-plan-mobile-clearance",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-plan-mobile-clearance",
                content: [
                  {
                    type: "text",
                    text: "Keep the mobile task body readable above the composer.",
                    text_elements: []
                  }
                ]
              },
              {
                type: "plan",
                id: "plan-mobile-clearance",
                text: mobileSteps.map((step, index) => `${index + 1}. ${step.step}`).join("\n"),
                explanation:
                  "The last visible task should stop above the overlapped composer shell on mobile.",
                steps: mobileSteps
              }
            ]
          }
        ]
      }
    ]
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".dock-sidebar-tools .dock-mobile-only").evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  const panel = page.locator(".dock-composer-plan-panel");
  const card = panel.locator(".dock-plan-card");
  const body = panel.locator(".dock-plan-card-body");

  await expect(panel).toBeVisible();
  await expect(card).toBeVisible();
  await expect(body).toBeVisible();

  const metrics = await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;

    const card = document.querySelector(".dock-composer-plan-panel .dock-plan-card");
    const composer = document.querySelector(".dock-composer-panel");
    const lastStep = document.querySelector(
      ".dock-composer-plan-panel .dock-plan-row:last-child .dock-plan-row-copy"
    );
    const composerRect = composer?.getBoundingClientRect() ?? null;
    const lastStepRect = lastStep?.getBoundingClientRect() ?? null;
    const bodyStyle = getComputedStyle(element);
    const spacerStyle = card ? getComputedStyle(card, "::after") : null;

    return {
      scrollTop: Math.round(element.scrollTop),
      maxScroll: Math.round(element.scrollHeight - element.clientHeight),
      bodyPaddingBottom: Math.round(parseFloat(bodyStyle.paddingBottom || "0")),
      spacerHeight: spacerStyle
        ? Math.round(parseFloat(spacerStyle.height || "0"))
        : null,
      composerTop: composerRect ? Math.round(composerRect.top) : null,
      lastStepBottom: lastStepRect ? Math.round(lastStepRect.bottom) : null,
      clearance:
        composerRect && lastStepRect
          ? Math.round(composerRect.top - lastStepRect.bottom)
          : null
    };
  });

  expect(metrics.maxScroll).toBeGreaterThan(0);
  expect(metrics.scrollTop).toBeGreaterThanOrEqual(metrics.maxScroll - 1);
  expect(metrics.bodyPaddingBottom).toBeLessThanOrEqual(16);
  expect(metrics.spacerHeight).not.toBeNull();
  expect(metrics.spacerHeight!).toBeGreaterThanOrEqual(60);
  expect(metrics.composerTop).not.toBeNull();
  expect(metrics.lastStepBottom).not.toBeNull();
  expect(metrics.clearance).not.toBeNull();
  expect(metrics.lastStepBottom!).toBeLessThan(metrics.composerTop!);
  expect(metrics.clearance!).toBeGreaterThanOrEqual(12);
});
