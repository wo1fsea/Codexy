import { getCodexBridge } from "@/lib/codex/bridge";
import type { DockBridgeEvent } from "@/lib/codex/types";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function writeSse(event: DockBridgeEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId") ?? undefined;
  const bridge = getCodexBridge();

  await bridge.ensureConnected();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pendingRequests = bridge.getPendingServerRequests(threadId);

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

      const unsubscribe = bridge.subscribe((event) => {
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
