/**
 * Rich hub page block sequences (intro, sections, placeholders).
 */

import type { FestivalSettings } from "@/types/festival";

import {
  bullet,
  callout,
  defaultMetricsChartUrl,
  divider,
  embedBlock,
  heading1,
  heading2,
  numbered,
  paragraph,
  quote,
  todo,
  toc,
  type NotionBlockInput,
} from "./blocks";

export const HUB_HEADINGS = {
  quickActions: "🎯 Quick Actions",
  timeline: "📅 Festival Timeline",
  lineup: "🎤 Lineup & Artists",
  venues: "🏟️ Venues",
  tickets: "🎟️ Tickets & Attendees",
  marketing: "📣 Marketing & Content",
  funnel: "💬 Engagement Funnel",
  logistics: "🛒 Logistics & Merch",
  metrics: "📊 Live Metrics",
  agentBriefings: "🤖 Agent Briefings",
  audience: "🎯 Audience Segments",
} as const;

export function buildHubIntro(settings: FestivalSettings): NotionBlockInput[] {
  return [
    callout(
      `Budget: ${settings.budget}\nDates: ${settings.dateRange}\nGenre: ${settings.genre}\nVibe: ${settings.vibe}`,
      "🎪",
    ),
    divider(),
    toc(),
    divider(),
  ];
}

export function buildQuickActionsSection(): NotionBlockInput[] {
  return [
    heading1(HUB_HEADINGS.quickActions),
    todo("Confirm venue deposit"),
    todo("Book headliner"),
    todo("Launch ticket presale"),
    divider(),
  ];
}

export function buildTimelineSection(): NotionBlockInput[] {
  return [
    heading1(HUB_HEADINGS.timeline),
    heading2("Pre-event"),
    bullet("90 days out: venue locked and contracts signed"),
    bullet("60 days out: lineup announced publicly"),
    bullet("30 days out: marketing push and presale reminders"),
    heading2("Event week"),
    bullet("Final logistics checklist review"),
    bullet("Crew briefing and run-of-show walkthrough"),
    bullet("Day-of social coverage scheduled"),
    heading2("Post-event"),
    bullet("Metrics report and sponsor recap"),
    bullet("Thank-you posts and audience follow-up"),
    bullet("Debrief notes for next edition"),
    divider(),
  ];
}

export function buildSectionHeading(title: string): NotionBlockInput[] {
  return [heading1(title), divider()];
}

export function buildMarketingSubsections(): NotionBlockInput[] {
  return [
    heading1(HUB_HEADINGS.marketing),
    heading2("Social Schedule"),
  ];
}

export function buildMarketingMidSections(): NotionBlockInput[] {
  return [heading2("Ad Copies")];
}

export function buildMarketingEndSections(): NotionBlockInput[] {
  return [heading2("Flyer Designs"), divider()];
}

export function buildTicketsSectionStart(): NotionBlockInput[] {
  return [heading1(HUB_HEADINGS.tickets)];
}

export function buildMetricsSection(): NotionBlockInput[] {
  return [
    heading1(HUB_HEADINGS.metrics),
    paragraph(
      "Live chart — updates when you sync ticket tiers, roster, and social data from Notion Fest.",
    ),
    embedBlock(defaultMetricsChartUrl()),
    divider(),
  ];
}

export function buildAgentBriefingsPlaceholder(): NotionBlockInput[] {
  return [
    heading1(HUB_HEADINGS.agentBriefings),
    quote("Agent notes and status reports will appear below as you use Notion Fest."),
    divider(),
  ];
}

/** Full static hub layout (without databases — those are created separately). */
export function buildFullHubStructure(settings: FestivalSettings): NotionBlockInput[] {
  return [
    ...buildHubIntro(settings),
    ...buildQuickActionsSection(),
    ...buildTimelineSection(),
    heading1(HUB_HEADINGS.lineup),
    divider(),
    heading1(HUB_HEADINGS.venues),
    divider(),
    ...buildTicketsSectionStart(),
    divider(),
    ...buildMarketingSubsections(),
    ...buildMarketingMidSections(),
    ...buildMarketingEndSections(),
    heading1(HUB_HEADINGS.funnel),
    divider(),
    heading1(HUB_HEADINGS.logistics),
    divider(),
    ...buildMetricsSection(),
    ...buildAgentBriefingsPlaceholder(),
    heading1(HUB_HEADINGS.audience),
    numbered("Define core audience segments before launch"),
    bullet("Primary: fans of your headline genre"),
    bullet("Secondary: local community and press"),
  ];
}
