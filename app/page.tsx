/**
 * Notionchella — full-viewport hero image + workspace setup.
 *
 * background-size: cover fills the viewport without distorting the photo (edges crop as needed).
 * for edge-to-edge imagery on ultrawide screens, use a wide asset (~2400px+) or accept side crop.
 */

import { WorkspaceSetupForm } from "@/components/workspace-setup-form";

export default function Home() {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col">
      {/* background photo with vintage film-filter applied */}
      <div
        className="hero-photo-bg pointer-events-none absolute inset-0 z-0 bg-cover bg-[center_bottom] bg-no-repeat"
        style={{
          backgroundImage: "url(/coachella-valley-hero-banner.jpg)",
        }}
        aria-hidden
      />
      {/* animated grain overlay — gives the grainy film-photo texture */}
      <div
        className="hero-grain pointer-events-none absolute inset-0 z-[1] opacity-[0.18]"
        aria-hidden
      />
      {/* warm amber wash pushing toward golden-hour sunset tones */}
      <div
        className="hero-warm-wash pointer-events-none absolute inset-0 z-[2]"
        aria-hidden
      />
      {/* dark vignette so text stays readable over any photo */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/20 via-black/10 to-black/55"
        aria-hidden
      />

      <div className="relative z-[10] flex min-h-[100dvh] w-full flex-1 flex-col items-center justify-center px-4 pb-4 pt-16 md:px-6 md:pb-8 md:pt-20">
        <div className="-mt-8 mx-auto w-full max-w-lg shrink-0 text-center">
          <h1 className="font-chella text-5xl leading-none tracking-tight text-balance text-white drop-shadow-md md:text-6xl lg:text-7xl">
            Notionchella
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-snug font-normal text-pretty text-white/95 drop-shadow-md md:text-xl">
            Plan your next event with just a few words
          </p>
        </div>

        <div className="mx-auto mt-10 flex w-full max-w-lg justify-center md:mt-12">
          <WorkspaceSetupForm />
        </div>
      </div>
    </main>
  );
}
