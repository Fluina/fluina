"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { useOverlayScrollbars } from "overlayscrollbars-react";
import { useEffect } from "react";
import "@/lib/overlayscrollbars";
import { MotionConfig } from "motion/react";
import { PreferencesProvider, usePreferences } from "@/app/preferences";

function ThemeFaviconSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const currentTheme = theme === "system" ? resolvedTheme : theme;
    const faviconHref =
      currentTheme === "light" ? "/favicon/dark.svg" : "/favicon/light.svg";
    const link = document.querySelector<HTMLLinkElement>("link#theme-favicon");

    if (link) {
      link.href = faviconHref;
    }
  }, [theme, resolvedTheme]);

  return null;
}

function BodyOverlayScrollbars() {
  const [initBodyOverlayScrollbars] = useOverlayScrollbars({ defer: true });

  useEffect(() => {
    initBodyOverlayScrollbars(document.body);
  }, [initBodyOverlayScrollbars]);

  return null;
}

function MotionPreferences({ children }: { children: React.ReactNode }) {
  const { parallaxEnabled } = usePreferences();

  return (
    <MotionConfig
      key={parallaxEnabled ? "motion-enabled" : "motion-disabled"}
      reducedMotion={parallaxEnabled ? "never" : "always"}
      transition={parallaxEnabled ? undefined : { duration: 0 }}
    >
      {children}
    </MotionConfig>
  );
}

export default function Client({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <PreferencesProvider>
        <MotionPreferences>
          <ThemeFaviconSync />
          <BodyOverlayScrollbars />
          <main className="size-full overflow-clip flex justify-center items-center pt-[env(safe-area-inset-top,1rem)] pb-[env(safe-area-inset-bottom,1rem)] pl-[env(safe-area-inset-left,1rem)] pr-[env(safe-area-inset-right,1rem)]">
            {children}
          </main>
        </MotionPreferences>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
