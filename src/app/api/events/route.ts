import { getRuntimeAdapter } from "@/lib/runtime/registry";
import type { RuntimeBridgeEvent } from "@/lib/runtime/types";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function writeSse(event: RuntimeBridgeEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId") ?? undefined;
  const runtime = getRuntimeAdapter();

  await runtime.ensureConnected();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pendingRequests = runtime.getPendingServerRequests(threadId);

      controller.enqueue(
        writeSse({
          type: "connection",
          status: "connected"
        })
      );

      for (const pending of pendingRequests) {
        controller.enqueue(
          writeSse({
            type: "server-request",
            request: pending
          })
        );
      }

      const unsubscribe = runtime.subscribe((event) => {
        if (
          threadId &&
          event.type !== "connection" &&
          "threadId" in event &&
          event.threadId &&
          event.threadId !== threadId
        ) {
          return;
        }

        if (
          threadId &&
          event.type === "server-request" &&
          event.request.threadId &&
          event.request.threadId !== threadId
        ) {
          return;
        }

        controller.enqueue(writeSse(event));
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
