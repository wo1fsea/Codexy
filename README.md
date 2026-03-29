# Codexy

Codexy is a web control console for a Codex host. The open-source app now supports two runtime modes from the same `codexy` entrypoint:

- node mode: the current local/Tailscale-first Codexy runtime for a host machine
- cloud mode: a self-hosted single-user cloud entrypoint for registering linked nodes and opening their workspaces through an outbound connector

The runtime in this repository is built on Next.js. Node mode listens on `0.0.0.0:3000` by default, and cloud mode listens on `0.0.0.0:3400` by default.

## Interface Preview

<table>
  <tr>
    <td valign="top" width="68%">
      <strong>Desktop</strong><br />
      <img src="./docs/images/codexy-desktop.png" alt="Codexy desktop preview" width="100%" />
    </td>
    <td valign="top" width="32%">
      <strong>Mobile</strong><br />
      <img src="./docs/images/codexy-mobile.png" alt="Codexy mobile preview" width="100%" />
    </td>
  </tr>
</table>

## Requirements

- Node.js 20+
- npm 10+

## First Run

1. Run `install.cmd` on Windows or `./install.sh` on macOS/Linux.
2. Run `codexy doctor`.
3. Run `codexy start`.

Current first-run command surface:

- `codexy help`
- `codexy doctor`
- `codexy start`
- `codexy stop`
- `codexy status`
- `codexy logs`
- `codexy open`
- `codexy cloud start`
- `codexy cloud stop`
- `codexy cloud status`
- `codexy cloud logs`
- `codexy cloud open`
- `codexy link <cloud-url> [--code 123456]`
- `codexy unlink`

To start a local self-hosted cloud entrypoint:

```bash
codexy cloud start
```

To point a node at a self-hosted cloud entrypoint:

```bash
codexy link https://cloud.example.com --code 123456
```

Start the linked node with `codexy start`, then open that node from the cloud dashboard. The node keeps a cloud connector open in the background, so the browser does not need a directly reachable node address.

Cloud mode is protected by a single Google Authenticator-compatible TOTP binding. On the first cloud open, bind an authenticator in the browser. After that:

- browser access to the dashboard and remote node workspaces requires a 6-digit authenticator login
- `codexy link` also requires the current 6-digit authenticator code so node registration is not anonymous

This writes local node configuration into the active Codexy home directory, which defaults to `~/.codexy` unless `CODEXY_HOME_DIR` is set.

## Install Dependencies

```bash
npm install
```

## Entrypoints

### 1. Build

Build the production bundle:

```bash
npm run build
```

This writes the production bundle to `.next-runtime` so development runs can keep using `.next` without clobbering the live runtime.

Windows shortcut:

```bat
build.cmd
```

### 2. Development Runtime

Start the development server on port `3001` by default:

```bash
npm run dev
```

Windows shortcut:

```bat
dev.cmd
```

Shell shortcut:

```sh
./dev.sh
```

To use a custom port, pass the port directly or use `--port`:

```bat
dev.cmd 3100
dev.cmd --port 3100
```

### 3. Production Runtime

Build first, then start the production server:

```bash
npm run build
npm run start
```

Windows shortcut:

```bat
start.cmd
```

Shell shortcuts:

```sh
./build.sh
./start.sh
```

Custom ports are also supported:

```bat
start.cmd 3100
start.cmd --port 3100
```

```sh
./start.sh 3100
./start.sh --port 3100
```

## Default Port Split

- Node runtime: `3000`
- Cloud runtime: `3400`
- Development runtime: `3001`
- Direct entrypoints:
  - Windows: `build.cmd`, `dev.cmd`, `start.cmd`
  - Shell: `build.sh`, `dev.sh`, `start.sh`

## Common Verification Commands

Baseline verification:

```bash
npm run verify
```

Verification including end-to-end tests:

```bash
npm run verify:e2e
```

## Project Notes

- The web client talks to the server only through HTTP APIs and the event stream.
- The Codexy API Server connects to the Codex bridge and exposes stable browser-facing interfaces.
- Live execution and approval flows must go through the Codex protocol, not ad hoc shell wrappers.
- Engineering rules for orthogonality, simplicity, and context discipline live in [docs/engineering-governance.md](./docs/engineering-governance.md).

For detailed runtime ownership boundaries, see [agents.md](./agents.md). For product requirements, see [docs/spec.md](./docs/spec.md). For the normative UI contract, see [docs/visual-spec.md](./docs/visual-spec.md).
