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
