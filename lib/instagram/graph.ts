import { IG_GRAPH, getInstagramCredentials } from "@/lib/instagram/config";

interface GraphErrorBody {
  error?: { message: string };
}

export interface IgMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  permalink: string;
}

export interface IgComment {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  from?: { id: string; username?: string };
}

export interface IgConversation {
  id: string;
  updated_time?: string;
}

export interface IgMessage {
  id: string;
  created_time: string;
  message?: string;
  from?: { id: string; username?: string };
  to?: { data?: Array<{ id: string; username?: string }> };
}

async function igGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = getInstagramCredentials();
  const url = new URL(`${IG_GRAPH}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data = (await res.json()) as T & GraphErrorBody;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Instagram API error ${res.status}`);
  }
  return data;
}

export async function fetchRecentMedia(limit = 25): Promise<IgMediaItem[]> {
  const { userId } = getInstagramCredentials();
  const data = await igGet<{ data?: IgMediaItem[] }>(`/${userId}/media`, {
    fields:
      "id,caption,media_type,timestamp,like_count,comments_count,permalink",
    limit: String(limit),
  });
  return data.data ?? [];
}

/** When Meta returns counts but hides bodies (common in Development mode). */
export function devModeCommentWarning(
  media: IgMediaItem[],
  fetchedComments: number,
): string | null {
  const reported = media.reduce((sum, m) => sum + (m.comments_count ?? 0), 0);
  if (reported > 0 && fetchedComments === 0) {
    return (
      "Instagram reports comments on your posts but returned zero comment text. " +
      "This usually means your Meta app is in Development mode: switch the app to Live " +
      "(with a privacy policy URL), or add the commenter as an Instagram Tester on your app, " +
      "then regenerate your access token."
    );
  }
  return null;
}

export async function fetchMediaInsights(
  mediaId: string,
): Promise<{ views: number; reach: number; saved: number }> {
  try {
    const data = await igGet<{
      data?: Array<{
        name: string;
        values?: Array<{ value: number }>;
        total_value?: { value: number };
      }>;
    }>(`/${mediaId}/insights`, { metric: "views,reach,saved" });

    const metrics: Record<string, number> = {};
    for (const item of data.data ?? []) {
      metrics[item.name] =
        item.total_value?.value ?? item.values?.[0]?.value ?? 0;
    }
    return {
      views: metrics.views ?? 0,
      reach: metrics.reach ?? 0,
      saved: metrics.saved ?? 0,
    };
  } catch {
    return { views: 0, reach: 0, saved: 0 };
  }
}

export async function fetchMediaComments(mediaId: string): Promise<IgComment[]> {
  const data = await igGet<{ data?: IgComment[] }>(`/${mediaId}/comments`, {
    fields: "id,text,timestamp,from,username",
  });
  return data.data ?? [];
}

export async function fetchConversations(): Promise<IgConversation[]> {
  const { userId } = getInstagramCredentials();
  const data = await igGet<{ data?: IgConversation[] }>(`/${userId}/conversations`, {
    platform: "instagram",
  });
  return data.data ?? [];
}

export async function fetchConversationMessageIds(
  conversationId: string,
): Promise<Array<{ id: string; created_time: string }>> {
  const data = await igGet<{
    messages?: { data?: Array<{ id: string; created_time: string }> };
  }>(`/${conversationId}`, { fields: "messages" });
  return data.messages?.data ?? [];
}

export async function fetchMessage(messageId: string): Promise<IgMessage> {
  return igGet<IgMessage>(`/${messageId}`, {
    fields: "id,created_time,from,to,message",
  });
}

export async function replyToComment(commentId: string, text: string): Promise<string> {
  const { token } = getInstagramCredentials();
  const url = new URL(`${IG_GRAPH}/${commentId}/replies`);
  url.searchParams.set("message", text);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { method: "POST" });
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? `Failed to reply to comment (${res.status})`);
  }
  return data.id;
}

export async function sendDirectMessage(recipientId: string, text: string): Promise<string> {
  const { token, userId } = getInstagramCredentials();
  const res = await fetch(`${IG_GRAPH}/${userId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });
  const data = (await res.json()) as { message_id?: string; error?: { message: string } };
  if (!res.ok || !data.message_id) {
    throw new Error(data.error?.message ?? `Failed to send message (${res.status})`);
  }
  return data.message_id;
}

export async function fetchPostsWithInsights(limit = 25) {
  const media = await fetchRecentMedia(limit);
  return Promise.all(
    media.map(async (item) => {
      const insights = await fetchMediaInsights(item.id);
      return {
        id: item.id,
        caption: item.caption ?? "",
        mediaType: item.media_type,
        timestamp: item.timestamp,
        permalink: item.permalink,
        likes: item.like_count,
        comments: item.comments_count,
        views: insights.views,
        reach: insights.reach,
        saved: insights.saved,
      };
    }),
  );
}
