import { getHostTerminalManager } from "@/lib/host-terminal";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

function encodeSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const afterSeq = Number(new URL(request.url).searchParams.get("afterSeq") || "0");
  const manager = getHostTerminalManager();
  const encoder = new TextEncoder();

  try {
    const stream = new ReadableStream({
      start(controller) {
        const replay = manager.replay(sessionId, Number.isFinite(afterSeq) ? afterSeq : 0);
        for (const event of replay) {
          controller.enqueue(encoder.encode(encodeSse(event)));
        }

        const unsubscribe = manager.subscribe(sessionId, (event) => {
          controller.enqueue(encoder.encode(encodeSse(event)));
        });
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15000);

        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
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
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to open terminal stream."
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
