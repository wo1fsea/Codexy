import { NextResponse } from "next/server";

import { getCodexBridge } from "@/lib/codex/bridge";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bridge = getCodexBridge();
    const archived = searchParams.get("archived");

    if (archived === "all") {
      const [live, archivedThreads] = await Promise.all([
        bridge.listThreads({
          limit: searchParams.get("limit")
            ? Number(searchParams.get("limit"))
            : 200,
          cursor: searchParams.get("cursor"),
          searchTerm: searchParams.get("search"),
          cwd: searchParams.get("cwd"),
          archived: false
        }),
        bridge.listThreads({
          limit: searchParams.get("limit")
            ? Number(searchParams.get("limit"))
            : 200,
          cursor: searchParams.get("cursor"),
          searchTerm: searchParams.get("search"),
          cwd: searchParams.get("cwd"),
          archived: true
        })
      ]);

      return NextResponse.json({
        data: [...live.data, ...archivedThreads.data].sort(
          (left, right) => right.updatedAt - left.updatedAt
        ),
        nextCursor: live.nextCursor ?? archivedThreads.nextCursor
      });
    }

    const response = await bridge.listThreads({
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : 200,
      cursor: searchParams.get("cursor"),
      searchTerm: searchParams.get("search"),
      cwd: searchParams.get("cwd"),
      archived: archived === "true"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list threads."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      cwd?: string | null;
      model?: string | null;
      reasoningEffort?: string | null;
      approvalPolicy?: "untrusted" | "on-failure" | "on-request" | "never";
      attachmentPaths?: string[];
    };

    if (!body.prompt?.trim() && !body.attachmentPaths?.length) {
      return NextResponse.json(
        { error: "Prompt or image attachment is required." },
        { status: 400 }
      );
    }

    const bridge = getCodexBridge();
    const result = await bridge.createThread({
      prompt: body.prompt ?? "",
      cwd: body.cwd ?? null,
      model: body.model ?? null,
      reasoningEffort: body.reasoningEffort ?? null,
      approvalPolicy: body.approvalPolicy ?? "on-request",
      attachmentPaths: body.attachmentPaths ?? []
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create thread."
      },
      { status: 500 }
    );
  }
}
