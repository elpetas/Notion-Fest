/**
 * Factory for a Notion API client using the integration token from env.
 */

import { Client } from "@notionhq/client";

export function getNotionClient(): Client {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("missing NOTION_API_KEY environment variable");
  }
  return new Client({ auth: apiKey });
}
