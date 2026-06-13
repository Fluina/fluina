"use client";
import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { useOverlayScrollbars } from "overlayscrollbars-react";
import "@/lib/overlayscrollbars";

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

// Hand the document's own scrolling to OverlayScrollbars so the whole app shares the same
// custom scrollbar. On overlay-scrollbar platforms the global `cancel` default kicks in and
// this is a no-op, leaving the native page scroll alone.
function BodyOverlayScrollbars() {
  const [initBodyOverlayScrollbars] = useOverlayScrollbars({ defer: true });

  useEffect(() => {
    initBodyOverlayScrollbars(document.body);
  }, [initBodyOverlayScrollbars]);

  return null;
}

export default function Client({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <ThemeFaviconSync />
      <BodyOverlayScrollbars />
      <main className="size-full flex justify-center items-center">{children}</main>
    </ThemeProvider>
  );
}
