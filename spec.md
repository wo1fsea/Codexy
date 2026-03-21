# Codexy Specification

## Product Goal

Codexy is a Tailscale-first web control plane for Codex on a host machine. It should feel visually close to Codex Desktop while remaining usable on desktop, iPad, and phone. The first working release must support:

- listing all threads across projects
- opening any thread and reading full history
- creating a new thread
- continuing an existing thread
- sending prompts with image attachments
- switching models before a turn
- streaming assistant output and command output live
- approving command execution and file changes from the web UI
- surfacing `request_user_input` prompts
- warning when the web client is about to take over a thread that may already be active elsewhere

The canonical UI contract lives in [visual-spec.md](C:\Users\wo1fsea\Documents\codex_mw\visual-spec.md). Product and engineering changes that affect presentation must follow that document.

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
- Uses Tailscale CLI only for host status reporting.

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
├─ spec.md
├─ package.json
├─ next.config.ts
├─ tsconfig.json
├─ src/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ events/route.ts
│  │  │  ├─ models/route.ts
│  │  │  ├─ requests/[requestId]/route.ts
│  │  │  ├─ status/route.ts
│  │  │  ├─ threads/route.ts
│  │  │  ├─ threads/[threadId]/route.ts
│  │  │  ├─ threads/[threadId]/interrupt/route.ts
│  │  │  ├─ threads/[threadId]/turns/route.ts
│  │  │  └─ uploads/route.ts
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  └─ dock-app.tsx
│  └─ lib/
│     ├─ codex/
│     │  ├─ bridge.ts
│     │  ├─ env.ts
│     │  ├─ protocol.ts
│     │  └─ types.ts
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

## Interaction Rules

### New Thread

1. User selects a project path and optional model.
2. UI uploads image files first, producing local host paths.
3. Server calls `thread/start`.
4. Server calls `turn/start` with text + `localImage` inputs.
5. UI listens on SSE and renders incremental events until `turn/completed`.

### Existing Thread

1. User opens a thread.
2. Server reads full thread detail via `thread/read`.
3. Before a new turn, the bridge calls `thread/resume` if the thread is not already live in the current bridge session.
4. Server calls `turn/start`.
5. UI renders `item/started`, delta notifications, approval requests, then `item/completed` and `turn/completed`.

### Takeover Warning

- If a selected thread reports active/in-progress state or emits events not initiated by the current browser session, the UI shows a takeover warning bar before the next prompt is sent.

## Visual Direction

- Deep charcoal base similar to Codex Desktop, but warmer and cleaner for touch.
- Strong column separation on desktop.
- Large touch targets on iPad and phone.
- Composer remains docked to the bottom on all breakpoints.
- Terminal and tool output use monospace framing distinct from chat text.

## Deployment Model

- Local app binds to `0.0.0.0:3000`.
- Recommended remote access is `tailscale serve 3000`.
- UI shows host tailnet DNS name and IPs to reduce setup ambiguity.

## First Implementation Slice

1. Project scaffold and bridge singleton
2. Thread list and thread detail APIs
3. Responsive shell UI
4. New thread + resume thread turns
5. SSE streaming of item and delta events
6. Approval handling
7. Image upload mapping to `localImage`
