import { OverlayScrollbars } from "overlayscrollbars";

export const OS_THEME = "os-theme";
export const OS_THEME_TEXTAREA = "os-theme-textarea";

let configured = false;

export function configureOverlayScrollbars(): void {
  if (configured || typeof document === "undefined") return;

  configured = true;

  const env = OverlayScrollbars.env();

  env.setDefaultInitialization({ cancel: { nativeScrollbarsOverlaid: true } });
  env.setDefaultOptions({ scrollbars: { theme: OS_THEME, autoHide: "never" } });
}

configureOverlayScrollbars();
