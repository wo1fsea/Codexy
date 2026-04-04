# Codex App-Server Protocol Completion Plan

## Scope

This document tracks the current `codex app-server` integration surface in Codexy, reviews the completed web UI interactions that already ship, and defines the remaining protocol and UI work needed to move closer to full v2 compatibility.

This plan is implementation planning for `codexy-app`. It does not redefine the product contract in `spec.md`; it records completion status and the next delivery slices.

This plan is intentionally multi-runtime aware. Codexy may later support additional agent CLI backends, so protocol completion work must not keep expanding raw Codex protocol assumptions through the API layer or UI.

## Review Summary

### Completed integration surface

Codexy currently implements the following request path through the local bridge:

- `initialize`
- `thread/list`
- `thread/read`
- `thread/start`
- `thread/resume`
- `thread/name/set`
- `thread/archive`
- `thread/unarchive`
- `turn/start`
- `turn/interrupt`
- `model/list`

Codexy currently handles these server-initiated requests:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`
- `execCommandApproval`
- `applyPatchApproval`

Codexy currently applies explicit UI-side handling for these live notifications:

- `serverRequest/resolved`
- `thread/started`
- `thread/closed`
- `thread/name/updated`
- `thread/status/changed`
- `thread/archived`
- `thread/unarchived`
- `turn/started`
- `turn/completed`
- `turn/plan/updated`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `item/plan/delta`
- `item/reasoning/textDelta`
- `item/reasoning/summaryTextDelta`
- `item/commandExecution/outputDelta`

### Completed UI interactions with test coverage

The current dock already has strong coverage for the first product slice. Existing Playwright coverage confirms:

- send flow and immediate transcript entry
- Enter and Alt+Enter composer behavior
- stage terminal entry, exit, and line-editing interactions
- image paste and attachment chips
- permission preset mapping for new and existing threads
- image rendering for user attachments and assistant image items
- context compaction presentation
- processed-step disclosure cards for command and file-change items
- archive and unarchive interactions in the sidebar
- approval card rendering and request submission
- latest-plan card placement above the composer
- scroll-to-bottom transcript affordance
- markdown rendering in agent messages
- thinking indicator visibility rules
- stale thread-response protection during rapid switching

### Main review findings

1. Missing `item/permissions/requestApproval` handling is a protocol compatibility gap.
   Impact: turns that depend on the built-in permissions flow cannot complete in the web client because no approval UI is shown and no response is sent.

2. Missing `mcpServer/elicitation/request` handling is a protocol compatibility gap.
   Impact: MCP servers that interrupt a turn for structured client input cannot proceed in Codexy.

3. Missing `error`, `turn/diff/updated`, and `item/fileChange/outputDelta` UI handling leaves the live web transcript behind the app-server contract.
   Impact: users may miss intermediate failures, lose turn-level diff state, or see incomplete live patch feedback.

4. Missing `item/reasoning/summaryPartAdded` support means streamed reasoning summaries are flattened instead of preserving server-declared section boundaries.
   Impact: long reasoning summaries will not match the intended grouping from app-server.

5. The bridge request whitelist and UI event handling are both narrow and manually enumerated.
   Impact: every protocol addition currently requires touching multiple hard-coded branches, which increases the cost and risk of protocol completion work.

6. Current API routes and browser-facing types still depend directly on Codex bridge naming and semantics.
   Impact: adding a second agent CLI backend later would force a broad second refactor unless the runtime boundary is introduced first.

## Design Constraint For Future Backends

Codexy should treat `codex app-server` as one runtime adapter, not as the permanent shape of the product.

That means protocol work must follow these rules:

- API routes depend on a runtime adapter interface, not directly on `getCodexBridge()`
- UI state consumes canonical Codexy models and capability flags, not raw app-server method names
- Codex-specific history import remains runtime-specific
- protocol completion for Codex happens inside the Codex adapter after the boundary is in place
- later runtimes are allowed to support a smaller capability set without blocking the shared shell

## Current Coverage Snapshot

The current implementation is intentionally partial rather than generally compatible.

| Surface | Current state |
| --- | --- |
| runtime abstraction | none, API routes call Codex bridge directly |
| client requests | minimal dock slice only |
| server requests | approvals plus `request_user_input`, no permissions or MCP elicitation |
| notifications | core thread/turn/item stream only |
| item types | broad render fallback exists, but only a subset has dedicated live update handling |
| UI controls | strong first-slice coverage, weak advanced protocol coverage |

## Delivery Strategy

The work should proceed on two tracks:

1. establish a runtime adapter boundary without changing current behavior
2. complete missing Codex protocol support inside that adapter and the dock state reducers

The first track prevents protocol work from hardening Codex assumptions into the wrong layers. The second track still prioritizes turn-blocking gaps before feature expansion.

## Planned Delivery Slices

### Phase 0: Runtime boundary with no behavior change

Scope:

- add a runtime adapter contract under `src/lib/runtime/**`
- wrap the current Codex bridge in a `Codex` runtime adapter
- route API handlers through the runtime registry instead of importing `getCodexBridge()` directly
- keep the browser payload and current UI behavior unchanged

UI work:

- no new controls in this phase
- preserve current `Dock*` payload shapes while introducing a stable runtime boundary on the server side

Verification:

- `npm run verify`
- confirm existing routes still compile and behave through the same JSON shapes

### Phase 1: Compatibility gaps that can break active turns

Scope:

- add `item/permissions/requestApproval`
- add `mcpServer/elicitation/request`
- add `error`
- add `turn/diff/updated`
- add `item/fileChange/outputDelta`
- add `item/reasoning/summaryPartAdded`

Runtime work:

- implement new request and notification mappings inside the Codex adapter
- extend canonical request and event types only where the browser truly needs new data

UI work:

- add request cards and response payload mapping for permissions requests
- add request cards for MCP form and URL elicitations
- add explicit runtime error surfacing in the selected thread view
- add turn-level diff state in the dock transcript model
- update file-change cards to append streamed output deltas
- preserve reasoning summary section boundaries in the transcript view

Verification:

- targeted Playwright coverage for each newly handled request or notification
- regression pass on the existing send-flow suite

### Phase 2: Capability-aware UI and protocol routing

Scope:

- replace scattered method switches with central protocol registries
- define explicit runtime capabilities for approvals, diff streaming, review, fork, and local history import
- stop relying on implicit Codex-only assumptions in route and UI branching

UI work:

- derive request-card rendering from server-request descriptors where possible
- derive event application from dedicated reducers instead of a single large effect branch
- gate controls by capability instead of runtime-specific string checks

Verification:

- unit coverage for request and notification routing
- regression pass for existing dock interactions

### Phase 3: Core interaction parity with modern app-server flows

Scope:

- add `turn/steer`
- add `thread/fork`
- add `review/start`
- add `thread/compact/start`
- add `thread/shellCommand`
- add `thread/rollback`

Runtime work:

- implement these capabilities inside the Codex adapter first
- avoid assuming future runtimes will support the same set

UI work:

- add steer interaction for in-flight turns
- add fork action from selected thread context
- add review entrypoint and review-state rendering
- add explicit compact action in thread controls
- add user shell command entrypoint tied to the selected thread
- add rollback affordance with explicit confirmation

Verification:

- request/response API route coverage
- targeted end-to-end interaction coverage for each control

### Phase 4: Management and expansion surfaces

Scope:

- evaluate and selectively add `account/*`
- evaluate and selectively add `config/*`
- evaluate and selectively add `skills/*`, `app/list`, and plugin surfaces
- explicitly keep `thread/realtime/*` out of scope until there is a realtime product need
- evaluate what belongs in shared runtime capabilities versus Codex-only management UI

UI work:

- only add surfaces that have a concrete product owner and interaction design
- avoid exposing app-server management APIs without a clear mobile and desktop UX

Verification:

- route-level tests for any new management endpoint
- design review before shipping new settings or auth surfaces

## Delivery Order

Recommended order:

1. Phase 0 runtime boundary
2. Phase 1 compatibility gaps
3. Phase 2 capability-aware routing
4. Phase 3 core interaction parity
5. Phase 4 management and expansion surfaces

This ordering keeps turn-blocking protocol gaps ahead of new product affordances while still avoiding a second refactor when multi-runtime support arrives.
