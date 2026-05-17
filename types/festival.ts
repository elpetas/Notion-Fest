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
  databaseIds: Record<string, string>;
}

/** Eventbrite event pulled during chat onboarding */
export interface EventbriteEventInfo {
  id: string;
  name: string;
  status: string;
  url: string;
  startUtc: string;
  endUtc: string;
  venueName: string;
  venueAddress: string;
  capacity: number | null;
  venueCapacity: number | null;
  isSoldOut: boolean;
}

/** Roster booking status labels shown in chat; mapped to Notion select options */
export type ArtistBookingStatus = "wishlist" | "pending" | "booked";

export interface ChatOnboardingState {
  eventbrite?: EventbriteEventInfo | null;
  /** Eventbrite URL or numeric ID used for Notion sync */
  eventbriteUrl?: string;
  instagramExported?: boolean;
  artistsExported?: boolean;
}
