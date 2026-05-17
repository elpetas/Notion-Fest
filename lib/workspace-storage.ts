/**
 * Browser persistence for parent Notion URL and optional hub title from the home form.
 */

export const WORKSPACE_PARENT_URL_KEY = "notionchella-parent-page-url";
export const WORKSPACE_HUB_TITLE_KEY = "notionchella-hub-title";

export interface WorkspaceFormPrefs {
  parentPageUrl: string;
  hubTitle: string;
}

export function readWorkspacePrefs(): WorkspaceFormPrefs {
  if (typeof window === "undefined") {
    return { parentPageUrl: "", hubTitle: "" };
  }
  return {
    parentPageUrl:
      window.localStorage.getItem(WORKSPACE_PARENT_URL_KEY)?.trim() ?? "",
    hubTitle: window.localStorage.getItem(WORKSPACE_HUB_TITLE_KEY)?.trim() ?? "",
  };
}

export function writeWorkspacePrefs(prefs: WorkspaceFormPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = prefs.parentPageUrl.trim();
  const title = prefs.hubTitle.trim();
  if (url) {
    window.localStorage.setItem(WORKSPACE_PARENT_URL_KEY, url);
  } else {
    window.localStorage.removeItem(WORKSPACE_PARENT_URL_KEY);
  }
  if (title) {
    window.localStorage.setItem(WORKSPACE_HUB_TITLE_KEY, title);
  } else {
    window.localStorage.removeItem(WORKSPACE_HUB_TITLE_KEY);
  }
}
