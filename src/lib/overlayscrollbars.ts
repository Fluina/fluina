import { OverlayScrollbars } from "overlayscrollbars";
import { type DependencyList, type RefObject, useEffect, useRef } from "react";

export const OS_THEME = "os-theme";

type OverlayScrollbarsInstance = ReturnType<typeof OverlayScrollbars>;

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

//  ================================================================
//    OverlayScroll
//  ================================================================

export type ScrollAxis = "x" | "y" | "both" | "none";

export interface UseOverlayScrollOptions<T extends HTMLElement = HTMLElement> {
  axis: ScrollAxis;
  enabled?: boolean;
  autoHide?: "never" | "scroll" | "leave" | "move";
  enableEdgeFade?: boolean;
  elementRef?: RefObject<T | null>;
  onScroll?: (
    viewport: HTMLElement,
    instance: OverlayScrollbarsInstance,
  ) => void;
  onInit?: (
    viewport: HTMLElement,
    instance: OverlayScrollbarsInstance,
  ) => (() => void) | undefined;
}

export interface UseOverlayScrollResult<T extends HTMLElement> {
  elementRef: RefObject<T | null>;
  osInstanceRef: RefObject<OverlayScrollbarsInstance | null>;
}

function getOverflowConfig(axis: ScrollAxis) {
  switch (axis) {
    case "x":
      return { x: "scroll", y: "hidden" } as const;
    case "y":
      return { x: "hidden", y: "scroll" } as const;
    case "both":
      return { x: "scroll", y: "scroll" } as const;
    case "none":
      return { x: "hidden", y: "hidden" } as const;
  }
}

function updateScrollFadeVariables(targetEl: HTMLElement, viewport: HTMLElement) {
  const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = viewport;

  const maxScrollTop = scrollHeight - clientHeight;
  const isScrollableY = maxScrollTop > 1;

  const maxScrollLeft = scrollWidth - clientWidth;
  const isScrollableX = maxScrollLeft > 1;

  const fadeTop = isScrollableY && scrollTop > 1 ? 1 : 0;
  const fadeBottom = isScrollableY && scrollTop < maxScrollTop - 1 ? 1 : 0;
  const fadeLeft = isScrollableX && scrollLeft > 1 ? 1 : 0;
  const fadeRight = isScrollableX && scrollLeft < maxScrollLeft - 1 ? 1 : 0;

  targetEl.style.setProperty("--os-fade-top", fadeTop.toString());
  targetEl.style.setProperty("--os-fade-bottom", fadeBottom.toString());
  targetEl.style.setProperty("--os-fade-left", fadeLeft.toString());
  targetEl.style.setProperty("--os-fade-right", fadeRight.toString());
}

export function useOverlayScroll<T extends HTMLElement = HTMLDivElement>(
  {
    axis,
    enabled = true,
    autoHide = "leave",
    enableEdgeFade = true,
    elementRef: externalRef,
    onScroll,
    onInit,
  }: UseOverlayScrollOptions<T>,
  deps: DependencyList = [],
): UseOverlayScrollResult<T> {
  const internalRef = useRef<T>(null);
  const elementRef = externalRef ?? internalRef;
  const osInstanceRef = useRef<OverlayScrollbarsInstance | null>(null);
  const onScrollRef = useRef(onScroll);
  const onInitRef = useRef(onInit);
  const initCleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    onScrollRef.current = onScroll;
    onInitRef.current = onInit;
  });

  useEffect(() => {
    if (!enabled || !elementRef.current) return;

    const hostEl = elementRef.current;

    if (enableEdgeFade) {
      hostEl.classList.add("os-edge-fade");
    }

    const handleScrollUpdate = (instance: OverlayScrollbarsInstance) => {
      const viewport = instance.elements().viewport;
      if (enableEdgeFade) {
        updateScrollFadeVariables(hostEl, viewport);
      }
      onScrollRef.current?.(viewport, instance);
    };

    const osInstance = OverlayScrollbars(
      hostEl,
      {
        scrollbars: { theme: OS_THEME, autoHide },
        overflow: getOverflowConfig(axis),
      },
      {
        scroll: handleScrollUpdate,
        updated: handleScrollUpdate,
      },
    );

    osInstanceRef.current = osInstance;

    if (enableEdgeFade) {
      requestAnimationFrame(() => {
        updateScrollFadeVariables(hostEl, osInstance.elements().viewport);
      });
    }

    return () => {
      initCleanupRef.current?.();
      initCleanupRef.current = undefined;

      if (osInstanceRef.current === osInstance) {
        osInstance.destroy();
        osInstanceRef.current = null;
      }
    };
  }, [axis, enabled, autoHide, enableEdgeFade, elementRef]);

  useEffect(() => {
    const instance = osInstanceRef.current;
    if (!instance) return;

    initCleanupRef.current?.();
    initCleanupRef.current = onInitRef.current?.(
      instance.elements().viewport,
      instance,
    );

    return () => {
      initCleanupRef.current?.();
      initCleanupRef.current = undefined;
    };
  }, [...deps]);

  return { elementRef, osInstanceRef };
}