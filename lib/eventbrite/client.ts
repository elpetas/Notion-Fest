const EB_API = "https://www.eventbriteapi.com/v3";

export function parseEventbriteId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    const match = last.match(/(\d+)$/);
    if (match) return match[1];
  } catch {
    // not a URL
  }
  return null;
}

function getApiKey(): string {
  const apiKey = process.env.EVENTBRITE_API_KEY?.trim();
  if (!apiKey) throw new Error("EVENTBRITE_API_KEY is not configured");
  return apiKey;
}

async function ebGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${EB_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  const data = (await res.json()) as T & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error_description ?? data.error ?? `Eventbrite error ${res.status}`,
    );
  }
  return data;
}

export interface EbTicketClass {
  id: string;
  name: string;
  description?: string | null;
  free: boolean;
  cost?: { major_value: string; display?: string };
  quantity_total: number;
  quantity_sold: number;
  on_sale_status?: string;
  sales_end?: string;
  hidden?: boolean;
}

export interface EbEventSummary {
  id: string;
  name: string;
  status: string;
  url: string;
  startUtc: string;
  endUtc: string;
  description: string;
  capacity: number | null;
  isSoldOut: boolean;
  venueName: string;
  venueAddress: string;
  venueCapacity: number | null;
}

export interface EbAttendee {
  id: string;
  name: string;
  email: string;
  status: string;
  checkedIn: boolean;
  created: string;
  ticketClassName: string;
  orderId: string;
}

export async function fetchEventSummary(eventId: string): Promise<EbEventSummary> {
  const data = await ebGet<{
    id: string;
    name?: { text?: string };
    description?: { text?: string };
    status?: string;
    url?: string;
    start?: { utc?: string };
    end?: { utc?: string };
    capacity?: number;
    venue?: {
      name?: string;
      capacity?: number;
      address?: { localized_address_display?: string };
    };
    ticket_availability?: { is_sold_out?: boolean };
  }>(`/events/${eventId}/`, {
    expand: "venue,ticket_availability",
  });

  return {
    id: data.id,
    name: data.name?.text ?? "Untitled event",
    status: data.status ?? "unknown",
    url: data.url ?? "",
    startUtc: data.start?.utc ?? "",
    endUtc: data.end?.utc ?? "",
    description: data.description?.text ?? "",
    capacity: data.capacity ?? null,
    isSoldOut: data.ticket_availability?.is_sold_out ?? false,
    venueName: data.venue?.name ?? "",
    venueAddress: data.venue?.address?.localized_address_display ?? "",
    venueCapacity: data.venue?.capacity ?? null,
  };
}

export async function fetchTicketClasses(eventId: string): Promise<EbTicketClass[]> {
  const data = await ebGet<{ ticket_classes?: EbTicketClass[] }>(
    `/events/${eventId}/ticket_classes/`,
  );
  return data.ticket_classes ?? [];
}

export async function fetchAllAttendees(eventId: string): Promise<EbAttendee[]> {
  const attendees: EbAttendee[] = [];
  let continuation: string | undefined;

  do {
    const params: Record<string, string> = { expand: "ticket_class" };
    if (continuation) params.continuation = continuation;

    const data = await ebGet<{
      attendees?: Array<{
        id: string;
        status?: string;
        checked_in?: boolean;
        created?: string;
        order_id?: string;
        profile?: {
          name?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
        };
        ticket_class?: { name?: string };
        ticket_class_name?: string;
      }>;
      pagination?: { has_more_items?: boolean; continuation?: string };
    }>(`/events/${eventId}/attendees/`, params);

    for (const a of data.attendees ?? []) {
      const name =
        a.profile?.name?.trim() ||
        [a.profile?.first_name, a.profile?.last_name].filter(Boolean).join(" ") ||
        "Guest";
      attendees.push({
        id: a.id,
        name,
        email: a.profile?.email ?? "",
        status: a.status ?? "",
        checkedIn: a.checked_in ?? false,
        created: a.created ?? "",
        ticketClassName: a.ticket_class?.name ?? a.ticket_class_name ?? "",
        orderId: a.order_id ?? "",
      });
    }

    continuation =
      data.pagination?.has_more_items && data.pagination.continuation
        ? data.pagination.continuation
        : undefined;
  } while (continuation);

  return attendees;
}
