/**
 * Shared festival planning types for the chat agent and Notion scaffold.
 */

export interface FestivalSettings {
  /** human-readable budget range or number + currency */
  budget: string;
  /** primary music genre (or blend) */
  genre: string;
  /** dates as a range or sentence — no strict format for the demo */
  dateRange: string;
  /** vibe, aesthetic, audience, scale, etc. */
  vibe: string;
}

export interface NotionSetupResponse {
  hubPageUrl: string;
  hubPageId: string;
  databaseUrls: Record<string, string>;
}
