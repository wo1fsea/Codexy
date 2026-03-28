# Engineering Governance

This document defines the engineering rules that sit below the product spec and above day-to-day implementation details. Its job is to keep the codebase easy to change without letting convenience blur ownership boundaries.

## Source Of Truth Stack

Use the smallest document set that answers the current question:

- `agents.md`: runtime ownership boundaries and mandatory repository workflow
- `docs/engineering-governance.md`: code orthogonality, simplicity, dependency direction, and context discipline
- `spec.md`: product behavior and required integration surface
- `visual-spec.md`: normative UI contract for layout, density, and interaction

If a change updates a rule in one layer, update the matching source-of-truth document in the same patch.

## Layer Map

### `src/components/**`

- Owns rendering, local interaction state, and presentation-only helpers.
- May consume normalized view models and translated strings.
- Must not talk to the Codex bridge directly.
- Must not read or write host files, upload storage, or Tailscale state except through server-shaped payloads.

### `src/app/api/**`

- Owns HTTP request parsing, validation, response shaping, and multi-adapter orchestration.
- Should stay thin: parse input, call the owning library, shape the response, return errors consistently.
- Must not absorb bridge protocol details that belong in `src/lib/codex/**`.

### `src/lib/codex/**`

- Owns JSON-RPC protocol handling, bridge lifecycle, request correlation, event normalization, and Codex-facing types.
- Should expose stable, app-level methods rather than pushing raw protocol details upward.
- Must not depend on React components, JSX, or browser-specific state.

### `src/lib/uploads.ts`

- Owns host-local upload persistence, path resolution, and public URL mapping.
- Must not absorb Codex thread logic or UI formatting.

### `src/lib/tailscale.ts`

- Owns host reachability inspection and Tailscale status summaries.
- Must remain independent from bridge and upload logic.

### `tests/**`

- Owns behavioral verification.
- Test helpers may fake production contracts, but they should mirror real ownership seams instead of bypassing them.

## Orthogonality Rules

- Each module should have one primary reason to change.
- Prefer boundary mapping over boundary leakage. Raw upstream payloads should be normalized once, close to the integration boundary.
- Do not create shared "utils" just to avoid a few repeated lines. Shared code is justified only when the abstraction is stable and the consumers truly share the same concept.
- If a function needs knowledge from two unrelated layers, that is a design smell. Move the function to the owning boundary or split the behavior.
- Keep data contracts explicit. Passing large, weakly typed bags of fields across layers increases coupling and context load.

## Simplicity Rules

- Choose the smallest change that preserves the documented contract.
- Prefer straightforward control flow over generic machinery.
- Keep route handlers thin, bridge methods cohesive, and components focused on rendering plus local UX state.
- Resist opportunistic refactors during feature or bug work unless they are required for safety or the current plan is updated.
- Small local duplication is acceptable when the alternative is a premature abstraction or cross-layer dependency.

## Context Governance

- Start from the ownership docs before reading large amounts of code.
- Load only the files needed for the task; avoid sweeping repo-wide context unless the task actually spans the repo.
- Keep task plans narrow and explicit about scope, verification, and completion gate.
- When a new invariant matters for future work, document it in the nearest source-of-truth doc instead of leaving it implicit in code or review comments.
- Avoid mixing behavior work, API shape changes, UI restyling, and broad cleanup in one patch. Separate concerns unless a single patch is necessary and planned.

## Documentation Sync Rules

Update docs in the same patch when you change:

- ownership boundaries or dependency direction
- browser-facing API contracts
- Codex bridge integration assumptions
- workflow or verification requirements
- UI contract, spacing, or interaction invariants

## Change Checklist

Before calling a task complete, confirm:

1. The change lives in the layer that owns it.
2. No raw protocol or host-specific detail leaked upward for convenience.
3. The implementation stayed simple instead of introducing speculative abstraction.
4. Relevant source-of-truth docs were updated if the change introduced a new invariant.
5. Verification evidence was written under `output/tasks/<task-id>/`.
