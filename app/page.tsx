/**
 * Landing page — hero and feature overview before the festival planner chat.
 */

import { CalendarDays, MapPin, Megaphone, Music2 } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const featureGroups = [
  {
    title: "Venues & ops",
    icon: MapPin,
    items: ["Venues & capacity", "Merch & logistics checklist", "Ticket tiers"],
  },
  {
    title: "Marketing & creative",
    icon: Megaphone,
    items: ["Flyer designs", "Ad copies", "Social schedule", "Audience segments"],
  },
  {
    title: "Talent & experience",
    icon: Music2,
    items: ["DJ roster", "Set notes & fees"],
  },
] as const;

export default function Home() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col">
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 md:py-24">
        <div className="max-w-2xl text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase">
            Notion Fest
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Plan your festival. Scaffold your workspace.
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-lg text-base leading-relaxed text-pretty md:text-lg">
            Chat through budget, genre, dates, and vibe with a guided agent.
            When you are ready, push a structured planning hub into Notion —
            venues, marketing, roster, tickets, and logistics in one place.
          </p>
          <Link
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-10 rounded-xl px-6 shadow-sm",
            )}
            href="/chat"
          >
            Start planning →
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="feature-overview-heading"
        className="border-border border-t bg-[#f2f1ee] px-6 py-14 md:py-16"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 flex flex-col gap-2 text-center md:text-left">
            <div className="text-muted-foreground flex items-center justify-center gap-2 md:justify-start">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <span className="text-xs font-medium tracking-wide uppercase">
                What lands in Notion
              </span>
            </div>
            <h2
              id="feature-overview-heading"
              className="text-foreground text-xl font-semibold tracking-tight md:text-2xl"
            >
              Eight databases, grouped how organizers think
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {featureGroups.map(({ title, icon: Icon, items }) => (
              <div
                key={title}
                className="border-border bg-card text-card-foreground flex flex-col rounded-xl border p-5 shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
              >
                <div className="bg-primary/10 text-primary mb-4 inline-flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  {title}
                </h3>
                <ul className="text-muted-foreground mt-3 space-y-2 text-sm leading-snug">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-primary mt-1.5 inline-block size-1 shrink-0 rounded-full bg-current opacity-60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
