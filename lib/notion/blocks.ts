/**
 * Typed builders for Notion block objects (append to pages via blocks.children.append).
 */

import type { Client } from "@notionhq/client";

export type NotionBlockInput = Parameters<
  Client["blocks"]["children"]["append"]
>[0]["children"][number];

export interface RichTextOptions {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  href?: string;
}

/** Single-segment rich_text array (max 2000 chars per Notion limit). */
export function richText(text: string, opts?: RichTextOptions) {
  const content = text.slice(0, 2000);
  return [
    {
      type: "text" as const,
      text: {
        content,
        ...(opts?.href ? { link: { url: opts.href } } : {}),
      },
      annotations: {
        bold: opts?.bold ?? false,
        italic: opts?.italic ?? false,
        strikethrough: opts?.strikethrough ?? false,
        underline: opts?.underline ?? false,
        code: opts?.code ?? false,
        color: "default" as const,
      },
    },
  ];
}

export function heading1(text: string): NotionBlockInput {
  return { type: "heading_1", heading_1: { rich_text: richText(text) } };
}

export function heading2(text: string): NotionBlockInput {
  return { type: "heading_2", heading_2: { rich_text: richText(text) } };
}

export function heading3(text: string): NotionBlockInput {
  return { type: "heading_3", heading_3: { rich_text: richText(text) } };
}

export function paragraph(text: string, opts?: RichTextOptions): NotionBlockInput {
  return { type: "paragraph", paragraph: { rich_text: richText(text, opts) } };
}

export function quote(text: string): NotionBlockInput {
  return { type: "quote", quote: { rich_text: richText(text) } };
}

export function codeBlock(text: string, language = "plain text"): NotionBlockInput {
  return {
    type: "code",
    code: {
      rich_text: richText(text),
      language: language as "plain text",
    },
  };
}

export function bullet(text: string): NotionBlockInput {
  return {
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText(text) },
  };
}

export function numbered(text: string): NotionBlockInput {
  return {
    type: "numbered_list_item",
    numbered_list_item: { rich_text: richText(text) },
  };
}

export function todo(text: string, checked = false): NotionBlockInput {
  return {
    type: "to_do",
    to_do: {
      rich_text: richText(text),
      checked,
    },
  };
}

export function toggle(
  summary: string,
  children: NotionBlockInput[] = [],
): NotionBlockInput {
  return {
    type: "toggle",
    toggle: {
      rich_text: richText(summary),
      children,
    },
  } as NotionBlockInput;
}

export function divider(): NotionBlockInput {
  return { type: "divider", divider: {} };
}

export function toc(): NotionBlockInput {
  return { type: "table_of_contents", table_of_contents: { color: "default" } };
}

export function callout(text: string, emoji = "💡"): NotionBlockInput {
  return {
    type: "callout",
    callout: {
      rich_text: richText(text),
      icon: { type: "emoji", emoji },
    },
  };
}

export function imageBlock(url: string, caption?: string): NotionBlockInput {
  return {
    type: "image",
    image: {
      type: "external",
      external: { url },
      ...(caption
        ? { caption: richText(caption) }
        : {}),
    },
  };
}

export function embedBlock(url: string): NotionBlockInput {
  return {
    type: "embed",
    embed: { url },
  };
}

/** Two- or three-column layout (each column holds nested blocks). */
export function columnLayout(columns: NotionBlockInput[][]): NotionBlockInput {
  return {
    type: "column_list",
    column_list: {
      children: columns.map((colBlocks) => ({
        type: "column" as const,
        column: {
          children: colBlocks.slice(0, 1),
        },
      })),
    },
  } as NotionBlockInput;
}

const DEFAULT_BATCH = 100;

/** Append blocks in batches of 100 (Notion API limit per request). */
export async function appendBlocksBatched(
  notion: Client,
  blockId: string,
  blocks: NotionBlockInput[],
  options?: { batchSize?: number; after?: string },
): Promise<void> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  for (let i = 0; i < blocks.length; i += batchSize) {
    await notion.blocks.children.append({
      block_id: blockId,
      children: blocks.slice(i, i + batchSize),
      ...(options?.after && i === 0 ? { after: options.after } : {}),
    });
  }
}

/** QuickChart bar chart embed for placeholder festival metrics. */
export function defaultMetricsChartUrl(): string {
  const config = {
    type: "bar",
    data: {
      labels: ["Tickets sold", "Social posts", "Artists booked"],
      datasets: [
        {
          label: "Progress",
          data: [0, 0, 0],
          backgroundColor: ["#e07a5f", "#81b29a", "#3d405b"],
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=600&h=320`;
}
