# Codexy Specification

## Product Goal

Codexy is a Tailscale-first web control plane for Codex on a host machine. The open-source app should also be able to run in a self-hosted cloud mode from the same `codexy` entrypoint. It should feel visually close to Codex Desktop while remaining usable on desktop, iPad, and phone. The first working release must support:

- listing all threads across projects
- opening any live thread and reading full history
- creating a new thread
- continuing an existing thread
- archiving and unarchiving threads from the sidebar
- sending prompts with image attachments
- switching models before a turn
- choosing a permission preset before a turn
- streaming assistant output and command output live
- approving command execution and file changes from the web UI
- surfacing `request_user_input` prompts
- warning when the web client is about to take over a thread that may already be active elsewhere
- opening a host terminal for the selected thread workspace without leaving the current stage
- opening a linked node workspace from cloud mode without requiring the node to expose a directly reachable browser address
- authenticating self-hosted cloud dashboard access and node linking with a single Google Authenticator-compatible 6-digit code model

The canonical UI contract lives in [visual-spec.md](./visual-spec.md). Product and engineering changes that affect presentation must follow that document.

## Non-Goals For The First Slice

- multi-user access control
- internet/public exposure outside Tailscale
- exact 1:1 recreation of every Codex Desktop pane
- audio/realtime speech support
- plugin/automation editing flows

## Architecture

### Frontend

- Framework: Next.js app router
- Transport: HTTP JSON + Server-Sent Events
- Layout: desktop three-column shell, tablet split shell, phone stacked drawer flow

### Backend

- Runs inside the Next.js server runtime.
- Talks to `codex app-server` over local WebSocket JSON-RPC.
- Starts the bridge process automatically unless an external bridge URL is configured.
- Uses Tailscale LocalAPI for host status and serve configuration. On platforms where LocalAPI is not directly reachable from Node, the host adapter may establish a local proxy first.
- In self-hosted cloud mode, the browser-facing cloud API can proxy node API requests through an outbound node connector instead of relying on direct browser-to-node reachability.
- In self-hosted cloud mode, the browser dashboard requires a one-time TOTP binding flow on first open, then regular TOTP-backed login sessions for subsequent access.

### Codex Integration

- Primary integration path: `codex app-server`
- Required protocol calls:
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
- Required server request handling:
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - `item/tool/requestUserInput`

## Directory Framework

```text
codexy/
├─ agents.md
├─ docs/
│  ├─ spec.md
│  └─ visual-spec.md
├─ package.json
├─ next.config.ts
├─ tsconfig.json
├─ src/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ cloud/auth/login/route.ts
│  │  │  ├─ cloud/auth/logout/route.ts
│  │  │  ├─ cloud/auth/setup/route.ts
│  │  │  ├─ cloud/connectors/poll/route.ts
│  │  │  ├─ cloud/connectors/responses/route.ts
│  │  │  ├─ cloud/connectors/streams/route.ts
│  │  │  ├─ cloud/status/route.ts
│  │  │  ├─ cloud/nodes/route.ts
│  │  │  ├─ cloud/nodes/[nodeId]/route.ts
│  │  │  ├─ cloud/nodes/[nodeId]/proxy/[...path]/route.ts
│  │  │  ├─ events/route.ts
│  │  │  ├─ models/route.ts
│  │  │  ├─ requests/[requestId]/route.ts
│  │  │  ├─ status/route.ts
│  │  │  ├─ terminal/sessions/route.ts
│  │  │  ├─ terminal/sessions/[sessionId]/route.ts
│  │  │  ├─ terminal/sessions/[sessionId]/events/route.ts
│  │  │  ├─ terminal/sessions/[sessionId]/input/route.ts
│  │  │  ├─ terminal/sessions/[sessionId]/interrupt/route.ts
│  │  │  ├─ threads/route.ts
│  │  │  ├─ threads/[threadId]/route.ts
│  │  │  ├─ threads/[threadId]/interrupt/route.ts
│  │  │  ├─ threads/[threadId]/turns/route.ts
│  │  │  ├─ uploads/route.ts
│  │  │  └─ uploads/[uploadId]/route.ts
│  │  ├─ auth/login/page.tsx
│  │  ├─ auth/setup/page.tsx
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  ├─ nodes/[nodeId]/page.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  ├─ cloud-app.tsx
│  │  └─ dock-app.tsx
│  └─ lib/
│     ├─ cloud-auth-http.ts
│     ├─ cloud-auth.ts
│     ├─ cloud-registry.ts
│     ├─ cloud-tunnel.ts
│     ├─ codex/
│     │  ├─ bridge.ts
│     │  ├─ env.ts
│     │  ├─ protocol.ts
│     │  └─ types.ts
│     ├─ runtime-mode.ts
│     ├─ tailscale.ts
│     └─ uploads.ts
└─ public/
```

## Data Contracts

### Thread Summary

- id
- name
- preview
- cwd
- source
- status
- createdAt
- updatedAt
- modelProvider
- gitInfo

### Thread Detail

- thread summary fields
- turns[]
- each turn contains ordered thread items
- live client state may overlay incomplete in-flight items on top of server state

### Approval Request

- requestId
- threadId
- turnId
- itemId
- method
- available decisions or answer schema
- human-readable context for command, file change, or user-input prompt
- turn detail payloads may include optional `startedAt`, `completedAt`, and `durationMs` metadata for transcript-only UI treatments such as processed-step disclosures

## Interaction Rules

### New Thread

1. User selects a project path plus optional model and permission preset.
2. UI uploads image files first, producing local host paths.
3. Server calls `thread/start`.
4. Server calls `turn/start` with text + `localImage` inputs.
5. If the thread has no explicit title yet, the server seeds an initial thread name from the first prompt preview so Codex Desktop can index the new session consistently.
6. UI listens on SSE and renders incremental events until `turn/completed`.

### Existing Thread

1. User opens a thread.
2. Server reads full thread detail via `thread/read`.
3. Before a new turn, the bridge calls `thread/resume` if the thread is not already live in the current bridge session.
4. Server maps the selected permission preset onto the underlying approval-policy and sandbox settings for the resumed thread / new turn so continued threads honor the current web control settings.
5. Server calls `turn/start`.
6. UI renders `item/started`, delta notifications, approval requests, then `item/completed` and `turn/completed`.

### Stage Terminal

1. User opens a thread and toggles terminal mode from the stage header.
2. Browser creates a host terminal session through `/api/terminal/sessions`.
3. Browser switches the stage body from transcript/composer mode to the embedded terminal surface with a directional slide-in that stays inside the same stage plane.
4. Browser streams terminal events from `/api/terminal/sessions/{sessionId}/events` and posts command input back through the terminal session routes.
5. Leaving terminal mode runs a matching slide-out transition before closing that host terminal session and restoring the normal thread stage.

### Archived Thread

1. Archived threads remain visible in listings when the active archive filter includes them.
2. Archived sidebar rows do not open the transcript directly.
3. Archived sidebar rows only expose an unarchive action.
4. A thread must be unarchived before it can re-enter the transcript flow from the sidebar.

### Takeover Warning

- If a selected thread reports active/in-progress state or emits events not initiated by the current browser session, the UI shows a takeover warning bar before the next prompt is sent.

## Visual Direction

- Deep charcoal base similar to Codex Desktop, but warmer and cleaner for touch.
- Strong column separation on desktop.
- Large touch targets on iPad and phone.
- Composer remains docked to the bottom on all breakpoints.
- Terminal and tool output use monospace framing distinct from chat text.

## Deployment Model

- Default local production runtime binds to `0.0.0.0:3000`.
- Default self-hosted cloud runtime binds to `0.0.0.0:3400`.
- Default local development runtime binds to `0.0.0.0:3001`.
- Development mode must allow the machine's active non-loopback hosts plus Tailnet DNS names to reach Next dev assets and websocket endpoints, so remote `http://<tailscale-ip>:3001` access hydrates and interactive controls keep working.
- On startup/status load, the server should best-effort ensure the node's LocalAPI serve config points the root `https://<node>.ts.net/` route at Codexy's local `127.0.0.1:3000` backend when no existing serve config is present.
- Recommended remote access is the served HTTPS URL on the node's `.ts.net` name when serve is available, otherwise the direct Tailscale IP with `:3000`.
- UI should prefer showing the actual served tailnet URL, otherwise the direct Tailscale IP with `:3000`, instead of a bare DNS name.
- In cloud mode, Codexy should expose a self-hosted dashboard for linked nodes, keep node registration local to the deployment, and proxy node API access through an outbound connector when the node is not directly reachable from the browser.
- Self-hosted cloud access should bind a Google Authenticator-compatible TOTP secret on first open, require TOTP login before showing linked nodes, and require the same current 6-digit code when a node runs `codexy link <cloud-url>`.

## First Implementation Slice

1. Project scaffold and bridge singleton
2. Thread list and thread detail APIs
3. Responsive shell UI
4. New thread + resume thread turns
5. SSE streaming of item and delta events
6. Approval handling
7. Image upload mapping to `localImage`
