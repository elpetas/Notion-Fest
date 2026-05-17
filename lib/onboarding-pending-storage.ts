/**
 * Persists onboarding picks in localStorage until the Notion hub exists.
 */

import type { PendingOnboardingData } from "@/types/onboarding-pending";

const STORAGE_KEY = "notionFestPendingOnboarding";

export function readPendingOnboarding(): PendingOnboardingData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingOnboardingData;
  } catch {
    return null;
  }
}

export function savePendingOnboarding(patch: Partial<PendingOnboardingData>): void {
  if (typeof window === "undefined") return;
  const current = readPendingOnboarding() ?? {};
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
}

export function clearPendingOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasPendingOnboarding(): boolean {
  const p = readPendingOnboarding();
  if (!p) return false;
  return Boolean(
    p.eventbriteUrl ||
      (p.instagramPosts && p.instagramPosts.length > 0) ||
      (p.artists && p.artists.length > 0),
  );
}
