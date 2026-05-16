/**
 * Landing page — primary entry to the festival planner chat.
 */

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-lg text-center">
        <p className="text-muted-foreground text-sm tracking-wide uppercase">
          Notion Fest demo
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Plan a music festival, then scaffold Notion
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          Chat with Claude to lock in budget, genre, dates, and vibe. When you
          are ready, push venues, marketing, roster, tickets, and logistics
          databases into your Notion workspace.
        </p>
        <Link
          className={cn(buttonVariants({ size: "lg" }), "mt-8")}
          href="/chat"
        >
          Start planning
        </Link>
      </div>
    </main>
  );
}
