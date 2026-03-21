import { execFileSync, spawn } from "node:child_process";
import { openSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const cwd = "C:\\Users\\wo1fsea\\Documents\\codex_mw";
const port = 3001;
const runtimeDistDir = ".next-runtime";
const runtimeEnv = {
  ...process.env,
  NEXT_DIST_DIR: runtimeDistDir
};

execFileSync("cmd.exe", ["/d", "/s", "/c", "npx next build --webpack"], {
  cwd,
  env: runtimeEnv,
  stdio: "inherit"
});

try {
  const pid = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`
    ],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }
  )
    .trim()
    .split(/\s+/)
    .find(Boolean);

  if (pid) {
    execFileSync("taskkill", ["/PID", pid, "/F"], {
      cwd,
      stdio: "ignore"
    });
  }
} catch {}

const logFd = openSync(path.join(cwd, `codex-dock-start-${port}-${Date.now()}.log`), "w");

const child = spawn("cmd.exe", ["/d", "/s", "/c", `npx next start --hostname 0.0.0.0 --port ${port}`], {
  cwd,
  detached: true,
  env: runtimeEnv,
  stdio: ["ignore", logFd, logFd],
  windowsHide: true
});

child.unref();

function waitForReady(attempt = 0) {
  const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
    process.stdout.write(`${res.statusCode ?? 0}\n`);
    res.resume();
  });

  req.on("error", (error) => {
    if (attempt >= 20) {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
      return;
    }

    setTimeout(() => waitForReady(attempt + 1), 1000);
  });
}

setTimeout(() => waitForReady(), 1500);
