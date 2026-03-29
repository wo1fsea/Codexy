import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

function createTaskId() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];

  return `verify-${parts.join("")}`;
}

function getArgValue(args, name) {
  const index = args.findIndex((arg) => arg === name);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function captureManagedFile(filePath) {
  if (!existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      contents: null
    };
  }

  return {
    filePath,
    exists: true,
    contents: readFileSync(filePath, "utf8")
  };
}

function restoreManagedFiles(snapshots) {
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      rmSync(snapshot.filePath, { force: true });
      continue;
    }

    writeFileSync(snapshot.filePath, snapshot.contents, "utf8");
  }
}

function runStep(step, taskDir) {
  const logPath = path.join(taskDir, `${step.id}.log`);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  return new Promise((resolve) => {
    let combinedOutput = "";
    let settled = false;
    const command =
      process.platform === "win32"
        ? {
            file: "cmd.exe",
            args: ["/d", "/s", "/c", `npm run ${step.script}`]
          }
        : {
            file: "npm",
            args: ["run", step.script]
          };
    const child = spawn(command.file, command.args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      combinedOutput += `${String(error)}\n`;
      writeFileSync(logPath, combinedOutput, "utf8");

      resolve({
        id: step.id,
        script: step.script,
        required: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ok: false,
        exitCode: null,
        error: error.message,
        logPath
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      writeFileSync(logPath, combinedOutput, "utf8");

      resolve({
        id: step.id,
        script: step.script,
        required: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ok: code === 0,
        exitCode: code ?? null,
        logPath
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const includeE2E = args.includes("--e2e");
  const explicitTaskId = getArgValue(args, "--task");
  const taskId = explicitTaskId ?? createTaskId();
  const taskDir = path.join(process.cwd(), "output", "tasks", taskId);
  const managedSnapshots = [
    path.join(process.cwd(), "next-env.d.ts"),
    path.join(process.cwd(), "tsconfig.json")
  ].map(captureManagedFile);

  try {
    mkdirSync(taskDir, { recursive: true });

    const steps = [
      { id: "01-typecheck", script: "typecheck" },
      { id: "02-build", script: "build" }
    ];

    if (includeE2E) {
      steps.push({ id: "03-e2e", script: "test:e2e" });
    }

    const summary = {
      taskId,
      generatedAt: new Date().toISOString(),
      cwd: process.cwd(),
      includeE2E,
      steps: []
    };

    let failed = false;

    for (const step of steps) {
      if (failed) {
        summary.steps.push({
          id: step.id,
          script: step.script,
          required: true,
          skipped: true
        });
        continue;
      }

      process.stdout.write(`\n[verify] Running ${step.script}\n`);
      const result = await runStep(step, taskDir);
      summary.steps.push(result);

      if (!result.ok) {
        failed = true;
      }
    }

    summary.ok = summary.steps.every((step) => step.ok !== false);
    summary.requiredCommand = includeE2E ? "npm run verify:e2e" : "npm run verify";

    writeFileSync(
      path.join(taskDir, "verify.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    );

    process.stdout.write(
      `\n[verify] Summary written to ${path.join(taskDir, "verify.json")}\n`
    );

    if (!summary.ok) {
      process.exitCode = 1;
    }
  } finally {
    restoreManagedFiles(managedSnapshots);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
