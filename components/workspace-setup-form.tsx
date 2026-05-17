/**
 * Home screen form — glass inputs (react-glass-ui) + persisted prefs for /chat + setup API.
 */

"use client";

import { GlassCard, GlassInput } from "react-glass-ui";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  readWorkspacePrefs,
  writeWorkspacePrefs,
} from "@/lib/workspace-storage";

interface WorkspaceSetupFormProps {
  /** merge into the outer width wrapper */
  className?: string;
}

/**
 * Tuned to match the reference — clean frosted glass, very subtle border,
 * minimal distortion, muted placeholder feel.
 */
const glassPreset = {
  blur: 7,
  distortion: 6,
  chromaticAberration: 0,
  borderRadius: 14,
  borderSize: 1,
  borderOpacity: 0.18,
  borderColor: "#ffffff",
  backgroundColor: "#ffffff",
  backgroundOpacity: 0.14,
  color: "#ffffff",
  saturation: 105,
  brightness: 102,
  flexibility: 0,
  innerLightOpacity: 0.04,
  outerLightOpacity: 0.06,
} as const;

export function WorkspaceSetupForm({ className }: WorkspaceSetupFormProps) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [parentPageUrl, setParentPageUrl] = useState("");
  const [hubTitle, setHubTitle] = useState("");
  const [glassWidth, setGlassWidth] = useState(400);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time localStorage hydration after SSR */
    const saved = readWorkspacePrefs();
    setParentPageUrl(saved.parentPageUrl);
    setHubTitle(saved.hubTitle);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const width = Math.floor(el.getBoundingClientRect().width);
      if (width > 0) {
        setGlassWidth(width);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerControlWidth = Math.max(260, glassWidth - 56);

  const handleContinue = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      writeWorkspacePrefs({ parentPageUrl, hubTitle });
      router.push("/sync");
    },
    [hubTitle, parentPageUrl, router],
  );

  return (
    <div ref={wrapRef} className={cn("glass-form w-full max-w-md", className)}>
      <form onSubmit={handleContinue}>
        <GlassCard
          {...glassPreset}
          width={glassWidth}
          padding="22px 26px"
          contentClassName="flex flex-col gap-6 items-stretch"
          contentCenter={false}
        >
          <div className="flex flex-col gap-2">
            <label
              htmlFor="hub-title"
              className="block text-[13px] font-medium text-white/90"
            >
              Event name
            </label>
            <GlassInput
              {...glassPreset}
              id="hub-title"
              name="hubTitle"
              placeholder="e.g. Desert Bloom Festival"
              value={hubTitle}
              onChange={(ev) => setHubTitle(ev.target.value)}
              width={innerControlWidth}
              height={46}
              padding="12px 14px"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="parent-url"
              className="block text-[13px] font-medium text-white/90"
            >
              Notion workspace page
            </label>
            <GlassInput
            {...glassPreset}
            id="parent-url"
            name="parentPageUrl"
            placeholder="Paste your Notion page URL"
            value={parentPageUrl}
            onChange={(ev) => setParentPageUrl(ev.target.value)}
            type="url"
            width={innerControlWidth}
            height={46}
            padding="12px 14px"
          />
          </div>
          <Button
              type="submit"
              size="lg"
              className="w-full"
            >
              Start planning →
            </Button>
        </GlassCard>
      </form>
    </div>
  );
}
