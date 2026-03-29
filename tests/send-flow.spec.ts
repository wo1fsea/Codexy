import { expect, test, type Page } from "@playwright/test";

import {
  DEFAULT_CWD,
  gotoDock,
  installDockApiMock
} from "./support/dock-api-mock";

const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

const VALID_PNG_BYTES = Array.from(
  Buffer.from(
    VALID_PNG_BASE64,
    "base64"
  )
);

const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BASE64}`;

async function pasteImageIntoComposer(page: Page, fileName: string) {
  const composer = page.locator("textarea.dock-composer-input");

  await composer.evaluate(
    (element, payload: { bytes: number[]; fileName: string }) => {
      const file = new File([new Uint8Array(payload.bytes)], payload.fileName, {
        type: "image/png"
      });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const event = new Event("paste", {
        bubbles: true,
        cancelable: true
      });

      Object.defineProperty(event, "clipboardData", {
        value: dataTransfer
      });

      element.dispatchEvent(event);
    },
    {
      bytes: VALID_PNG_BYTES,
      fileName
    }
  );
}

async function chooseSelectOption(
  page: Page,
  ariaLabel: string,
  optionLabel: string
) {
  await page.getByRole("button", { name: ariaLabel }).click();
  await page.getByRole("option", { name: optionLabel }).click();
}

async function choosePermissionPreset(page: Page, optionLabel: string) {
  await chooseSelectOption(page, "Permission mode", optionLabel);
}

test("sending a prompt enters transcript context immediately", async ({ page }) => {
  await installDockApiMock(page);

  const prompt =
    process.env.PLAYWRIGHT_SEND_FLOW_PROMPT ?? `composer send flow ${Date.now()}`;

  await gotoDock(page);
  await page.locator("textarea.dock-composer-input").fill(prompt);
  await expect(page.locator("button.dock-send-button")).toBeEnabled();
  await page.locator("button.dock-send-button").click();

  await expect(page.locator(".dock-hero")).toHaveCount(0);
  await expect(page.locator(".dock-transcript")).toBeVisible();
  await expect(page.locator(".dock-stage-title")).toContainText(prompt);
  await expect(page.locator(".dock-transcript")).toContainText(prompt);
  await expect(page.locator(".dock-composer-shell")).toBeVisible();
  await expect(page.locator("textarea.dock-composer-input")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-thread-row").first()).toBeVisible();
  await page.locator(".dock-thread-row").first().click();

  await expect(page.locator(".dock-stage-title")).not.toHaveText("New thread");
  await expect(page.locator(".dock-composer-shell")).toBeVisible();
  await expect(page.locator("textarea.dock-composer-input")).toBeVisible();

  const layout = await page.evaluate(() => {
    const scroll = document.querySelector(".dock-stage-scroll");
    const bottomDock = document.querySelector(".dock-bottom-dock");
    const composer = document.querySelector(".dock-composer-shell");
    const transcript = document.querySelector(".dock-transcript");

    if (!scroll || !bottomDock || !composer || !transcript) {
      return null;
    }

    const scrollRect = scroll.getBoundingClientRect();
    const bottomRect = bottomDock.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const transcriptRect = transcript.getBoundingClientRect();

    return {
      scrollBottom: Math.round(scrollRect.bottom),
      bottomTop: Math.round(bottomRect.top),
      bottomBottom: Math.round(bottomRect.bottom),
      composerTop: Math.round(composerRect.top),
      composerBottom: Math.round(composerRect.bottom),
      composerLeft: Math.round(composerRect.left),
      composerRight: Math.round(composerRect.right),
      transcriptLeft: Math.round(transcriptRect.left),
      transcriptRight: Math.round(transcriptRect.right)
    };
  });

  expect(layout).not.toBeNull();
  expect(layout!.scrollBottom).toBe(layout!.bottomTop);
  expect(layout!.composerTop).toBeGreaterThanOrEqual(layout!.bottomTop);
  expect(layout!.composerBottom).toBeLessThanOrEqual(layout!.bottomBottom);
  expect(Math.abs(layout!.composerLeft - layout!.transcriptLeft)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout!.composerRight - layout!.transcriptRight)).toBeLessThanOrEqual(2);
});

test("rapid session switching stays responsive while older thread reads are still pending", async ({
  page
}) => {
  await installDockApiMock(page, {
    detailDelaysMs: {
      "thread-switch-a": 700,
      "thread-switch-b": 450,
      "thread-switch-c": 25
    },
    threads: [
      {
        id: "thread-switch-a",
        preview: "slow session alpha",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "slow session alpha",
        turns: []
      },
      {
        id: "thread-switch-b",
        preview: "slow session beta",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000001,
        updatedAt: 1774003601,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "slow session beta",
        turns: []
      },
      {
        id: "thread-switch-c",
        preview: "fast session gamma",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000002,
        updatedAt: 1774003602,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "fast session gamma",
        turns: []
      }
    ]
  });

  await gotoDock(page);

  const alphaRow = page.locator(".dock-thread-row", {
    hasText: "slow session alpha"
  });
  const betaRow = page.locator(".dock-thread-row", {
    hasText: "slow session beta"
  });
  const gammaRow = page.locator(".dock-thread-row", {
    hasText: "fast session gamma"
  });

  await alphaRow.click();
  await page.waitForTimeout(40);
  await betaRow.click();
  await page.waitForTimeout(40);
  await gammaRow.click();

  await expect(page.locator(".dock-stage-title")).toContainText("fast session gamma");

  await betaRow.click();
  await expect(page.locator(".dock-stage-title")).toContainText("slow session beta");
  await expect(page.locator("textarea.dock-composer-input")).toBeVisible();
  await expect(page.locator("button.dock-send-button")).toBeVisible();
});

test("pasting an image into composer creates an attachment chip", async ({ page }) => {
  await installDockApiMock(page);
  await gotoDock(page);

  await pasteImageIntoComposer(page, "clipboard-image.png");

  await expect(page.locator(".dock-upload-chip")).toContainText("clipboard-image.png");
});

test("new thread sends the full access permission preset", async ({
  page
}) => {
  await installDockApiMock(page);
  await gotoDock(page);

  await choosePermissionPreset(page, "Full access permission");
  await page.locator("textarea.dock-composer-input").fill("permission wiring");

  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/threads" && request.method() === "POST";
  });

  await page.locator("button.dock-send-button").click();

  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({
    prompt: "permission wiring",
    approvalPolicy: "never",
    sandbox: "danger-full-access"
  });
});

test("existing thread sends the default permission preset mapping", async ({
  page
}) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-permission-controls",
        preview: "permission controls",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000100,
        updatedAt: 1774000200,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "permission controls",
        turns: []
      }
    ]
  });

  await gotoDock(page);
  await page.getByRole("button", { name: /permission controls/i }).click();
  await expect(page.locator(".dock-stage-title")).toContainText("permission controls");

  await choosePermissionPreset(page, "Default permission");
  await page.locator("textarea.dock-composer-input").fill("continue permissions");

  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/threads/thread-permission-controls/turns" &&
      request.method() === "POST"
    );
  });

  await page.locator("button.dock-send-button").click();

  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({
    prompt: "continue permissions",
    approvalPolicy: "on-request",
    sandbox: "workspace-write"
  });
});

test("image attachments render as thumbnails without raw data urls", async ({ page }) => {
  await installDockApiMock(page);

  const prompt = `playwright image render ${Date.now()}`;

  await gotoDock(page);
  await page.locator("textarea.dock-composer-input").fill(prompt);
  await pasteImageIntoComposer(page, "thumbnail-image.png");

  await expect(page.locator(".dock-upload-chip")).toContainText("thumbnail-image.png");
  await page.locator("button.dock-send-button").click();

  const attachmentTile = page.locator(".dock-user-attachment-tile").first();
  await expect(attachmentTile).toBeVisible();
  await expect(page.getByText(/data:image\/png;base64/i)).toHaveCount(0);

  await attachmentTile.click();
  await expect(page.locator(".dock-lightbox")).toBeVisible();
  await expect(page.locator(".dock-lightbox-image")).toBeVisible();
});

test("assistant image items render image cards and lightbox previews", async ({ page }) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-assistant-images-1",
        preview: "assistant image render",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "assistant image render",
        turns: [
          {
            id: "turn-assistant-images-1",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "item-user",
                content: [
                  {
                    type: "text",
                    text: "show me the generated images",
                    text_elements: []
                  }
                ]
              },
              {
                type: "imageView",
                id: "item-image-view",
                title: "Assistant preview",
                url: VALID_PNG_DATA_URL
              },
              {
                type: "imageGeneration",
                id: "item-image-generation",
                result: {
                  caption: "Generated concept",
                  b64_json: VALID_PNG_BASE64
                }
              },
              {
                type: "agentMessage",
                id: "item-agent",
                text: "Here are the image results.",
                phase: "final_answer"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  await expect(page.locator(".dock-assistant-image-button")).toHaveCount(2);
  await expect(page.locator(".dock-assistant-image-caption")).toContainText([
    "Assistant preview",
    "Generated concept"
  ]);
  await expect(page.locator(".dock-image-artifact pre")).toHaveCount(0);

  await page.locator(".dock-assistant-image-button").nth(1).click();
  await expect(page.locator(".dock-lightbox")).toBeVisible();
  await expect(page.locator(".dock-lightbox-caption")).toContainText(
    "Generated concept"
  );
});

test("assistant image items without a usable source fall back to the raw artifact view", async ({
  page
}) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-assistant-image-fallback-1",
        preview: "assistant image fallback",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "assistant image fallback",
        turns: [
          {
            id: "turn-assistant-image-fallback-1",
            status: "completed",
            error: null,
            items: [
              {
                type: "imageView",
                id: "item-image-view-fallback",
                prompt: "no renderable source"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  await expect(page.locator(".dock-assistant-image-button")).toHaveCount(0);
  const artifact = page.locator(".dock-artifact").filter({ hasText: "Image View" }).first();
  await expect(artifact).toContainText("no renderable source");
});

test("file change items render compact edit summaries from raw diffs", async ({ page }) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-filechange-1",
        preview: "file change summary",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "file change summary",
        turns: [
          {
            id: "turn-filechange-1",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "item-user",
                content: [
                  {
                    type: "text",
                    text: "show me the edit summary",
                    text_elements: []
                  }
                ]
              },
              {
                type: "fileChange",
                id: "item-file-change",
                status: "completed",
                changes: [
                  {
                    path: `${DEFAULT_CWD}\\src\\components\\dock-app.tsx`,
                    kind: {
                      type: "update",
                      move_path: null
                    },
                    diff: "@@ -1,1 +1,3 @@\n-old line\n+new line\n+another new line\n"
                  }
                ]
              },
              {
                type: "agentMessage",
                id: "item-agent",
                text: "done",
                phase: "final_answer"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const chip = page.locator(".dock-filechange-chip").first();
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Edited");
  await expect(chip).toContainText("dock-app.tsx");
  await expect(chip).toContainText("+2");
  await expect(chip).toContainText("-1");
});

test("archiving the current thread jumps back to new thread and removes it from the live list", async ({
  page
}) => {
  const archivedThreadName = `archive target ${Date.now()}`;

  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-archive-1",
        preview: archivedThreadName,
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: archivedThreadName,
        turns: [
          {
            id: "turn-archive-1",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "item-user",
                content: [
                  {
                    type: "text",
                    text: "archive this thread",
                    text_elements: []
                  }
                ]
              },
              {
                type: "agentMessage",
                id: "item-agent",
                text: "ready",
                phase: "final_answer"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await expect(page.locator(".dock-thread-row")).toHaveCount(1);
  await page.locator(".dock-thread-row").first().click();
  await expect(page.locator(".dock-stage-title")).toHaveText(archivedThreadName);

  await page.locator(".dock-toolbar-confirm-shell > button.dock-icon-button").click();
  await expect(page.locator(".dock-toolbar-confirm-popover")).toBeVisible();
  await page
    .locator(".dock-toolbar-confirm-popover .dock-request-action.is-primary")
    .click();

  await expect(page.locator(".dock-stage-title")).toHaveText("New thread");
  await expect(page.locator(".dock-hero")).toBeVisible();
  await expect(page.locator(".dock-thread-row")).toHaveCount(0);
  await expect(page.locator(".dock-empty-sidebar")).toContainText("No matching threads");
});

test("approval buttons submit the matching server request payload", async ({ page }) => {
  const requestBodies: Array<Record<string, unknown>> = [];

  await installDockApiMock(page, {
    events: [
      { type: "connection", status: "connected" },
      {
        type: "server-request",
        request: {
          requestId: "req-approval-1",
          rpcId: 32,
          method: "item/commandExecution/requestApproval",
          threadId: "thread-approval-1",
          params: {
            threadId: "thread-approval-1",
            turnId: "turn-approval-1",
            itemId: "cmd-approval-1",
            command: "\"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe\" -Command Get-Date",
            cwd: DEFAULT_CWD
          }
        }
      }
    ],
    threads: [
      {
        id: "thread-approval-1",
        preview: "approval request",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "active", activeFlags: ["waitingOnApproval"] },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "approval request",
        turns: [
          {
            id: "turn-approval-1",
            status: "inProgress",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "item-user",
                content: [
                  {
                    type: "text",
                    text: "run Get-Date",
                    text_elements: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  });

  await page.route("**/api/requests/req-approval-1", async (route) => {
    requestBodies.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const card = page.locator(".dock-request-card").first();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Allow once" }).click();

  await expect.poll(() => requestBodies.length).toBe(1);
  expect(requestBodies[0]).toEqual({
    payload: {
      decision: "accept"
    },
    rpcId: 32,
    threadId: "thread-approval-1",
    method: "item/commandExecution/requestApproval"
  });
  await expect(card).toHaveCount(0);
});

test("command execution items keep a visible expand control and reveal output", async ({
  page
}) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-command-expand",
        preview: "command execution",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000100,
        updatedAt: 1774000400,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "command execution",
        turns: [
          {
            id: "turn-command-expand",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-command-expand",
                content: [{ type: "text", text: "run Get-Date", text_elements: [] }]
              },
              {
                type: "commandExecution",
                id: "command-expand",
                command: "Get-Date",
                cwd: DEFAULT_CWD,
                processId: "2456",
                status: "completed",
                commandActions: [],
                aggregatedOutput: "Sunday, March 29, 2026 10:45:00 AM",
                exitCode: 0,
                durationMs: 1200
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const card = page.locator(".dock-command-card");
  const summary = card.locator(".dock-command-summary");
  const toggle = card.locator(".dock-command-toggle");
  const detail = card.locator(".dock-command-detail");

  await expect(card).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(detail).toBeHidden();

  await summary.click();

  await expect.poll(() =>
    card.evaluate((element) => (element as HTMLDetailsElement).open)
  ).toBe(true);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(DEFAULT_CWD);
  await expect(detail).toContainText("Sunday, March 29, 2026");
});

test("latest plan renders above the composer instead of inside the transcript", async ({
  page
}) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-plan-1",
        preview: "todo plan",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774003600,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "todo plan",
        turns: [
          {
            id: "turn-plan-0",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "item-user-0",
                content: [
                  {
                    type: "text",
                    text: "show me the old todo plan",
                    text_elements: []
                  }
                ]
              },
              {
                type: "plan",
                id: "item-plan-0",
                text:
                  "1. Old plan that should stay out of the transcript.\n2. Another stale task.",
                explanation: "stale",
                steps: [
                  {
                    step: "Old plan that should stay out of the transcript.",
                    status: "completed"
                  },
                  {
                    step: "Another stale task.",
                    status: "completed"
                  }
                ]
              }
            ]
          },
          {
            id: "turn-plan-1",
            status: "inProgress",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "item-user",
                content: [
                  {
                    type: "text",
                    text: "show me the todo plan",
                    text_elements: []
                  }
                ]
              },
              {
                type: "plan",
                id: "item-plan",
                text:
                  "1. Restore gap parity with the current UI and isolate the root cause.\n2. Fix the Playwright startup flow and dev config so the current page can launch.\n3. Run targeted and full verify:e2e, then keep iterating if anything fails.",
                explanation: null,
                steps: [
                  {
                    step: "Restore gap parity with the current UI and isolate the root cause.",
                    status: "inProgress"
                  },
                  {
                    step: "Fix the Playwright startup flow and dev config so the current page can launch.",
                    status: "pending"
                  },
                  {
                    step: "Run targeted and full verify:e2e, then keep iterating if anything fails.",
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

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const card = page.locator(".dock-composer-plan-panel .dock-plan-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("3 tasks, 0 completed");
  await expect(card.locator(".dock-plan-row")).toHaveCount(3);
  await expect(card).toContainText("Restore gap parity with the current UI");
  await expect(card).toContainText("Run targeted and full verify:e2e");
  await expect(card).not.toContainText("Old plan that should stay out of the transcript");
  await expect(page.locator(".dock-transcript .dock-plan-card")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const planPanel = document.querySelector(".dock-composer-plan-panel");
    const composerInput = document.querySelector(".dock-composer-input");
    const transcriptPlanCards = document.querySelectorAll(
      ".dock-transcript .dock-plan-card"
    ).length;
    const planRect = planPanel?.getBoundingClientRect() ?? null;
    const inputRect = composerInput?.getBoundingClientRect() ?? null;

    return {
      transcriptPlanCards,
      planTop: planRect ? Math.round(planRect.top) : null,
      planBottom: planRect ? Math.round(planRect.bottom) : null,
      inputTop: inputRect ? Math.round(inputRect.top) : null
    };
  });

  expect(layout.transcriptPlanCards).toBe(0);
  expect(layout.planTop).not.toBeNull();
  expect(layout.planBottom).not.toBeNull();
  expect(layout.inputTop).not.toBeNull();
  expect(layout.planTop!).toBeLessThan(layout.inputTop!);
  expect(layout.planBottom!).toBeLessThanOrEqual(layout.inputTop! + 14);
});

test("scroll to bottom button appears and jumps transcript to the end", async ({ page }) => {
  const longThreadTurns = Array.from({ length: 18 }, (_, index) => ({
    id: `turn-scroll-${index + 1}`,
    status: "completed",
    error: null,
    items: [
      {
        type: "userMessage",
        id: `user-scroll-${index + 1}`,
        content: [
          {
            type: "text",
            text: `Prompt ${index + 1}`,
            text_elements: []
          }
        ]
      },
      {
        type: "agentMessage",
        id: `agent-scroll-${index + 1}`,
        text:
          `Response block ${index + 1}. ` +
          "This line is intentionally long so the transcript grows and becomes scrollable.",
        phase: "final_answer"
      }
    ]
  }));

  await installDockApiMock(page, {
    threads: [
      {
        id: "thread-scroll-button",
        preview: "scroll jump control",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774000500,
        status: { type: "idle" },
        path: null,
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Scroll Jump Thread",
        turns: longThreadTurns
      }
    ]
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();
  await expect(page.locator(".dock-transcript")).toBeVisible();

  await page.evaluate(() => {
    const body = document.querySelector(".dock-stage-scroll-body") as HTMLElement | null;
    if (!body) {
      return;
    }

    if (!body.querySelector('[data-testid="scroll-spacer"]')) {
      const spacer = document.createElement("div");
      spacer.setAttribute("data-testid", "scroll-spacer");
      spacer.style.height = "1400px";
      body.appendChild(spacer);
    }
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const scroll = document.querySelector(".dock-stage-scroll") as HTMLElement | null;
        if (!scroll) {
          return 0;
        }

        return Math.round(scroll.scrollHeight - scroll.clientHeight);
      });
    })
    .toBeGreaterThan(100);

  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const scroll = document.querySelector(".dock-stage-scroll") as HTMLElement | null;
        if (!scroll) {
          return false;
        }

        scroll.scrollTop = 0;
        scroll.dispatchEvent(new Event("scroll"));
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        return Boolean(document.querySelector(".dock-scroll-bottom-button"));
      });
    })
    .toBe(true);

  const jumpButton = page.getByRole("button", { name: "Jump to bottom" });
  await expect(jumpButton).toBeVisible();
  await jumpButton.click();

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const scroll = document.querySelector(".dock-stage-scroll") as HTMLElement | null;
        if (!scroll) {
          return null;
        }
        return Math.round(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
      });
    })
    .toBeLessThanOrEqual(4);
  await expect(jumpButton).toBeHidden();
});

test("agent messages render markdown links and formatting", async ({ page }) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "test-markdown-thread",
        preview: "markdown preview",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774000001,
        status: { type: "idle" },
        path: "C:\\Users\\wo1fsea\\.codex\\sessions\\test.jsonl",
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "vscode",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Markdown Render Test",
        turns: [
          {
            id: "turn-markdown",
            status: "completed",
            error: null,
            items: [
              {
                type: "agentMessage",
                id: "msg-markdown",
                text:
                  "The latest service is live at [http://localhost:3001](http://localhost:3001).\n\n- First item\n- Second item\n\n`inline code`",
                phase: "final_answer"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const markdownLink = page.locator('.dock-markdown a[href="http://localhost:3001"]');
  await expect(markdownLink).toHaveText("http://localhost:3001");
  await expect(page.locator(".dock-markdown ul li")).toHaveCount(2);
  await expect(page.locator(".dock-markdown code")).toContainText("inline code");
  await expect(page.getByText("[http://localhost:3001](http://localhost:3001)")).toHaveCount(0);
});

test("thinking indicator animates while there is no visible output", async ({ page }) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "test-thinking-visible",
        preview: "thinking",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774000001,
        status: { type: "active", activeFlags: [] },
        path: "C:\\Users\\wo1fsea\\.codex\\sessions\\thinking.jsonl",
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "vscode",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Thinking Visible",
        turns: [
          {
            id: "turn-thinking-visible",
            status: "inProgress",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-thinking",
                content: [{ type: "text", text: "hey", text_elements: [] }]
              },
              {
                type: "reasoning",
                id: "reasoning-thinking",
                summary: [],
                content: ["thinking"]
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  const thinkingStatus = page.locator(".dock-thinking-status");
  await expect(thinkingStatus).toBeVisible();
  await expect(thinkingStatus).toContainText("Thinking");
  await expect(page.locator(".dock-thinking-ellipsis span")).toHaveCount(3);

  const animationNames = await page.evaluate(() => {
    const label = document.querySelector(".dock-thinking-label");
    const dot = document.querySelector(".dock-thinking-ellipsis span");

    return {
      label: label ? getComputedStyle(label).animationName : null,
      dot: dot ? getComputedStyle(dot).animationName : null
    };
  });

  expect(animationNames.dot).toContain("dock-thinking-dot");
});

test("thinking indicator stays visible for punctuation-only streamed output", async ({ page }) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "test-thinking-punctuation",
        preview: "thinking punctuation",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774000001,
        status: { type: "active", activeFlags: [] },
        path: "C:\\Users\\wo1fsea\\.codex\\sessions\\thinking-punctuation.jsonl",
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "vscode",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Thinking Punctuation",
        turns: [
          {
            id: "turn-thinking-punctuation",
            status: "inProgress",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-thinking-punctuation",
                content: [{ type: "text", text: "hey", text_elements: [] }]
              },
              {
                type: "reasoning",
                id: "reasoning-thinking-punctuation",
                summary: [],
                content: ["thinking"]
              },
              {
                type: "agentMessage",
                id: "agent-thinking-punctuation",
                text: ".",
                phase: "commentary"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  await expect(page.locator(".dock-thinking-status")).toBeVisible();
  await expect(page.locator(".dock-agent-response")).toHaveCount(0);
});

test("thinking indicator hides once visible assistant output exists", async ({ page }) => {
  await installDockApiMock(page, {
    threads: [
      {
        id: "test-thinking-hidden",
        preview: "thinking hidden",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774000001,
        status: { type: "active", activeFlags: [] },
        path: "C:\\Users\\wo1fsea\\.codex\\sessions\\thinking-hidden.jsonl",
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "vscode",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Thinking Hidden",
        turns: [
          {
            id: "turn-thinking-hidden",
            status: "inProgress",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-thinking-hidden",
                content: [{ type: "text", text: "hey", text_elements: [] }]
              },
              {
                type: "reasoning",
                id: "reasoning-thinking-hidden",
                summary: [],
                content: ["thinking"]
              },
              {
                type: "agentMessage",
                id: "agent-thinking-hidden",
                text: "Output has started.",
                phase: "commentary"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.locator(".dock-thread-row").first().click();

  await expect(page.locator(".dock-thinking-status")).toHaveCount(0);
  await expect(page.locator(".dock-reasoning-status")).toHaveCount(0);
  await expect(page.locator(".dock-agent-response")).toContainText("Output has started.");
});

test("switching threads ignores stale thread detail responses", async ({ page }) => {
  await installDockApiMock(page, {
    detailDelaysMs: {
      "thread-stale-a": 800,
      "thread-stale-b": 50
    },
    threads: [
      {
        id: "thread-stale-a",
        preview: "active thread",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000000,
        updatedAt: 1774000200,
        status: { type: "active", activeFlags: [] },
        path: "C:\\Users\\wo1fsea\\.codex\\sessions\\thread-a.jsonl",
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "vscode",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Active Thread",
        turns: [
          {
            id: "turn-a",
            status: "inProgress",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-a",
                content: [{ type: "text", text: "A", text_elements: [] }]
              },
              {
                type: "agentMessage",
                id: "agent-a",
                text: "Active thread content",
                phase: "commentary"
              }
            ]
          }
        ]
      },
      {
        id: "thread-stale-b",
        preview: "stable thread",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: 1774000001,
        updatedAt: 1774000100,
        status: { type: "idle" },
        path: "C:\\Users\\wo1fsea\\.codex\\sessions\\thread-b.jsonl",
        cwd: DEFAULT_CWD,
        cliVersion: "0.112.0",
        source: "vscode",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Stable Thread",
        turns: [
          {
            id: "turn-b",
            status: "completed",
            error: null,
            items: [
              {
                type: "userMessage",
                id: "user-b",
                content: [{ type: "text", text: "B", text_elements: [] }]
              },
              {
                type: "agentMessage",
                id: "agent-b",
                text: "Stable thread content",
                phase: "final_answer"
              }
            ]
          }
        ]
      }
    ]
  });

  await gotoDock(page);
  await page.getByText("Active Thread", { exact: true }).click();
  await page.getByText("Stable Thread", { exact: true }).click();

  await page.waitForTimeout(1200);

  await expect(page.locator(".dock-stage-title")).toContainText("Stable Thread");
  await expect(page.locator(".dock-transcript")).toContainText("Stable thread content");
  await expect(page.locator(".dock-transcript")).not.toContainText("Active thread content");
});
