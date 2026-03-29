import { expect, type Page, type Route } from "@playwright/test";

const VALID_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);

export const DEFAULT_CWD = "C:\\Users\\wo1fsea\\Documents\\codex_mw";

export const DEFAULT_STATUS = {
  bridge: { connected: true, pendingRequests: 0 },
  tailscale: {
    connected: true,
    backendState: "Running",
    dnsName: "test.tailnet.ts.net",
    hostName: "test-host",
    ips: ["100.64.0.1"],
    serveConfigured: true,
    tailnetUrl: "https://test.tailnet.ts.net",
    serveHint: "tailscale serve --bg 3000",
    error: null
  },
  cloud: {
    linked: false,
    url: null,
    linkedAt: null,
    nodeId: null,
    nodeName: null,
    configPath: "C:\\Users\\wo1fsea\\.codexy\\config.json",
    error: null
  },
  defaults: {
    cwd: DEFAULT_CWD,
    approvalPolicy: "on-request",
    sandbox: "workspace-write"
  },
  bridgeUrl: "ws://127.0.0.1:39031"
};

export const DEFAULT_MODELS = [
  {
    id: "gpt-5.4",
    model: "gpt-5.4",
    displayName: "gpt-5.4",
    description: "Latest frontier agentic coding model.",
    hidden: false,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: "medium",
    inputModalities: ["text", "image"],
    supportsPersonality: true,
    isDefault: true
  }
];

type MockThread = {
  id: string;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  createdAt: number;
  updatedAt: number;
  status: { type: string; activeFlags?: string[] };
  path: string | null;
  cwd: string;
  cliVersion: string;
  source: string;
  agentNickname: string | null;
  agentRole: string | null;
  gitInfo: Record<string, unknown> | null;
  name: string | null;
  turns: Array<Record<string, unknown>>;
};

type MockOptions = {
  detailDelaysMs?: Record<string, number>;
  events?: unknown[];
  models?: typeof DEFAULT_MODELS;
  status?: typeof DEFAULT_STATUS;
  threads?: MockThread[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createUserMessage(
  turnId: string,
  prompt: string,
  attachmentPaths: string[]
) {
  return {
    type: "userMessage",
    id: `optimistic-user:${turnId}`,
    content: [
      ...(prompt.trim()
        ? [
            {
              type: "text",
              text: prompt,
              text_elements: []
            }
          ]
        : []),
      ...attachmentPaths.map((path) => ({
        type: "localImage",
        path
      }))
    ]
  };
}

function createThreadSummary(thread: MockThread) {
  return {
    ...thread,
    turns: []
  };
}

function isArchivedThread(thread: MockThread) {
  return thread.source === "archive";
}

function matchesArchiveFilter(thread: MockThread, archived: string | null) {
  if (archived === "all") {
    return true;
  }

  if (archived === "true") {
    return isArchivedThread(thread);
  }

  return !isArchivedThread(thread);
}

function updateThreadOrder(order: string[], threadId: string) {
  return [threadId, ...order.filter((entry) => entry !== threadId)];
}

function getUploadNames(payload: string) {
  const matches = [...payload.matchAll(/filename="([^"]+)"/g)].map(
    (match) => match[1]
  );

  return matches.length ? matches : ["clipboard-image.png"];
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data)
  });
}

export async function installDockApiMock(page: Page, options: MockOptions = {}) {
  const status = clone(options.status ?? DEFAULT_STATUS);
  const models = clone(options.models ?? DEFAULT_MODELS);
  const events = clone(
    options.events ?? [{ type: "connection", status: "connected" }]
  );
  const detailDelaysMs = options.detailDelaysMs ?? {};
  const threadStore = new Map(
    (options.threads ?? []).map((thread) => [thread.id, clone(thread)] as const)
  );
  let threadOrder = (options.threads ?? []).map((thread) => thread.id);
  const uploadStore = new Map<
    string,
    {
      id: string;
      name: string;
      path: string;
      size: number;
      type: string;
      url: string;
    }
  >();
  let threadCounter = threadOrder.length;
  let turnCounter = 0;
  let uploadCounter = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const path = url.pathname;

    if (path === "/api/status" && method === "GET") {
      await fulfillJson(route, status);
      return;
    }

    if (path === "/api/models" && method === "GET") {
      await fulfillJson(route, { data: models });
      return;
    }

    if (path === "/api/events" && method === "GET") {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        },
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
      });
      return;
    }

    if (path === "/api/threads" && method === "GET") {
      const archived = url.searchParams.get("archived");
      const data = threadOrder
        .map((threadId) => threadStore.get(threadId))
        .filter((thread): thread is MockThread => Boolean(thread))
        .filter((thread) => matchesArchiveFilter(thread, archived))
        .map(createThreadSummary);

      await fulfillJson(route, { data, nextCursor: null });
      return;
    }

    if (path === "/api/threads" && method === "POST") {
      const body = (request.postDataJSON() ?? {}) as {
        attachmentPaths?: string[];
        cwd?: string | null;
        prompt?: string;
      };
      const prompt = body.prompt ?? "";
      const attachmentPaths = body.attachmentPaths ?? [];
      const threadId = `mock-thread-${++threadCounter}`;
      const turnId = `mock-turn-${++turnCounter}`;
      const timestamp = 1774000000 + threadCounter;
      const preview = prompt.trim() || "Image attachment";
      const thread: MockThread = {
        id: threadId,
        preview,
        ephemeral: false,
        modelProvider: "openai",
        createdAt: timestamp,
        updatedAt: timestamp,
        status: { type: "active", activeFlags: [] },
        path: null,
        cwd: body.cwd ?? status.defaults.cwd,
        cliVersion: "0.112.0",
        source: "session",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: preview,
        turns: [
          {
            id: turnId,
            status: "inProgress",
            error: null,
            items: [createUserMessage(turnId, prompt, attachmentPaths)]
          }
        ]
      };

      threadStore.set(threadId, thread);
      threadOrder = updateThreadOrder(threadOrder, threadId);

      await fulfillJson(route, {
        thread: createThreadSummary(thread),
        turn: thread.turns[0]
      });
      return;
    }

    const turnsMatch = path.match(/^\/api\/threads\/([^/]+)\/turns$/);
    if (turnsMatch && method === "POST") {
      const threadId = decodeURIComponent(turnsMatch[1]);
      const thread = threadStore.get(threadId);

      if (!thread) {
        await fulfillJson(route, { error: "Thread not found." }, 404);
        return;
      }

      const body = (request.postDataJSON() ?? {}) as {
        attachmentPaths?: string[];
        prompt?: string;
      };
      const prompt = body.prompt ?? "";
      const attachmentPaths = body.attachmentPaths ?? [];
      const turnId = `mock-turn-${++turnCounter}`;
      const turn = {
        id: turnId,
        status: "inProgress",
        error: null,
        items: [createUserMessage(turnId, prompt, attachmentPaths)]
      };

      thread.turns.push(turn);
      thread.updatedAt += 1;
      thread.status = { type: "active", activeFlags: [] };
      threadOrder = updateThreadOrder(threadOrder, threadId);

      await fulfillJson(route, { turn });
      return;
    }

    const interruptMatch = path.match(/^\/api\/threads\/([^/]+)\/interrupt$/);
    if (interruptMatch && method === "POST") {
      await fulfillJson(route, { ok: true });
      return;
    }

    const threadMatch = path.match(/^\/api\/threads\/([^/]+)$/);
    if (threadMatch) {
      const threadId = decodeURIComponent(threadMatch[1]);
      const thread = threadStore.get(threadId);

      if (!thread) {
        await fulfillJson(route, { error: "Thread not found." }, 404);
        return;
      }

      if (method === "GET") {
        const delayMs = detailDelaysMs[threadId] ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        await fulfillJson(route, { thread: clone(thread) });
        return;
      }

      if (method === "PATCH") {
        const body = (request.postDataJSON() ?? {}) as {
          archived?: boolean;
          name?: string;
        };

        if (typeof body.name === "string") {
          thread.name = body.name;
          thread.preview = body.name;
        }

        if (typeof body.archived === "boolean") {
          thread.source = body.archived ? "archive" : "session";
        }

        thread.updatedAt += 1;
        threadOrder = updateThreadOrder(threadOrder, threadId);

        await fulfillJson(route, { thread: clone(thread) });
        return;
      }
    }

    if (path === "/api/uploads" && method === "POST") {
      const payload = request.postDataBuffer()?.toString("utf8") ?? "";
      const uploads = getUploadNames(payload).map((name) => {
        const id = `mock-upload-${++uploadCounter}`;
        const upload = {
          id,
          name,
          path: `${DEFAULT_CWD}\\.codexy\\uploads\\${id}`,
          size: VALID_PNG_BUFFER.length,
          type: "image/png",
          url: `/api/uploads/${id}`
        };

        uploadStore.set(id, upload);
        return upload;
      });

      await fulfillJson(route, { uploads });
      return;
    }

    const uploadMatch = path.match(/^\/api\/uploads\/([^/]+)$/);
    if (uploadMatch && method === "GET") {
      const uploadId = decodeURIComponent(uploadMatch[1]);
      if (!uploadStore.has(uploadId)) {
        await fulfillJson(route, { error: "Upload not found." }, 404);
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: VALID_PNG_BUFFER
      });
      return;
    }

    await fulfillJson(
      route,
      { error: `Unhandled mocked route: ${method} ${path}` },
      500
    );
  });
}

export async function gotoDock(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForDock(page);
}

export async function waitForDock(page: Page) {
  await expect(page.locator("textarea.dock-composer-input")).toBeVisible();
  await expect(
    page.locator(".dock-composer-select .dock-select-value")
  ).toHaveText("gpt-5.4");
}
