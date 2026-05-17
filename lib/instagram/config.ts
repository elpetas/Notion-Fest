export const IG_GRAPH_VERSION = "v21.0";
export const IG_GRAPH = `https://graph.instagram.com/${IG_GRAPH_VERSION}`;

export function getInstagramCredentials(): { token: string; userId: string } {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = process.env.INSTAGRAM_USER_ID?.trim();
  if (!token || !userId) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID must be configured");
  }
  return { token, userId };
}
