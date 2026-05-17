/**
 * Renders the sticky Notionchella nav on every page except the home page ("/").
 * Lives in the root layout so any new route gets it automatically.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();

  // home page has its own full-bleed hero layout — no shared nav needed
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center border-b border-white/15 bg-white/5 px-5 backdrop-blur-md">
      <Link
        href="/"
        className="font-chella text-xl leading-none text-white drop-shadow-sm transition-opacity hover:opacity-75"
      >
        Notionchella
      </Link>
    </header>
  );
}
