import { readFile } from "fs/promises";
import path from "path";
import { Sandbox, type CommandFinished } from "@vercel/sandbox";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SANDBOX_WORKER_ROOT = "/tmp/notion-worker";
const LOG_TAIL = 8000;

function getSandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }
  return {};
}

function tail(output: string) {
  if (output.length <= LOG_TAIL) return output;
  return `…truncated (${output.length} chars)\n` + output.slice(-LOG_TAIL);
}

async function loadLocalWorkerTemplates() {
  const root = path.join(process.cwd(), "notion-worker");
  const [pkg, tsconfig, idx] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "tsconfig.json"), "utf8"),
    readFile(path.join(root, "src", "index.ts"), "utf8"),
  ]);
  return { pkg, tsconfig, idx };
}

type StepLog = {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runStep(step: StepLog[], label: string, finished: CommandFinished) {
  const stdout = tail(await finished.stdout());
  const stderr = tail(await finished.stderr());
  step.push({
    name: label,
    exitCode: finished.exitCode,
    stdout,
    stderr,
  });
  if (finished.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${finished.exitCode})`);
  }
}

export async function POST(request: Request) {
  const expected = process.env.DEPLOY_TRIGGER_SECRET;
  const authHeader = request.headers.get("authorization");
  if (
    typeof expected !== "string" ||
    expected.length === 0 ||
    authHeader !== `Bearer ${expected}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notionToken = process.env.NOTION_API_TOKEN;
  if (typeof notionToken !== "string" || notionToken.length === 0) {
    return Response.json(
      { error: "NOTION_API_TOKEN is not configured on this deployment" },
      { status: 500 },
    );
  }

  const notionWorkspaceId = process.env.NOTION_WORKSPACE_ID;
  if (typeof notionWorkspaceId !== "string" || notionWorkspaceId.length === 0) {
    return Response.json(
      { error: "NOTION_WORKSPACE_ID is not configured on this deployment" },
      { status: 500 },
    );
  }

  const steps: StepLog[] = [];
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;

  try {
    const files = await loadLocalWorkerTemplates();

    sandbox = await Sandbox.create({
      ...getSandboxCredentials(),
      runtime: "node22",
      timeout: 420_000,
    });

    await runStep(
      steps,
      "mkdir worker paths",
      await sandbox.runCommand({
        cmd: "mkdir",
        args: ["-p", `${SANDBOX_WORKER_ROOT}/src`],
      }),
    );

    await sandbox.writeFiles([
      { path: `${SANDBOX_WORKER_ROOT}/package.json`, content: files.pkg },
      { path: `${SANDBOX_WORKER_ROOT}/tsconfig.json`, content: files.tsconfig },
      { path: `${SANDBOX_WORKER_ROOT}/src/index.ts`, content: files.idx },
    ]);

    await runStep(
      steps,
      "npm install -g ntn",
      await sandbox.runCommand({
        cmd: "npm",
        args: ["install", "-g", "ntn"],
        sudo: true,
      }),
    );

    await runStep(
      steps,
      "npm install (worker dependencies)",
      await sandbox.runCommand({
        cmd: "npm",
        args: ["install"],
        cwd: SANDBOX_WORKER_ROOT,
      }),
    );

    await runStep(
      steps,
      "ntn workers deploy",
      await sandbox.runCommand({
        cmd: "ntn",
        args: ["workers", "deploy", "--name", "hello-from-worker"],
        cwd: SANDBOX_WORKER_ROOT,
        env: {
          NOTION_API_TOKEN: notionToken,
          NOTION_WORKSPACE_ID: notionWorkspaceId,
          EVENTBRITE_API_KEY: process.env.EVENTBRITE_API_KEY ?? "",
          SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID ?? "",
          SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET ?? "",
          INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID ?? "",
          INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET ?? "",
          INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
          INSTAGRAM_USER_ID: process.env.INSTAGRAM_USER_ID ?? "",
          NOTIONCHELLA_APP_URL: process.env.NOTIONCHELLA_APP_URL ?? "",
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
          OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
        },
      }),
    );

    return Response.json({
      ok: true,
      sandboxId: sandbox.sandboxId,
      steps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        error: message,
        sandboxId: sandbox?.sandboxId ?? null,
        steps,
      },
      { status: 500 },
    );
  } finally {
    if (sandbox) {
      await sandbox.stop({ blocking: true });
    }
  }
}
