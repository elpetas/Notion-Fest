/**
 * End-of-onboarding deploy: scaffold Notion hub, flush pending syncs,
 * then run `ntn workers deploy` in Vercel Sandbox.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { buildDeploySummaryMessage } from "@/lib/deploy/deploy-summary";
import {
  canDeployWorkerInSandbox,
  deployNotionWorkerInSandbox,
} from "@/lib/deploy/sandbox-worker-deploy";
import { flushPendingOnboardingServer } from "@/lib/onboarding/flush-pending-server";
import { getNotionClient } from "@/lib/notion/client";
import { normalizeNotionPageId, scaffoldFestivalWorkspace } from "@/lib/notion/scaffold";
import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";
import type { PendingOnboardingData } from "@/types/onboarding-pending";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  budget: z.string().min(1),
  genre: z.string().min(1),
  dateRange: z.string().min(1),
  vibe: z.string().min(1),
  parentPageUrl: z.string().optional(),
  hubTitle: z.string().optional(),
  pending: z
    .object({
      eventbriteUrl: z.string().optional(),
      eventbrite: z.any().optional(),
      instagramPosts: z.array(z.any()).optional(),
      artists: z.array(z.any()).optional(),
    })
    .optional()
    .nullable(),
  eventbriteUrl: z.string().optional(),
  skipWorkerDeploy: z.boolean().optional(),
});

function getAppOrigin(req: Request): string {
  const fromEnv = process.env.NOTIONCHELLA_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const parentRaw =
    parsed.data.parentPageUrl?.trim() ||
    process.env.NOTION_PAGE_ID?.trim() ||
    "";
  if (!parentRaw) {
    return NextResponse.json(
      {
        error:
          "Parent Notion page missing — paste its URL on the home page or set NOTION_PAGE_ID.",
      },
      { status: 400 },
    );
  }

  const appOrigin = getAppOrigin(req);
  const settings: FestivalSettings = {
    budget: parsed.data.budget,
    genre: parsed.data.genre,
    dateRange: parsed.data.dateRange,
    vibe: parsed.data.vibe,
  };

  let workspace: NotionSetupResponse;
  try {
    const notion = getNotionClient();
    const hubTitleOpt = parsed.data.hubTitle?.trim();
    workspace = await scaffoldFestivalWorkspace(
      notion,
      normalizeNotionPageId(parentRaw),
      settings,
      hubTitleOpt ? { hubTitle: hubTitleOpt } : undefined,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "notion setup failed";
    console.error("chat deploy scaffold error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const pending = (parsed.data.pending ?? null) as PendingOnboardingData | null;
  const shouldFlush =
    Boolean(
      parsed.data.eventbriteUrl ||
        pending?.eventbriteUrl ||
        pending?.eventbrite ||
        (pending?.instagramPosts?.length ?? 0) > 0 ||
        (pending?.artists?.length ?? 0) > 0,
    );

  const flush = shouldFlush
    ? await flushPendingOnboardingServer(workspace, {
        appOrigin,
        pending,
        eventbriteUrl: parsed.data.eventbriteUrl,
        eventbrite: pending?.eventbrite,
      })
    : { errors: [] as string[] };

  let workerDeployed = false;
  let workerDeployError: string | undefined;
  let workerSteps: Awaited<ReturnType<typeof deployNotionWorkerInSandbox>>["steps"] =
    [];

  if (!parsed.data.skipWorkerDeploy && canDeployWorkerInSandbox()) {
    const workerResult = await deployNotionWorkerInSandbox();
    workerSteps = workerResult.steps;
    if (workerResult.ok) {
      workerDeployed = true;
    } else {
      workerDeployError = workerResult.error;
    }
  } else if (!parsed.data.skipWorkerDeploy && !canDeployWorkerInSandbox()) {
    workerDeployError =
      "Set NOTION_API_TOKEN and NOTION_WORKSPACE_ID on Vercel to deploy the worker from Sandbox.";
  }

  const summaryMessage = buildDeploySummaryMessage({
    workspaceCreated: true,
    hubPageUrl: workspace.hubPageUrl,
    flush,
    workerDeployed,
    workerDeployError,
  });

  return NextResponse.json({
    workspace,
    flush,
    workerDeployed,
    workerDeployError,
    workerSteps,
    summaryMessage,
  });
}
