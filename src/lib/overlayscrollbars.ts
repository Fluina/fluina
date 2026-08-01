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

  const isScrollbarTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest(".os-scrollbar-handle, .os-scrollbar-track") !== null;

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (isScrollbarTarget(e.target)) {
        document.body.classList.add("os-interacting");
      }
    },
    { capture: true },
  );

  const stopInteracting = () => {
    document.body.classList.remove("os-interacting");
  };

  document.addEventListener("pointerup", stopInteracting, { capture: true });
  document.addEventListener("pointercancel", stopInteracting, {
    capture: true,
  });
}

configureOverlayScrollbars();
