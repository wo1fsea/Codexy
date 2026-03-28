import { basename } from "node:path";
import { readFile } from "node:fs/promises";

import { getContentTypeForPath, resolveUploadPath } from "@/lib/uploads";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    uploadId: string;
  }>;
};

export async function GET(_: Request, context: Params) {
  try {
    const { uploadId } = await context.params;
    const filePath = await resolveUploadPath(uploadId);
    const body = await readFile(filePath);

    return new Response(body, {
      headers: {
        "Content-Type": getContentTypeForPath(filePath),
        "Content-Disposition": `inline; filename="${basename(filePath)}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Upload not found."
      },
      { status: 404 }
    );
  }
}
