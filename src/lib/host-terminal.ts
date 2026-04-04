import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type HostTerminalStatus = "idle" | "running" | "closed" | "error";

export type HostTerminalEvent =
  | {
      seq: number;
      type: "started";
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
    }
  | {
      seq: number;
      type: "status";
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
      runningCommand: boolean;
    }
  | {
      seq: number;
      type: "output";
      content: string;
    }
  | {
      seq: number;
      type: "error";
      error: string;
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
    }
  | {
      seq: number;
      type: "closed";
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
    };

type HostTerminalEventPayload =
  | {
      type: "started";
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
    }
  | {
      type: "status";
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
      runningCommand: boolean;
    }
  | {
      type: "output";
      content: string;
    }
  | {
      type: "error";
      error: string;
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
    }
  | {
      type: "closed";
      cwd: string;
      shellLabel: string;
      status: HostTerminalStatus;
    };

type HostTerminalSummary = {
  sessionId: string;
  cwd: string;
  shellLabel: string;
  status: HostTerminalStatus;
};

type HostTerminalListener = (event: HostTerminalEvent) => void;

const MAX_BUFFERED_EVENTS = 1200;
const HOST_TERMINAL_SINGLETON_KEY = "__codexy_host_terminal_manager__";
const WINDOWS_POWERSHELL_UTF8_PREAMBLE = [
  "$utf8 = New-Object System.Text.UTF8Encoding $false",
  "$OutputEncoding = $utf8",
  "[Console]::InputEncoding = $utf8",
  "[Console]::OutputEncoding = $utf8",
  "if (Get-Variable PSStyle -ErrorAction SilentlyContinue) { $PSStyle.OutputRendering = 'Ansi' }"
].join("; ");

let resolvedWindowsShellFile: string | null = null;

function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function normalizeTerminalLine(value: string) {
  return value.replace(/\r/g, "").replace(/\n+$/g, "");
}

function createPrompt(cwd: string) {
  return `${cwd}> `;
}

function commandExists(command: string) {
  if (process.platform !== "win32") {
    return false;
  }

  const probe = spawnSync("where.exe", [command], {
    stdio: "ignore",
    windowsHide: true
  });

  return probe.status === 0;
}

function getWindowsShellFile() {
  if (!resolvedWindowsShellFile) {
    resolvedWindowsShellFile = commandExists("pwsh.exe")
      ? "pwsh.exe"
      : "powershell.exe";
  }

  return resolvedWindowsShellFile;
}

function getShellLabel() {
  if (process.platform === "win32") {
    return getWindowsShellFile() === "pwsh.exe"
      ? "PowerShell 7"
      : "Windows PowerShell";
  }

  return path.basename(process.env.SHELL || "/bin/bash");
}

function normalizeTerminalOutput(content: string) {
  return content.replace(/\r?\n/g, "\r\n");
}

async function resolveSessionCwd(input: string) {
  const cwd = input?.trim() ? path.resolve(input.trim()) : process.cwd();
  const directory = path.normalize(cwd);
  const details = await stat(directory);
  if (!details.isDirectory()) {
    throw new Error("Terminal cwd must be a directory.");
  }

  await access(directory, fsConstants.R_OK);
  return directory;
}

class HostTerminalSession {
  readonly sessionId = randomUUID();
  readonly shellLabel = getShellLabel();
  readonly #events = new EventEmitter();
  readonly #buffer: HostTerminalEvent[] = [];

  #cwd: string;
  #seq = 0;
  #status: HostTerminalStatus = "idle";
  #runningCommand = false;
  #closed = false;
  #activeProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(cwd: string) {
    this.#cwd = cwd;
    this.#emit({
      type: "started",
      cwd: this.#cwd,
      shellLabel: this.shellLabel,
      status: this.#status
    });
    this.#writeOutput(`Connected to ${this.shellLabel} on this Codexy node.\r\n`);
    this.#renderPrompt();
  }

  get summary(): HostTerminalSummary {
    return {
      sessionId: this.sessionId,
      cwd: this.#cwd,
      shellLabel: this.shellLabel,
      status: this.#status
    };
  }

  get replay(): HostTerminalEvent[] {
    return [...this.#buffer];
  }

  subscribe(listener: HostTerminalListener) {
    this.#events.on("event", listener);
    return () => {
      this.#events.off("event", listener);
    };
  }

  async runInput(rawInput: string) {
    if (this.#closed) {
      throw new Error("Terminal session is closed.");
    }

    if (this.#runningCommand) {
      this.#writeOutput("A command is already running.\r\n");
      return;
    }

    const line = normalizeTerminalLine(String(rawInput ?? ""));
    const trimmed = line.trim();

    if (!trimmed) {
      this.#renderPrompt();
      return;
    }

    if (/^(clear|cls)$/i.test(trimmed)) {
      this.#writeOutput("\u001bc");
      this.#renderPrompt();
      return;
    }

    if (/^(exit|quit)$/i.test(trimmed)) {
      this.close();
      return;
    }

    if (/^cd(?:\s+.+)?$/i.test(trimmed)) {
      await this.#changeDirectory(trimmed);
      return;
    }

    await this.#spawnCommand(trimmed);
  }

  interrupt() {
    if (!this.#activeProcess || this.#closed) {
      return false;
    }

    const activeProcess = this.#activeProcess;
    this.#activeProcess = null;
    this.#runningCommand = false;
    this.#setStatus("idle");
    this.#writeOutput("^C\r\n");

    try {
      activeProcess.kill("SIGINT");
    } catch {
      activeProcess.kill();
    }

    this.#renderPrompt();
    return true;
  }

  close() {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#runningCommand = false;
    this.#setStatus("closed");

    if (this.#activeProcess) {
      try {
        this.#activeProcess.kill();
      } catch {
        // Best-effort shutdown only.
      }
      this.#activeProcess = null;
    }

    this.#emit({
      type: "closed",
      cwd: this.#cwd,
      shellLabel: this.shellLabel,
      status: this.#status
    });
    this.#events.removeAllListeners();
  }

  async #changeDirectory(command: string) {
    const match = /^cd(?:\s+(.+))?$/i.exec(command);
    const rawTarget = stripOuterQuotes(match?.[1] ?? "") || os.homedir();
    const nextCwd =
      rawTarget === "~"
        ? os.homedir()
        : path.resolve(this.#cwd, rawTarget);

    try {
      const details = await stat(nextCwd);
      if (!details.isDirectory()) {
        throw new Error("Target is not a directory.");
      }

      this.#cwd = nextCwd;
      this.#renderPrompt();
    } catch {
      this.#writeOutput(`Directory not found: ${rawTarget}\r\n`);
      this.#renderPrompt();
    }
  }

  async #spawnCommand(command: string) {
    const [file, args] =
      process.platform === "win32"
        ? [
            getWindowsShellFile(),
            [
              "-NoLogo",
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `${WINDOWS_POWERSHELL_UTF8_PREAMBLE}; ${command}`
            ]
          ]
        : [process.env.SHELL || "/bin/bash", ["-lc", command]];

    this.#runningCommand = true;
    this.#setStatus("running");

    const child = spawn(file, args, {
      cwd: this.#cwd,
      env: {
        ...process.env,
        TERM: process.env.TERM || "xterm-256color"
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.#activeProcess = child;

    child.stdout.on("data", (chunk) => {
      this.#writeOutput(normalizeTerminalOutput(chunk.toString("utf8")));
    });

    child.stderr.on("data", (chunk) => {
      this.#writeOutput(normalizeTerminalOutput(chunk.toString("utf8")));
    });

    child.on("error", (error) => {
      this.#activeProcess = null;
      this.#runningCommand = false;
      this.#setStatus("error");
      this.#emit({
        type: "error",
        error: error.message,
        cwd: this.#cwd,
        shellLabel: this.shellLabel,
        status: this.#status
      });
      this.#writeOutput(`Terminal error: ${error.message}\r\n`);
      this.#setStatus("idle");
      this.#renderPrompt();
    });

    child.on("close", (code, signal) => {
      if (this.#activeProcess !== child) {
        return;
      }

      this.#activeProcess = null;
      this.#runningCommand = false;
      this.#setStatus("idle");

      if (signal && signal !== "SIGINT") {
        this.#writeOutput(`[terminated: ${signal}]\r\n`);
      } else if (code && code !== 0) {
        this.#writeOutput(`[exit ${code}]\r\n`);
      }

      if (!this.#closed) {
        this.#renderPrompt();
      }
    });
  }

  #renderPrompt() {
    if (this.#closed) {
      return;
    }

    this.#writeOutput(createPrompt(this.#cwd));
  }

  #setStatus(nextStatus: HostTerminalStatus) {
    this.#status = nextStatus;
    if (this.#closed && nextStatus !== "closed") {
      return;
    }

    this.#emit({
      type: "status",
      cwd: this.#cwd,
      shellLabel: this.shellLabel,
      status: this.#status,
      runningCommand: this.#runningCommand
    });
  }

  #writeOutput(content: string) {
    if (!content) {
      return;
    }

    this.#emit({
      type: "output",
      content
    });
  }

  #emit(event: HostTerminalEventPayload) {
    const nextEvent: HostTerminalEvent = {
      ...event,
      seq: ++this.#seq
    };

    this.#buffer.push(nextEvent);
    if (this.#buffer.length > MAX_BUFFERED_EVENTS) {
      this.#buffer.splice(0, this.#buffer.length - MAX_BUFFERED_EVENTS);
    }

    this.#events.emit("event", nextEvent);
  }
}

class HostTerminalManager {
  readonly #sessions = new Map<string, HostTerminalSession>();

  async createSession(cwd: string) {
    const resolvedCwd = await resolveSessionCwd(cwd);
    const session = new HostTerminalSession(resolvedCwd);
    this.#sessions.set(session.sessionId, session);
    return session.summary;
  }

  getSession(sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new Error("Unknown terminal session.");
    }

    return session;
  }

  subscribe(sessionId: string, listener: HostTerminalListener) {
    return this.getSession(sessionId).subscribe(listener);
  }

  replay(sessionId: string, afterSeq = 0) {
    return this.getSession(sessionId).replay.filter((event) => event.seq > afterSeq);
  }

  async runInput(sessionId: string, input: string) {
    await this.getSession(sessionId).runInput(input);
  }

  interrupt(sessionId: string) {
    return this.getSession(sessionId).interrupt();
  }

  closeSession(sessionId: string) {
    const session = this.getSession(sessionId);
    session.close();
    this.#sessions.delete(sessionId);
  }
}

function createManager() {
  return new HostTerminalManager();
}

export function getHostTerminalManager() {
  const globalState = globalThis as typeof globalThis & {
    [HOST_TERMINAL_SINGLETON_KEY]?: HostTerminalManager;
  };

  if (!globalState[HOST_TERMINAL_SINGLETON_KEY]) {
    globalState[HOST_TERMINAL_SINGLETON_KEY] = createManager();
  }

  return globalState[HOST_TERMINAL_SINGLETON_KEY]!;
}
