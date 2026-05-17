/**
 * Agent tools that write back to the festival Notion hub page.
 */

import { tool } from "ai";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";
import {
  appendAgentBriefing,
  appendTimeline,
  appendTodoItems,
  generateAndWriteStatusReport,
  workspaceDbIdsFromRecord,
} from "@/lib/notion/hub";
import type { NotionSetupResponse } from "@/types/festival";

export type HubWorkspaceContext = Pick<
  NotionSetupResponse,
  "hubPageId" | "databaseIds"
>;

export function createHubTools(workspace: HubWorkspaceContext) {
  const hubPageId = workspace.hubPageId;
  const dbIds = workspaceDbIdsFromRecord(hubPageId, workspace.databaseIds);

  const writeHubNote = tool({
    description:
      "Write a dated briefing note to the Agent Briefings section on the festival Notion hub. Use after important decisions or summaries.",
    inputSchema: z.object({
      note: z.string().min(1).describe("Briefing text to append to the hub"),
    }),
    execute: async ({ note }) => {
      const notion = getNotionClient();
      const result = await appendAgentBriefing(notion, hubPageId, note);
      return {
        ok: true,
        appended: result.appended,
        sectionFound: result.anchorFound,
      };
    },
  });

  const addActionItems = tool({
    description:
      "Add one or more unchecked to-do items under Quick Actions on the festival Notion hub.",
    inputSchema: z.object({
      items: z
        .array(z.string().min(1))
        .min(1)
        .describe("Action item labels"),
    }),
    execute: async ({ items }) => {
      const notion = getNotionClient();
      const result = await appendTodoItems(notion, hubPageId, items);
      return {
        ok: true,
        appended: result.appended,
        sectionFound: result.anchorFound,
      };
    },
  });

  const appendTimelineEntry = tool({
    description:
      "Add a timeline subsection with bullet milestones under Festival Timeline on the hub.",
    inputSchema: z.object({
      phase: z.string().min(1).describe("Subheading, e.g. Pre-event or Event week"),
      bullets: z.array(z.string().min(1)).min(1).describe("Milestone bullet points"),
    }),
    execute: async ({ phase, bullets }) => {
      const notion = getNotionClient();
      const result = await appendTimeline(notion, hubPageId, phase, bullets);
      return {
        ok: true,
        appended: result.appended,
        sectionFound: result.anchorFound,
      };
    },
  });

  const generateStatusReport = tool({
    description:
      "Query all connected festival databases, summarize current state, and write the report to Agent Briefings on the hub.",
    inputSchema: z.object({}),
    execute: async () => {
      const notion = getNotionClient();
      const result = await generateAndWriteStatusReport(
        notion,
        hubPageId,
        dbIds,
      );
      return {
        ok: true,
        reportLength: result.report.length,
        appended: result.appended,
      };
    },
  });

  return {
    writeHubNote,
    addActionItems,
    appendTimelineEntry,
    generateStatusReport,
  };
}
