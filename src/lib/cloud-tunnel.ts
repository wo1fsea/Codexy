type CloudTunnelRequest = {
  requestId: string;
  nodeId: string;
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  bodyBase64: string | null;
  stream: boolean;
  streamId: string | null;
};

type CloudTunnelBufferedResponse = {
  kind: "buffered";
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
};

type CloudTunnelStreamResponse = {
  kind: "stream";
  status: number;
  headers: Record<string, string>;
  stream: ReadableStream<Uint8Array>;
};

type CloudTunnelPendingHead =
  | CloudTunnelBufferedResponse
  | {
      kind: "stream";
      status: number;
      headers: Record<string, string>;
      streamId: string;
    };

type HeadWaiter = {
  resolve: (value: CloudTunnelPendingHead) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  request: CloudTunnelRequest;
  createdAtMs: number;
};

type ResponseWaiter = {
  resolve: (value: CloudTunnelBufferedResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  request: CloudTunnelRequest;
  createdAtMs: number;
};

type PollWaiter = {
  resolve: (value: CloudTunnelRequest | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type StreamState = {
  stream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  queue: Uint8Array[];
  closed: boolean;
  request: CloudTunnelRequest;
  createdAtMs: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;

function fromBase64(value: string | null | undefined) {
  if (!value) {
    return new Uint8Array();
  }

  return Buffer.from(value, "base64");
}

function logCloudTunnel(event: string, details: Record<string, unknown>) {
  console.info(
    `[cloud-tunnel] ${JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...details
    })}`
  );
}

function createStreamState(
  request: CloudTunnelRequest,
  createdAtMs: number,
  cleanup: () => void
): StreamState {
  const state: {
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    queue: Uint8Array[];
    closed: boolean;
  } = {
    controller: null,
    queue: [],
    closed: false
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      state.controller = controller;
      while (state.queue.length) {
        controller.enqueue(state.queue.shift()!);
      }

      if (state.closed) {
        controller.close();
        cleanup();
      }
    },
    cancel() {
      state.closed = true;
      cleanup();
    }
  });

  return {
    ...state,
    stream,
    request,
    createdAtMs
  };
}

class CloudTunnelBroker {
  private queuedRequests = new Map<string, CloudTunnelRequest[]>();

  private pollWaiters = new Map<string, PollWaiter[]>();

  private responseWaiters = new Map<string, ResponseWaiter>();

  private headWaiters = new Map<string, HeadWaiter>();

  private streams = new Map<string, StreamState>();

  async request(input: Omit<CloudTunnelRequest, "requestId" | "stream" | "streamId">) {
    const requestId = crypto.randomUUID();
    const request: CloudTunnelRequest = {
      ...input,
      requestId,
      stream: false,
      streamId: null
    };
    const createdAtMs = Date.now();

    return await new Promise<CloudTunnelBufferedResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseWaiters.delete(requestId);
        logCloudTunnel("buffered-timeout", {
          requestId,
          nodeId: request.nodeId,
          method: request.method,
          path: `${request.path}${request.search || ""}`,
          waitedMs: Date.now() - createdAtMs
        });
        reject(new Error("Timed out waiting for the linked node to respond."));
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.responseWaiters.set(requestId, {
        resolve,
        reject,
        timeout,
        request,
        createdAtMs
      });
      logCloudTunnel("buffered-enqueue", {
        requestId,
        nodeId: request.nodeId,
        method: request.method,
        path: `${request.path}${request.search || ""}`
      });
      this.enqueueRequest(request);
    });
  }

  async requestStream(input: Omit<CloudTunnelRequest, "requestId" | "stream" | "streamId">) {
    const requestId = crypto.randomUUID();
    const streamId = crypto.randomUUID();
    const request: CloudTunnelRequest = {
      ...input,
      requestId,
      stream: true,
      streamId
    };
    const createdAtMs = Date.now();
    const streamState = createStreamState(request, createdAtMs, () => {
      this.streams.delete(streamId);
    });

    this.streams.set(streamId, streamState);

    const head = await new Promise<CloudTunnelPendingHead>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.headWaiters.delete(requestId);
        this.streams.delete(streamId);
        logCloudTunnel("stream-timeout", {
          requestId,
          streamId,
          nodeId: request.nodeId,
          method: request.method,
          path: `${request.path}${request.search || ""}`,
          waitedMs: Date.now() - createdAtMs
        });
        reject(new Error("Timed out waiting for the linked node stream to start."));
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.headWaiters.set(requestId, {
        resolve,
        reject,
        timeout,
        request,
        createdAtMs
      });
      logCloudTunnel("stream-enqueue", {
        requestId,
        streamId,
        nodeId: request.nodeId,
        method: request.method,
        path: `${request.path}${request.search || ""}`
      });
      this.enqueueRequest(request);
    });

    if (head.kind === "buffered") {
      this.streams.delete(streamId);
      return head;
    }

    return {
      kind: "stream",
      status: head.status,
      headers: head.headers,
      stream: streamState.stream
    } satisfies CloudTunnelStreamResponse;
  }

  async waitForNodeRequest(nodeId: string) {
    const queued = this.queuedRequests.get(nodeId);
    if (queued?.length) {
      const request = queued.shift() ?? null;
      if (request) {
        logCloudTunnel("dispatch-queued", {
          requestId: request.requestId,
          streamId: request.streamId,
          nodeId: request.nodeId,
          method: request.method,
          path: `${request.path}${request.search || ""}`,
          remainingQueueLength: queued.length
        });
      }
      return request;
    }

    return await new Promise<CloudTunnelRequest | null>((resolve) => {
      const timeout = setTimeout(() => {
        const waiters = this.pollWaiters.get(nodeId) ?? [];
        this.pollWaiters.set(
          nodeId,
          waiters.filter((entry) => entry.timeout !== timeout)
        );
        resolve(null);
      }, DEFAULT_POLL_TIMEOUT_MS);

      const waiters = this.pollWaiters.get(nodeId) ?? [];
      waiters.push({
        resolve,
        timeout
      });
      this.pollWaiters.set(nodeId, waiters);
    });
  }

  resolveBufferedResponse(input: {
    requestId: string;
    status: number;
    headers?: Record<string, string> | null;
    bodyBase64?: string | null;
  }) {
    const buffered: CloudTunnelBufferedResponse = {
      kind: "buffered",
      status: input.status,
      headers: input.headers ?? {},
      body: fromBase64(input.bodyBase64)
    };
    const headWaiter = this.headWaiters.get(input.requestId);

    if (headWaiter) {
      clearTimeout(headWaiter.timeout);
      this.headWaiters.delete(input.requestId);
      logCloudTunnel("buffered-response", {
        requestId: input.requestId,
        nodeId: headWaiter.request.nodeId,
        method: headWaiter.request.method,
        path: `${headWaiter.request.path}${headWaiter.request.search || ""}`,
        status: input.status,
        waitMs: Date.now() - headWaiter.createdAtMs
      });
      headWaiter.resolve(buffered);
      return;
    }

    const responseWaiter = this.responseWaiters.get(input.requestId);
    if (!responseWaiter) {
      return;
    }

    clearTimeout(responseWaiter.timeout);
    this.responseWaiters.delete(input.requestId);
    logCloudTunnel("buffered-response", {
      requestId: input.requestId,
      nodeId: responseWaiter.request.nodeId,
      method: responseWaiter.request.method,
      path: `${responseWaiter.request.path}${responseWaiter.request.search || ""}`,
      status: input.status,
      waitMs: Date.now() - responseWaiter.createdAtMs
    });
    responseWaiter.resolve(buffered);
  }

  resolveStreamHead(input: {
    requestId: string;
    streamId: string;
    status: number;
    headers?: Record<string, string> | null;
  }) {
    const headWaiter = this.headWaiters.get(input.requestId);
    if (!headWaiter) {
      return;
    }

    clearTimeout(headWaiter.timeout);
    this.headWaiters.delete(input.requestId);
    logCloudTunnel("stream-head", {
      requestId: input.requestId,
      streamId: input.streamId,
      nodeId: headWaiter.request.nodeId,
      method: headWaiter.request.method,
      path: `${headWaiter.request.path}${headWaiter.request.search || ""}`,
      status: input.status,
      waitMs: Date.now() - headWaiter.createdAtMs
    });
    headWaiter.resolve({
      kind: "stream",
      status: input.status,
      headers: input.headers ?? {},
      streamId: input.streamId
    });
  }

  appendStreamChunk(input: {
    streamId: string;
    chunkBase64?: string | null;
    done?: boolean | null;
    error?: string | null;
  }) {
    const state = this.streams.get(input.streamId);
    if (!state) {
      return;
    }

    if (input.chunkBase64) {
      const chunk = fromBase64(input.chunkBase64);
      if (state.controller) {
        state.controller.enqueue(chunk);
      } else {
        state.queue.push(chunk);
      }
    }

    if (!input.done && !input.error) {
      return;
    }

    state.closed = true;
    logCloudTunnel("stream-close", {
      requestId: state.request.requestId,
      streamId: input.streamId,
      nodeId: state.request.nodeId,
      method: state.request.method,
      path: `${state.request.path}${state.request.search || ""}`,
      reason: input.error ? "error" : "done",
      error: input.error || undefined,
      lifetimeMs: Date.now() - state.createdAtMs
    });

    if (state.controller) {
      if (input.error) {
        state.controller.error(new Error(input.error));
      } else {
        state.controller.close();
      }
      this.streams.delete(input.streamId);
    }
  }

  private enqueueRequest(request: CloudTunnelRequest) {
    const waiters = this.pollWaiters.get(request.nodeId) ?? [];
    const waiter = waiters.shift();

    if (waiter) {
      clearTimeout(waiter.timeout);
      if (waiters.length) {
        this.pollWaiters.set(request.nodeId, waiters);
      } else {
        this.pollWaiters.delete(request.nodeId);
      }
      logCloudTunnel("dispatch-live", {
        requestId: request.requestId,
        streamId: request.streamId,
        nodeId: request.nodeId,
        method: request.method,
        path: `${request.path}${request.search || ""}`
      });
      waiter.resolve(request);
      return;
    }

    const queued = this.queuedRequests.get(request.nodeId) ?? [];
    queued.push(request);
    this.queuedRequests.set(request.nodeId, queued);
    logCloudTunnel("queue-request", {
      requestId: request.requestId,
      streamId: request.streamId,
      nodeId: request.nodeId,
      method: request.method,
      path: `${request.path}${request.search || ""}`,
      queueLength: queued.length
    });
  }
}

declare global {
  var __codexyCloudTunnelBroker: CloudTunnelBroker | undefined;
}

export function getCloudTunnelBroker() {
  if (!globalThis.__codexyCloudTunnelBroker) {
    globalThis.__codexyCloudTunnelBroker = new CloudTunnelBroker();
  }

  return globalThis.__codexyCloudTunnelBroker;
}
