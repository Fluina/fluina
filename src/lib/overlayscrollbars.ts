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
  env.setDefaultOptions({ scrollbars: { theme: OS_THEME, autoHide: "leave" } });

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

function updateScrollFadeVariables(
  targetEl: HTMLElement,
  viewport: HTMLElement,
  axis: ScrollAxis,
) {
  const {
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
  } = viewport;

  const maxScrollTop = scrollHeight - clientHeight;
  const isScrollableY = axis === "y" || axis === "both";
  const canScrollY = isScrollableY && maxScrollTop > 1;

  const maxScrollLeft = scrollWidth - clientWidth;
  const isScrollableX = axis === "x" || axis === "both";
  const canScrollX = isScrollableX && maxScrollLeft > 1;

  const fadeTop = canScrollY && scrollTop > 1 ? 1 : 0;
  const fadeBottom = canScrollY && scrollTop < maxScrollTop - 1 ? 1 : 0;
  const fadeLeft = canScrollX && scrollLeft > 1 ? 1 : 0;
  const fadeRight = canScrollX && scrollLeft < maxScrollLeft - 1 ? 1 : 0;

  const blurEl = targetEl.nextElementSibling;
  const targets =
    blurEl instanceof HTMLElement && blurEl.classList.contains("os-edge-blur")
      ? [targetEl, blurEl]
      : [targetEl];

  for (const el of targets) {
    el.style.setProperty("--os-fade-top", fadeTop.toString());
    el.style.setProperty("--os-fade-bottom", fadeBottom.toString());
    el.style.setProperty("--os-fade-left", fadeLeft.toString());
    el.style.setProperty("--os-fade-right", fadeRight.toString());
  }
}

function syncBlurRect(
  hostEl: HTMLElement,
  blurEl: HTMLElement,
  axis: ScrollAxis,
) {
  const verticalBar = hostEl.querySelector<HTMLElement>(
    ":scope > .os-scrollbar-vertical",
  );
  const horizontalBar = hostEl.querySelector<HTMLElement>(
    ":scope > .os-scrollbar-horizontal",
  );
  const barWidth =
    axis === "y" || axis === "both" ? (verticalBar?.offsetWidth ?? 0) : 0;
  const barHeight =
    axis === "x" || axis === "both" ? (horizontalBar?.offsetHeight ?? 0) : 0;

  blurEl.style.top = `${hostEl.offsetTop}px`;
  blurEl.style.left = `${hostEl.offsetLeft}px`;
  blurEl.style.width = `${Math.max(hostEl.offsetWidth - barWidth, 0)}px`;
  blurEl.style.height = `${Math.max(hostEl.offsetHeight - barHeight, 0)}px`;
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
      hostEl.setAttribute("data-os-edge-fade", "");
    }

    const handleScrollUpdate = (instance: OverlayScrollbarsInstance) => {
      const viewport = instance.elements().viewport;
      if (enableEdgeFade) {
        updateScrollFadeVariables(hostEl, viewport, axis);
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
      const viewport = osInstance.elements().viewport;
      const blurEl = document.createElement("div");

      blurEl.className = "os-edge-blur";
      blurEl.setAttribute("aria-hidden", "true");
      hostEl.after(blurEl);

      const updateEdgeFade = () => {
        syncBlurRect(hostEl, blurEl, axis);
        updateScrollFadeVariables(hostEl, viewport, axis);
      };
      const resizeObserver = new ResizeObserver(updateEdgeFade);

      resizeObserver.observe(viewport);
      resizeObserver.observe(hostEl);
      updateEdgeFade();
      requestAnimationFrame(updateEdgeFade);

      return () => {
        resizeObserver.disconnect();
        blurEl.remove();
        hostEl.removeAttribute("data-os-edge-fade");
        initCleanupRef.current?.();
        initCleanupRef.current = undefined;

        if (osInstanceRef.current === osInstance) {
          osInstance.destroy();
          osInstanceRef.current = null;
        }
      };
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