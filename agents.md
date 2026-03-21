# Codex Dock Agents

Codex Dock is organized around a small set of runtime agents and ownership boundaries. This file defines what each agent is allowed to do and where it should stop.

## 1. Dock Web Client

- Owns responsive rendering for desktop, iPad, and phone.
- Renders thread lists, live turn output, approval cards, image attachments, and model controls.
- Does not talk to `codex` directly.
- Only uses HTTP APIs and the bridge event stream exposed by the Dock server.

## 2. Dock API Server

- Owns the public web surface under Tailscale.
- Validates request payloads, handles file uploads, shapes UI data, and exposes SSE for live session updates.
- Is the only layer allowed to call the Codex bridge.
- Must keep browser-facing payloads stable even if Codex protocol details change underneath.

## 3. Codex Bridge

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

- Baseline changes: `npm run verify`
- Frontend layout or interaction changes: `npm run verify:e2e`

Completion gate:

- Plan matches delivered scope
- Implementation is finished
- Verification passed
- Verification artifacts were written
- Remaining failures, if any, are explicitly called out as blockers rather than silently skipped
