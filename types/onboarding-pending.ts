/**
 * Onboarding selections held locally until the Notion hub is created.
 */

import type { ArtistBookingStatus, EventbriteEventInfo } from "@/types/festival";

export interface PendingInstagramPost {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  permalink: string;
  likes: number;
  comments: number;
}

export interface PendingSpotifyArtist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string[];
  imageUrl: string | null;
  spotifyUrl: string;
  bookingStatus: ArtistBookingStatus;
}

export interface PendingOnboardingData {
  eventbriteUrl?: string;
  eventbrite?: EventbriteEventInfo;
  instagramPosts?: PendingInstagramPost[];
  artists?: PendingSpotifyArtist[];
}
