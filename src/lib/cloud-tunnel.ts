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
};

type ResponseWaiter = {
  resolve: (value: CloudTunnelBufferedResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
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
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;

function fromBase64(value: string | null | undefined) {
  if (!value) {
    return new Uint8Array();
  }

  return Buffer.from(value, "base64");
}

function createStreamState(cleanup: () => void): StreamState {
  const state: StreamState = {
    controller: null,
    queue: [],
    closed: false,
    stream: new ReadableStream<Uint8Array>({
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
    })
  };

  return state;
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

    return await new Promise<CloudTunnelBufferedResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseWaiters.delete(requestId);
        reject(new Error("Timed out waiting for the linked node to respond."));
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.responseWaiters.set(requestId, {
        resolve,
        reject,
        timeout
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
    const streamState = createStreamState(() => {
      this.streams.delete(streamId);
    });

    this.streams.set(streamId, streamState);

    const head = await new Promise<CloudTunnelPendingHead>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.headWaiters.delete(requestId);
        this.streams.delete(streamId);
        reject(new Error("Timed out waiting for the linked node stream to start."));
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.headWaiters.set(requestId, {
        resolve,
        reject,
        timeout
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
      return queued.shift() ?? null;
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
      headWaiter.resolve(buffered);
      return;
    }

    const responseWaiter = this.responseWaiters.get(input.requestId);
    if (!responseWaiter) {
      return;
    }

    clearTimeout(responseWaiter.timeout);
    this.responseWaiters.delete(input.requestId);
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
      waiter.resolve(request);
      return;
    }

    const queued = this.queuedRequests.get(request.nodeId) ?? [];
    queued.push(request);
    this.queuedRequests.set(request.nodeId, queued);
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
