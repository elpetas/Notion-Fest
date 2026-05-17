import type { FlushPendingResult } from "@/lib/onboarding/flush-pending-server";

export interface DeploySummaryInput {
  workspaceCreated: boolean;
  hubPageUrl?: string;
  flush: FlushPendingResult;
  workerDeployed: boolean;
  workerDeployError?: string;
}

/** Worker tools registered in notion-worker/src/index.ts */
export const WORKER_TOOL_NAMES = [
  "sayHello",
  "enrichArtistRoster",
  "publishInstagramPost",
  "syncEventbriteTickets",
  "generateDraftContent",
  "planFestivalCalendar",
] as const;

/**
 * Builds the assistant message shown in chat after deploy + sync.
 */
export function buildDeploySummaryMessage(input: DeploySummaryInput): string {
  const lines: string[] = [];

  if (input.workspaceCreated && input.hubPageUrl) {
    lines.push(
      `Your **festival hub** is live in Notion: ${input.hubPageUrl}`,
    );
  }

  const synced: string[] = [];
  const { flush } = input;
  if (flush.eventbrite) {
    const parts = ["Eventbrite"];
    if (flush.eventbriteTiers != null) {
      parts.push(`${flush.eventbriteTiers} ticket tier(s)`);
    }
    if (flush.eventbriteGuests != null) {
      parts.push(`${flush.eventbriteGuests} guest(s)`);
    }
    synced.push(parts.join(": "));
  }
  if (flush.instagram) {
    synced.push(`${flush.instagram} Instagram post(s) → Social schedule`);
  }
  if (flush.artists) {
    synced.push(`${flush.artists} artist(s) → DJ roster`);
  }

  if (synced.length > 0) {
    lines.push(`**Synced now:** ${synced.join(" · ")}`);
  } else {
    lines.push(
      "**Synced now:** Hub structure created. No pending Eventbrite, Instagram, or artist picks were waiting to flush.",
    );
  }

  if (flush.errors.length > 0) {
    lines.push(`**Warnings:** ${flush.errors.join(" ")}`);
  }

  if (input.workerDeployed) {
    lines.push(
      `**Notion Worker deployed** via \`ntn workers deploy\` in Vercel Sandbox. These tools are available to **Notion Custom Agents** in your workspace: ${WORKER_TOOL_NAMES.join(", ")}.`,
    );
  } else if (input.workerDeployError) {
    lines.push(
      `**Worker deploy skipped or failed:** ${input.workerDeployError} (hub and data sync above may still have succeeded).`,
    );
  }

  lines.push(
    "**Next time you run sync:** This project does not register \`worker.sync()\` capabilities yet, so \`ntn workers sync trigger …\` has nothing scheduled. On the **Integrations** page you can re-sync Eventbrite, Instagram metrics, and the engagement funnel into your existing databases. After you add sync capabilities to the worker, \`ntn workers sync trigger <key>\` will refresh those Notion databases on demand (default schedule is every 30 minutes when syncs are defined).",
  );

  lines.push(
    "**This chat agent** uses the Next.js app APIs and hub tools—not the hosted worker tools directly. To use worker tools here, add proxy tools that call the same `/api/*` routes (several worker tools already proxy to this app).",
  );

  return lines.join("\n\n");
}
