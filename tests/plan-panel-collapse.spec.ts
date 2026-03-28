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

  await expect(card).toBeVisible();
  await expect(card).toContainText("3 tasks, 1 completed");
  await expect(toggle).toContainText("Hide tasks");
  await expect(card.locator(".dock-plan-row")).toHaveCount(3);
  await expect(card).toContainText("The current card is useful");

  await toggle.click();

  await expect(toggle).toContainText("Show tasks");
  await expect(card.locator(".dock-plan-row")).toHaveCount(0);
  await expect(card.locator(".dock-plan-card-explanation")).toHaveCount(0);
  await expect(card).toContainText("3 tasks, 1 completed");

  await toggle.click();

  await expect(toggle).toContainText("Hide tasks");
  await expect(card.locator(".dock-plan-row")).toHaveCount(3);
  await expect(card).toContainText("Verify the interaction in Playwright.");
});
