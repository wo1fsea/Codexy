"use client";

import clsx from "clsx";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";

import { AppIcon } from "@/components/dock-icons";
import { useI18n } from "@/lib/i18n/provider";

type HostTerminalStatus = "idle" | "starting" | "running" | "closed" | "error";

type HostTerminalEvent =
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

type TerminalSessionResponse = {
  sessionId: string;
  cwd: string;
  shellLabel: string;
  status: HostTerminalStatus;
};

type DockTerminalPaneProps = {
  apiBasePath: string;
  cwd: string;
  className?: string;
};

type XTermModule = typeof import("@xterm/xterm");
type FitAddonModule = typeof import("@xterm/addon-fit");

function buildApiUrl(apiBasePath: string, suffix: string) {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return apiBasePath === "/api"
    ? `/api${normalizedSuffix}`
    : `${apiBasePath}${normalizedSuffix}`;
}

function isPrintableCharacter(value: string) {
  return value >= " " && value !== "\u007f";
}

function statusTone(status: HostTerminalStatus) {
  if (status === "running") return "is-running";
  if (status === "error") return "is-error";
  return status === "starting" ? "is-starting" : "";
}

export function DockTerminalPane(props: DockTerminalPaneProps) {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<InstanceType<XTermModule["Terminal"]> | null>(null);
  const fitAddonRef = useRef<InstanceType<FitAddonModule["FitAddon"]> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const inputBufferRef = useRef("");
  const inputCursorRef = useRef(0);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const historyDraftRef = useRef("");
  const [status, setStatus] = useState<HostTerminalStatus>("starting");
  const [cwd, setCwd] = useState(props.cwd);
  const [shellLabel, setShellLabel] = useState("Shell");
  const [error, setError] = useState("");

  const writeToTerminal = useEffectEvent((content: string) => {
    if (!content || !termRef.current) {
      return;
    }

    termRef.current.write(content);
  });

  const closeTerminalSession = useEffectEvent(async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    inputBufferRef.current = "";
    inputCursorRef.current = 0;
    historyIndexRef.current = null;
    historyDraftRef.current = "";

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!sessionId) {
      return;
    }

    try {
      await fetch(buildApiUrl(props.apiBasePath, `/terminal/sessions/${encodeURIComponent(sessionId)}`), {
        method: "DELETE"
      });
    } catch {
      // Best-effort cleanup only.
    }
  });

  const connectEventStream = useEffectEvent((sessionId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource(
      buildApiUrl(
        props.apiBasePath,
        `/terminal/sessions/${encodeURIComponent(sessionId)}/events?afterSeq=0`
      )
    );
    eventSourceRef.current = source;

    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as HostTerminalEvent;
      if (payload.type === "started") {
        setStatus("running");
        setCwd(payload.cwd);
        setShellLabel(payload.shellLabel);
        setError("");
        return;
      }

      if (payload.type === "status") {
        setStatus(payload.status);
        setCwd(payload.cwd);
        setShellLabel(payload.shellLabel);
        return;
      }

      if (payload.type === "output") {
        writeToTerminal(payload.content);
        return;
      }

      if (payload.type === "error") {
        setStatus("error");
        setError(payload.error);
        setCwd(payload.cwd);
        setShellLabel(payload.shellLabel);
        writeToTerminal(`\r\n[error] ${payload.error}\r\n`);
        return;
      }

      if (payload.type === "closed") {
        setStatus("closed");
        setCwd(payload.cwd);
        setShellLabel(payload.shellLabel);
        writeToTerminal("\r\n[terminal closed]\r\n");
      }
    };

    source.onerror = () => {
      setStatus("error");
      setError(t("terminal.connectionLost"));
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  });

  const sendInput = useEffectEvent(async (data: string) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }

    try {
      await fetch(
        buildApiUrl(
          props.apiBasePath,
          `/terminal/sessions/${encodeURIComponent(sessionId)}/input`
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ data })
        }
      );
    } catch {
      setStatus("error");
      setError(t("terminal.inputFailed"));
    }
  });

  const interruptCommand = useEffectEvent(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }

    inputBufferRef.current = "";
    inputCursorRef.current = 0;
    historyIndexRef.current = null;
    historyDraftRef.current = "";
    try {
      await fetch(
        buildApiUrl(
          props.apiBasePath,
          `/terminal/sessions/${encodeURIComponent(sessionId)}/interrupt`
        ),
        {
          method: "POST"
        }
      );
    } catch {
      setStatus("error");
      setError(t("terminal.interruptFailed"));
    }
  });

  const moveCursorBy = useEffectEvent((delta: number) => {
    if (!termRef.current || delta === 0) {
      return;
    }

    if (delta > 0) {
      termRef.current.write(`\u001b[${delta}C`);
      inputCursorRef.current = Math.min(
        inputBufferRef.current.length,
        inputCursorRef.current + delta
      );
      return;
    }

    termRef.current.write(`\u001b[${Math.abs(delta)}D`);
    inputCursorRef.current = Math.max(0, inputCursorRef.current + delta);
  });

  const rewriteInputBuffer = useEffectEvent(
    (nextBuffer: string, nextCursor = nextBuffer.length) => {
      if (!termRef.current) {
        return;
      }

      const currentBuffer = inputBufferRef.current;
      const currentCursor = inputCursorRef.current;
      const safeCursor = Math.max(0, Math.min(nextCursor, nextBuffer.length));

      if (currentCursor > 0) {
        termRef.current.write(`\u001b[${currentCursor}D`);
      }

      const trailingWhitespaceCount = Math.max(
        0,
        currentBuffer.length - nextBuffer.length
      );

      termRef.current.write(
        `${nextBuffer}${" ".repeat(trailingWhitespaceCount)}`
      );

      const moveLeftCount =
        trailingWhitespaceCount + (nextBuffer.length - safeCursor);

      if (moveLeftCount > 0) {
        termRef.current.write(`\u001b[${moveLeftCount}D`);
      }

      inputBufferRef.current = nextBuffer;
      inputCursorRef.current = safeCursor;
    }
  );

  const stepThroughHistory = useEffectEvent((direction: "up" | "down") => {
    const history = commandHistoryRef.current;
    if (!history.length) {
      return;
    }

    const currentIndex = historyIndexRef.current;

    if (direction === "up") {
      if (currentIndex === null) {
        historyDraftRef.current = inputBufferRef.current;
        historyIndexRef.current = history.length - 1;
      } else if (currentIndex > 0) {
        historyIndexRef.current = currentIndex - 1;
      } else {
        return;
      }

      rewriteInputBuffer(history[historyIndexRef.current]);
      return;
    }

    if (currentIndex === null) {
      return;
    }

    if (currentIndex < history.length - 1) {
      historyIndexRef.current = currentIndex + 1;
      rewriteInputBuffer(history[historyIndexRef.current]);
      return;
    }

    historyIndexRef.current = null;
    rewriteInputBuffer(historyDraftRef.current);
    historyDraftRef.current = "";
  });

  const handleTerminalInput = useEffectEvent((data: string) => {
    if (!termRef.current || !sessionIdRef.current) {
      return;
    }

    let index = 0;

    while (index < data.length) {
      const character = data[index];

      if (character === "\u0003") {
        void interruptCommand();
        index += 1;
        continue;
      }

      if (character === "\r") {
        const line = inputBufferRef.current;

        if (line.trim()) {
          commandHistoryRef.current.push(line);
        }

        inputBufferRef.current = "";
        inputCursorRef.current = 0;
        historyIndexRef.current = null;
        historyDraftRef.current = "";
        termRef.current.write("\r\n");
        void sendInput(line);
        index += 1;
        continue;
      }

      if (character === "\u007f") {
        if (inputCursorRef.current > 0) {
          const currentBuffer = inputBufferRef.current;
          const currentCursor = inputCursorRef.current;

          rewriteInputBuffer(
            currentBuffer.slice(0, currentCursor - 1) +
              currentBuffer.slice(currentCursor),
            currentCursor - 1
          );
        }

        index += 1;
        continue;
      }

      if (character === "\u001b") {
        const next = data[index + 1] ?? "";
        const third = data[index + 2] ?? "";
        const fourth = data[index + 3] ?? "";

        if (next === "[") {
          if (third === "A") {
            stepThroughHistory("up");
            index += 3;
            continue;
          }

          if (third === "B") {
            stepThroughHistory("down");
            index += 3;
            continue;
          }

          if (third === "C") {
            if (inputCursorRef.current < inputBufferRef.current.length) {
              moveCursorBy(1);
            }
            index += 3;
            continue;
          }

          if (third === "D") {
            if (inputCursorRef.current > 0) {
              moveCursorBy(-1);
            }
            index += 3;
            continue;
          }

          if (third === "H") {
            moveCursorBy(-inputCursorRef.current);
            index += 3;
            continue;
          }

          if (third === "F") {
            moveCursorBy(inputBufferRef.current.length - inputCursorRef.current);
            index += 3;
            continue;
          }

          if (third === "3" && fourth === "~") {
            if (inputCursorRef.current < inputBufferRef.current.length) {
              const currentBuffer = inputBufferRef.current;
              const currentCursor = inputCursorRef.current;

              rewriteInputBuffer(
                currentBuffer.slice(0, currentCursor) +
                  currentBuffer.slice(currentCursor + 1),
                currentCursor
              );
            }

            index += 4;
            continue;
          }

          let sequenceEnd = index + 2;
          while (sequenceEnd < data.length) {
            const code = data.charCodeAt(sequenceEnd);
            if (code >= 0x40 && code <= 0x7e) {
              sequenceEnd += 1;
              break;
            }
            sequenceEnd += 1;
          }
          index = sequenceEnd;
          continue;
        }

        if (next === "O") {
          if (third === "A") {
            stepThroughHistory("up");
          } else if (third === "B") {
            stepThroughHistory("down");
          } else if (third === "C") {
            if (inputCursorRef.current < inputBufferRef.current.length) {
              moveCursorBy(1);
            }
          } else if (third === "D") {
            if (inputCursorRef.current > 0) {
              moveCursorBy(-1);
            }
          } else if (third === "H") {
            moveCursorBy(-inputCursorRef.current);
          } else if (third === "F") {
            moveCursorBy(inputBufferRef.current.length - inputCursorRef.current);
          }

          index += 3;
          continue;
        }

        index += 1;
        continue;
      }

      if (!isPrintableCharacter(character)) {
        index += 1;
        continue;
      }

      const currentBuffer = inputBufferRef.current;
      const currentCursor = inputCursorRef.current;

      rewriteInputBuffer(
        currentBuffer.slice(0, currentCursor) +
          character +
          currentBuffer.slice(currentCursor),
        currentCursor + 1
      );
      index += 1;
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function setupTerminal() {
      if (termRef.current || !mountRef.current) {
        return;
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit")
      ]);

      if (cancelled || !mountRef.current || termRef.current) {
        return;
      }

      const fitAddon = new FitAddon();
      const terminal = new Terminal({
        allowTransparency: true,
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily:
          '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
        fontSize: 13,
        lineHeight: 1.45,
        rows: 26,
        theme: {
          background: "#151518",
          foreground: "#f2eee8",
          cursor: "#f2eee8",
          cursorAccent: "#151518",
          selectionBackground: "rgba(255, 247, 238, 0.16)",
          black: "#151518",
          red: "#f4b8ac",
          green: "#b4d5b0",
          yellow: "#dcc28c",
          blue: "#9ab8ff",
          magenta: "#d3b3ff",
          cyan: "#96d6d9",
          white: "#f2eee8",
          brightBlack: "#6d6760",
          brightRed: "#ffd3cb",
          brightGreen: "#d5f2cf",
          brightYellow: "#f1dbad",
          brightBlue: "#bdd0ff",
          brightMagenta: "#e4d4ff",
          brightCyan: "#bdebed",
          brightWhite: "#fbf8f3"
        }
      });

      fitAddonRef.current = fitAddon;
      termRef.current = terminal;
      terminal.loadAddon(fitAddon);
      terminal.open(mountRef.current);
      fitAddon.fit();
      terminal.focus();
      terminal.onData(handleTerminalInput);

      if (typeof ResizeObserver !== "undefined") {
        const resizeObserver = new ResizeObserver(() => {
          fitAddon.fit();
        });
        resizeObserver.observe(mountRef.current);
        resizeObserverRef.current = resizeObserver;
      }
    }

    void setupTerminal();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function openTerminal() {
      setStatus("starting");
      setError("");
      setCwd(props.cwd);

      termRef.current?.reset();
      inputBufferRef.current = "";
      inputCursorRef.current = 0;
      commandHistoryRef.current = [];
      historyIndexRef.current = null;
      historyDraftRef.current = "";
      await closeTerminalSession();

      try {
        const response = await fetch(buildApiUrl(props.apiBasePath, "/terminal/sessions"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ cwd: props.cwd })
        });
        const payload = (await response.json()) as
          | TerminalSessionResponse
          | {
              error?: string;
            };

        if (!response.ok || !("sessionId" in payload)) {
          const message =
            "error" in payload ? payload.error : undefined;
          throw new Error(message || t("terminal.startFailed"));
        }

        if (cancelled) {
          return;
        }

        sessionIdRef.current = payload.sessionId;
        setShellLabel(payload.shellLabel);
        setCwd(payload.cwd);
        setStatus("running");
        connectEventStream(payload.sessionId);
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setError(
          cause instanceof Error ? cause.message : t("terminal.startFailed")
        );
      }
    }

    void openTerminal();

    return () => {
      cancelled = true;
      void closeTerminalSession();
    };
  }, [props.apiBasePath, props.cwd]);

  return (
    <section className={clsx("dock-stage-terminal", props.className)}>
      <div className="dock-stage-terminal-shell">
        <div className="dock-stage-terminal-head">
          <div className="dock-stage-terminal-copy">
            <span className={clsx("dock-stage-terminal-status", statusTone(status))}>
              {status === "running"
                ? t("terminal.statusLive")
                : status === "starting"
                  ? t("terminal.statusStarting")
                  : status === "closed"
                    ? t("terminal.statusClosed")
                    : status === "error"
                      ? t("terminal.statusError")
                      : t("terminal.statusIdle")}
            </span>
            <span className="dock-terminal-path" title={cwd}>
              {cwd}
            </span>
          </div>

          <button
            className="dock-icon-button"
            onClick={() => void interruptCommand()}
            title={t("actions.stop")}
            type="button"
          >
            <AppIcon className="dock-inline-icon" name="stop" />
          </button>
        </div>

        <div className="dock-stage-terminal-surface">
          <div className="dock-stage-terminal-meta">
            <span>{shellLabel}</span>
            <span>{t("terminal.metaHost")}</span>
          </div>
          <div className="dock-stage-terminal-screen" ref={mountRef} />
        </div>

        {error ? <div className="dock-stage-terminal-footnote">{error}</div> : null}
      </div>
    </section>
  );
}
