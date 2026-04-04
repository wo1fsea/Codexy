# Codexy Agents

Codexy is organized around a small set of runtime agents and ownership boundaries. This file defines what each agent is allowed to do and where it should stop.

## 1. Codexy Web Client

- Owns responsive rendering for desktop, iPad, and phone.
- Renders thread lists, live turn output, approval cards, image attachments, and model controls.
- Does not talk to `codex` directly.
- Only uses HTTP APIs and the bridge event stream exposed by the Codexy server.

## 2. Codexy API Server

- Owns the public web surface under Tailscale.
- Validates request payloads, handles file uploads, shapes UI data, and exposes SSE for live session updates.
- Is the only layer allowed to call the Codex bridge.
- Must keep browser-facing payloads stable even if Codex protocol details change underneath.

## 3. Codexy Bridge

- Owns the connection to `codex app-server`.
- Starts `codex app-server` on demand when configured to do so, or attaches to an already-running bridge endpoint.
- Sends JSON-RPC requests for thread listing, thread reads, thread start/resume, turn start, interrupts, approvals, and model listing.
- Normalizes server notifications and server-initiated approval requests into Dock events.

## 4. Approval Mediator

- Owns command approval, file change approval, and `request_user_input` handling.
- Preserves the exact request context from Codex so the browser can show the same decision the desktop app would require.
- Must support session-scoped allow decisions where the protocol exposes them.

## 5. Attachment Broker

- Owns browser-uploaded image files.
- Stores uploaded files on the host machine and rewrites them into `localImage` inputs for Codex turns.
- Must keep file paths local-only and never expose raw host paths to other users.

## 6. Tailnet Edge

- Owns remote reachability via Tailscale.
- Prefers `tailscale serve` over direct LAN or public exposure.
- Surfaces current tailnet DNS name, active IPs, and deployment hints in the UI.

## 7. Transcript Cache

- Uses Codex thread data as the source of truth.
- May cache thread summaries or project groups for faster rendering.
- Must never become the primary state machine for live turns; realtime state comes from the bridge.

## Guardrails

- Live execution always flows through Codex protocol calls, never through ad hoc shell wrappers.
- Thread history reads may use cached data, but write actions must go through the bridge.
- Mobile approvals are enabled, but every destructive or privileged action must remain explicit in the UI.
- When desktop and web both touch the same thread, the web client warns and offers a visible "take over" action instead of silently racing.

## Security Rules

- **Auth bypass in production is strictly forbidden.** `CODEXY_DEV_SKIP_AUTH` must only take effect when `NODE_ENV !== "production"`. No env-var override, no flag, no exception may weaken this guard in a production build.
- This rule applies to all auth-related code paths in both codexy-app and codexy-cloud.

## Engineering Governance

- Keep dependency direction strict:
  - `src/components/**` renders UI and client state only. It must not call the bridge, filesystem, upload storage, or Tailscale adapters directly.
  - `src/app/api/**` owns HTTP parsing, validation, response shaping, and orchestration across backend adapters.
  - `src/lib/codex/**` owns Codex protocol, bridge lifecycle, and normalized runtime events. It must not depend on React components or browser-only formatting concerns.
  - `src/lib/uploads.ts` and `src/lib/tailscale.ts` stay as isolated host adapters rather than becoming general utility sinks.
- Favor orthogonal code:
  - Give each module one primary reason to change.
  - Prefer explicit boundary mappers instead of leaking raw upstream payloads through multiple layers.
  - If a helper needs knowledge of both UI concerns and bridge concerns, it belongs in a clearer boundary layer or should stay duplicated locally until a stable abstraction exists.
- Favor simple code over clever code:
  - Prefer thin route handlers, cohesive bridge methods, and focused components.
  - A small amount of local duplication is better than a shared abstraction that couples unrelated layers.
  - Do not introduce a reusable helper unless at least two real call sites share the same concept and lifecycle.
- Govern context explicitly:
  - Load only the code and docs required for the task at hand.
  - Keep plans narrow and update them before expanding scope.
  - Do not mix behavior changes, refactors, and documentation rewrites in one patch unless the plan is updated first.
- Keep docs aligned with reality:
  - When ownership boundaries, invariants, or contracts change, update the relevant source-of-truth docs in the same patch.
  - Use [docs/engineering-governance.md](./docs/engineering-governance.md) for the expanded engineering rules, [docs/spec.md](./docs/spec.md) for product behavior, and [docs/visual-spec.md](./docs/visual-spec.md) for UI contract changes.

## Required Change Workflow

Every repository change must follow this sequence:

1. Plan
2. Implement
3. Verify
4. Fix

Workflow rules:

- Do not edit code before the plan states the target scope, verification steps, and completion gate.
- Implementation must stay inside the planned scope unless the plan is updated first.
- No task is complete until required verification passes.
- If verification fails, return to Fix, address the failure, and rerun verification.
- Verification evidence must be written under `output/tasks/<task-id>/`.

Required verification:

- docs-only changes:
  - read the changed file once after editing
  - run `git status --short`
- first-run bootstrap or CLI changes:
  - `npm run verify:first-run`
  - `git status --short`
- Baseline changes: `npm run verify`
- Frontend layout or interaction changes: `npm run verify:e2e`
- New or changed user-facing functionality must also be exercised in a real browser:
  - use a real browser session against the local app, not only mocked assertions or static code review
  - confirm the changed behavior end to end in the browser
  - save at least one artifact under `output/playwright/`
  - record the browser verification in `output/tasks/<task-id>/`

Completion gate:

- Plan matches delivered scope
- Implementation is finished
- Verification passed
- Verification artifacts were written
- Remaining failures, if any, are explicitly called out as blockers rather than silently skipped
