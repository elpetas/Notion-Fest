export type CalendarItemType = "social_post" | "logistics" | "marketing" | "ops";

export type LogisticsCategory = "Merch" | "Ops" | "Security" | "Other";

export interface CalendarPlanItem {
  date: string;
  title: string;
  type: CalendarItemType;
  platform?: "Instagram" | "TikTok" | "Email" | "Twitter / X" | "Other";
  priority: "high" | "medium" | "low";
  description: string;
  logisticsCategory?: LogisticsCategory;
}

export interface FestivalCalendarPlan {
  summary: string;
  eventDate: string | null;
  items: CalendarPlanItem[];
}

export interface NotionWorkspaceSnapshot {
  hubNotes: string | null;
  venues: Array<{
    name: string;
    eventStart: string | null;
    eventEnd: string | null;
    status: string | null;
  }>;
  ticketTiers: Array<{
    tier: string;
    sold: number;
    capacity: number;
    salesEnd: string | null;
    onSaleStatus: string;
  }>;
  roster: Array<{ artist: string; status: string | null; notes: string }>;
  socialScheduled: Array<{
    post: string;
    platform: string | null;
    goLive: string | null;
    published: boolean;
  }>;
  logisticsOpen: Array<{ item: string; category: string | null; done: boolean }>;
  adCopiesCount: number;
  flyersDraftCount: number;
}
