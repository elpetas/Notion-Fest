/**
 * Derives marketing tone from Eventbrite ticket sales windows and sell-through.
 */

import type { EbEventSummary, EbTicketClass } from "@/lib/eventbrite/client";

export type ContentTone =
  | "anticipation"
  | "launch"
  | "momentum"
  | "urgency"
  | "last_call"
  | "sold_out"
  | "post_event";

export interface SalesToneResult {
  tone: ContentTone;
  label: string;
  guidance: string;
  daysUntilEvent: number | null;
  daysUntilSalesEnd: number | null;
  sellThroughPct: number | null;
  onSaleStatuses: string[];
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function parseUtc(iso: string | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function deriveSalesTone(
  event: EbEventSummary,
  tiers: EbTicketClass[],
): SalesToneResult {
  const now = new Date();
  const eventStart = parseUtc(event.startUtc);
  const eventEnd = parseUtc(event.endUtc);

  const visibleTiers = tiers.filter((t) => !t.hidden);
  const onSaleStatuses = [
    ...new Set(
      visibleTiers
        .map((t) => t.on_sale_status?.trim())
        .filter((s): s is string => Boolean(s)),
    ),
  ];

  let totalCapacity = 0;
  let totalSold = 0;
  let earliestSalesEnd: Date | null = null;

  for (const tier of visibleTiers) {
    totalCapacity += tier.quantity_total ?? 0;
    totalSold += tier.quantity_sold ?? 0;
    const end = parseUtc(tier.sales_end);
    if (end && (!earliestSalesEnd || end < earliestSalesEnd)) {
      earliestSalesEnd = end;
    }
  }

  const sellThroughPct =
    totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : null;

  const daysUntilEvent = eventStart ? daysBetween(now, eventStart) : null;
  const daysUntilSalesEnd = earliestSalesEnd ? daysBetween(now, earliestSalesEnd) : null;

  if (eventEnd && now > eventEnd) {
    return {
      tone: "post_event",
      label: "Post-event recap",
      guidance:
        "Warm gratitude, highlight crowd moments and lineup favorites. Invite people to follow for next year — no hard sell.",
      daysUntilEvent,
      daysUntilSalesEnd,
      sellThroughPct,
      onSaleStatuses,
    };
  }

  if (event.isSoldOut || (sellThroughPct !== null && sellThroughPct >= 98)) {
    return {
      tone: "sold_out",
      label: "Sold out",
      guidance:
        "Celebrate scarcity without bragging. Tease waitlist, afterparty, or merch. FOMO for people who missed out.",
      daysUntilEvent,
      daysUntilSalesEnd,
      sellThroughPct,
      onSaleStatuses,
    };
  }

  const salesEnded =
    earliestSalesEnd && now > earliestSalesEnd && daysUntilEvent !== null && daysUntilEvent > 0;

  if (salesEnded) {
    return {
      tone: "last_call",
      label: "Tickets closed — event soon",
      guidance:
        "Focus on the experience ahead: lineup, vibe, what to bring. Light urgency around doors opening, not ticket sales.",
      daysUntilEvent,
      daysUntilSalesEnd,
      sellThroughPct,
      onSaleStatuses,
    };
  }

  if (daysUntilSalesEnd !== null && daysUntilSalesEnd <= 3 && daysUntilSalesEnd >= 0) {
    return {
      tone: "urgency",
      label: "Sales ending soon",
      guidance:
        "Short, punchy copy. Clear deadline. Emphasize what they'll miss. Strong CTA to grab tickets now.",
      daysUntilEvent,
      daysUntilSalesEnd,
      sellThroughPct,
      onSaleStatuses,
    };
  }

  const notYetOnSale = onSaleStatuses.every(
    (s) => s === "UNAVAILABLE" || s === "NOT_YET_ON_SALE",
  );

  if (notYetOnSale && onSaleStatuses.length > 0) {
    return {
      tone: "anticipation",
      label: "Pre-sale tease",
      guidance:
        "Build hype without revealing everything. Tease lineup, date, or venue. Ask followers to turn on notifications.",
      daysUntilEvent,
      daysUntilSalesEnd,
      sellThroughPct,
      onSaleStatuses,
    };
  }

  if (sellThroughPct !== null && sellThroughPct >= 55) {
    return {
      tone: "momentum",
      label: "Selling fast",
      guidance:
        "Social proof energy — crowds are buying in. Highlight tier perks or headliners. Confident, not desperate.",
      daysUntilEvent,
      daysUntilSalesEnd,
      sellThroughPct,
      onSaleStatuses,
    };
  }

  return {
    tone: "launch",
    label: "On sale now",
    guidance:
      "Fresh launch energy. Lead with the hook (lineup, genre, vibe). One clear CTA. Match the festival's personality.",
    daysUntilEvent,
    daysUntilSalesEnd,
    sellThroughPct,
    onSaleStatuses,
  };
}
