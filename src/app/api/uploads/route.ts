import { NextResponse } from "next/server";

import { storeFiles } from "@/lib/uploads";

export const runtime = "nodejs";

function isFileEntry(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFileEntry);

    if (!files.length) {
      return NextResponse.json(
        { error: "No files uploaded." },
        { status: 400 }
      );
    }

    const uploads = await storeFiles(files);
    return NextResponse.json({ uploads });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to store files."
      },
      { status: 500 }
    );
  }
}
