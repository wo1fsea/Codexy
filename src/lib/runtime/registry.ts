import { getCodexRuntimeAdapter } from "@/lib/runtime/adapters/codex";
import type { RuntimeAdapter } from "@/lib/runtime/contracts";
import type { RuntimeId } from "@/lib/runtime/types";

export function getRuntimeAdapter(runtimeId: RuntimeId = "codex"): RuntimeAdapter {
  switch (runtimeId) {
    case "codex":
      return getCodexRuntimeAdapter();
  }

  const unsupportedRuntimeId: never = runtimeId;
  throw new Error(`Unsupported runtime adapter: ${unsupportedRuntimeId}`);
}
