import { OverlayScrollbars } from "overlayscrollbars";
import {
  type DependencyList,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

export const OS_THEME = "os-theme";

type OverlayScrollbarsInstance = ReturnType<typeof OverlayScrollbars>;

declare global {
  interface Window {
    __fluinaSetNativeScrollPreview?: (enabled: boolean) => void;
  }
}

const NATIVE_SCROLL_PREVIEW_EVENT = "fluina:native-scroll-preview";

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.__fluinaSetNativeScrollPreview = (enabled) => {
    window.dispatchEvent(
      new CustomEvent(NATIVE_SCROLL_PREVIEW_EVENT, { detail: enabled }),
    );
  };
}

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
    instance: OverlayScrollbarsInstance | null,
  ) => void;
  onInit?: (
    viewport: HTMLElement,
    instance: OverlayScrollbarsInstance | null,
  ) => (() => void) | undefined;
}

export interface UseOverlayScrollResult<T extends HTMLElement> {
  elementRef: RefObject<T | null>;
  osInstanceRef: RefObject<OverlayScrollbarsInstance | null>;
}

/**
 * OverlayScrollbars が実際に有効化されているかを判定する。
 * 初期化がキャンセルされた instance は destroy 済みなのに
 * `state().destroyed` が false のままなので、viewport 属性の有無も見る。
 */
function isOverlayScrollbarsActive(
  hostEl: HTMLElement,
  instance: OverlayScrollbarsInstance | undefined,
): boolean {
  if (!instance) return false;

  try {
    if (instance.state().destroyed) return false;

    const viewport = instance.elements().viewport;

    return (
      hostEl.isConnected &&
      viewport.hasAttribute("data-overlayscrollbars-viewport")
    );
  } catch {
    return false;
  }
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

function getOverflowClasses(axis: ScrollAxis) {
  switch (axis) {
    case "x":
      return ["overflow-x-auto"];
    case "y":
      return ["overflow-y-auto"];
    case "both":
      return ["overflow-x-auto", "overflow-y-auto"];
    case "none":
      return [];
  }
}

function applyOverflowClasses(hostEl: HTMLElement, axis: ScrollAxis) {
  const classes = getOverflowClasses(axis);
  const addedClasses = classes.filter(
    (className) => !hostEl.classList.contains(className),
  );

  hostEl.classList.add(...addedClasses);

  return () => {
    hostEl.classList.remove(...addedClasses);
  };
}

function applyNativeOverflow(hostEl: HTMLElement, axis: ScrollAxis) {
  const originalOverflowX = hostEl.style.getPropertyValue("overflow-x");
  const originalOverflowXPriority =
    hostEl.style.getPropertyPriority("overflow-x");
  const originalOverflowY = hostEl.style.getPropertyValue("overflow-y");
  const originalOverflowYPriority =
    hostEl.style.getPropertyPriority("overflow-y");
  const overflowX = axis === "x" || axis === "both" ? "auto" : "hidden";
  const overflowY = axis === "y" || axis === "both" ? "auto" : "hidden";

  hostEl.style.setProperty("overflow-x", overflowX);
  hostEl.style.setProperty("overflow-y", overflowY);

  return () => {
    if (originalOverflowX) {
      hostEl.style.setProperty(
        "overflow-x",
        originalOverflowX,
        originalOverflowXPriority,
      );
    } else {
      hostEl.style.removeProperty("overflow-x");
    }

    if (originalOverflowY) {
      hostEl.style.setProperty(
        "overflow-y",
        originalOverflowY,
        originalOverflowYPriority,
      );
    } else {
      hostEl.style.removeProperty("overflow-y");
    }
  };
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

  const edgeOverlay = targetEl.nextElementSibling;
  const targets = [targetEl];
  if (
    edgeOverlay instanceof HTMLElement &&
    edgeOverlay.classList.contains("os-edge-blur")
  ) {
    targets.push(edgeOverlay);
  }

  for (const el of targets) {
    el.style.setProperty("--os-fade-top", fadeTop.toString());
    el.style.setProperty("--os-fade-bottom", fadeBottom.toString());
    el.style.setProperty("--os-fade-left", fadeLeft.toString());
    el.style.setProperty("--os-fade-right", fadeRight.toString());
  }
}

function setOverlayRect(
  hostEl: HTMLElement,
  overlayEl: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const offsetParent = overlayEl.offsetParent;
  const hostRect = hostEl.getBoundingClientRect();
  if (offsetParent instanceof HTMLElement) {
    const parentRect = offsetParent.getBoundingClientRect();
    left += hostRect.left - parentRect.left - offsetParent.clientLeft;
    top += hostRect.top - parentRect.top - offsetParent.clientTop;
    left += offsetParent.scrollLeft;
    top += offsetParent.scrollTop;
  } else {
    left += hostRect.left + window.scrollX;
    top += hostRect.top + window.scrollY;
  }

  overlayEl.style.left = `${left}px`;
  overlayEl.style.top = `${top}px`;
  overlayEl.style.width = `${width}px`;
  overlayEl.style.height = `${height}px`;
}

function syncBlurRect(hostEl: HTMLElement, blurEl: HTMLElement) {
  setOverlayRect(
    hostEl,
    blurEl,
    0,
    0,
    hostEl.offsetWidth,
    hostEl.offsetHeight,
  );
}

function syncNativeOverlayRect(
  hostEl: HTMLElement,
  overlayEl: HTMLElement,
) {
  const style = getComputedStyle(hostEl);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

  setOverlayRect(
    hostEl,
    overlayEl,
    borderLeft,
    borderTop,
    Math.max(hostEl.offsetWidth - borderLeft - borderRight, 0),
    Math.max(hostEl.offsetHeight - borderTop - borderBottom, 0),
  );
}

/**
 * 子要素を ResizeObserver に登録する。
 * `display: contents` の要素は箱を持たず通知が来ないため、その内側まで辿る。
 */
function observeThroughContents(parent: HTMLElement, observer: ResizeObserver) {
  for (const child of parent.children) {
    if (!(child instanceof HTMLElement)) continue;

    observer.observe(child);

    if (getComputedStyle(child).display === "contents") {
      observeThroughContents(child, observer);
    }
  }
}

function setupEdgeFade(
  hostEl: HTMLElement,
  viewport: HTMLElement,
  axis: ScrollAxis,
  native: boolean,
) {
  hostEl.setAttribute("data-os-edge-fade", "");
  if (native) hostEl.setAttribute("data-os-native-scroll", "");

  const edgeOverlay = document.createElement("div");
  edgeOverlay.className = "os-edge-blur";
  edgeOverlay.setAttribute("aria-hidden", "true");
  hostEl.after(edgeOverlay);

  const update = () => {
    if (native) {
      syncNativeOverlayRect(hostEl, edgeOverlay);
    } else {
      syncBlurRect(hostEl, edgeOverlay);
    }
    updateScrollFadeVariables(hostEl, viewport, axis);
  };
  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(viewport);
  resizeObserver.observe(hostEl);

  let mutationObserver: MutationObserver | undefined;
  if (native) {
    observeThroughContents(hostEl, resizeObserver);
    mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) {
            resizeObserver.observe(node);
            observeThroughContents(node, resizeObserver);
          }
        }
      }
      update();
    });
    mutationObserver.observe(hostEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  update();
  const frame = requestAnimationFrame(update);
  const visualViewport = window.visualViewport;
  document.addEventListener("scroll", update, true);
  window.addEventListener("resize", update);
  visualViewport?.addEventListener("scroll", update);
  visualViewport?.addEventListener("resize", update);

  return {
    update,
    cleanup: () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      visualViewport?.removeEventListener("resize", update);
      mutationObserver?.disconnect();
      resizeObserver.disconnect();
      edgeOverlay.remove();
      hostEl.removeAttribute("data-os-edge-fade");
      hostEl.removeAttribute("data-os-native-scroll");
    },
  };
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
  const hasInitEffectRunRef = useRef(false);
  const reinitializeCallbacksRef = useRef<() => void>(() => { });
  const [forceNativeScroll, setForceNativeScroll] = useState(false);

  useEffect(() => {
    onScrollRef.current = onScroll;
    onInitRef.current = onInit;
    elementRef.current?.classList.add(...getOverflowClasses(axis));
  });

  useEffect(() => {
    const handleNativeScrollPreview = (event: Event) => {
      setForceNativeScroll(
        (event as CustomEvent<boolean>).detail,
      );
    };

    window.addEventListener(
      NATIVE_SCROLL_PREVIEW_EVENT,
      handleNativeScrollPreview,
    );
    return () => {
      window.removeEventListener(
        NATIVE_SCROLL_PREVIEW_EVENT,
        handleNativeScrollPreview,
      );
    };
  }, []);

  useEffect(() => {
    if (!elementRef.current) return;

    const hostEl = elementRef.current;
    const restoreOverflowClasses = applyOverflowClasses(hostEl, axis);
    const initializeCallbacks = (
      viewport: HTMLElement,
      instance: OverlayScrollbarsInstance | null,
    ) => {
      initCleanupRef.current?.();
      initCleanupRef.current = onInitRef.current?.(viewport, instance);
    };

    const setupNativeScroll = () => {
      const restoreNativeOverflow = applyNativeOverflow(hostEl, axis);
      const edgeFade = enableEdgeFade
        ? setupEdgeFade(hostEl, hostEl, axis, true)
        : undefined;
      const handleNativeScroll = () => {
        edgeFade?.update();
        onScrollRef.current?.(hostEl, null);
      };

      hostEl.addEventListener("scroll", handleNativeScroll, { passive: true });
      initializeCallbacks(hostEl, null);
      reinitializeCallbacksRef.current = () =>
        initializeCallbacks(hostEl, null);

      return () => {
        hostEl.removeEventListener("scroll", handleNativeScroll);
        edgeFade?.cleanup();
        initCleanupRef.current?.();
        initCleanupRef.current = undefined;
        restoreNativeOverflow();
        restoreOverflowClasses();
      };
    };

    // iOS など、ネイティブスクロールバーがオーバーレイ型の環境では
    // OverlayScrollbars の初期化がキャンセルされる (cancel.nativeScrollbarsOverlaid)。
    // その場合はネイティブスクロール経路 (フェード付き) を使う。
    const { scrollbarsOverlaid } = OverlayScrollbars.env();
    const isNativeOverlaid = scrollbarsOverlaid.x || scrollbarsOverlaid.y;

    if (!enabled || forceNativeScroll || isNativeOverlaid) {
      const cleanupNativeScroll = setupNativeScroll();
      return () => {
        cleanupNativeScroll();
        restoreOverflowClasses();
      };
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

    if (!osInstance || !isOverlayScrollbarsActive(hostEl, osInstance)) {
      osInstance?.destroy();
      const cleanupNativeScroll = setupNativeScroll();
      return () => {
        cleanupNativeScroll();
        restoreOverflowClasses();
      };
    }

    osInstanceRef.current = osInstance;

    let edgeFade:
      | ReturnType<typeof setupEdgeFade>
      | undefined;
    if (enableEdgeFade) {
      const viewport = osInstance.elements().viewport;
      edgeFade = setupEdgeFade(hostEl, viewport, axis, false);
    }

    initializeCallbacks(osInstance.elements().viewport, osInstance);
    reinitializeCallbacksRef.current = () =>
      initializeCallbacks(osInstance.elements().viewport, osInstance);

    return () => {
      edgeFade?.cleanup();
      initCleanupRef.current?.();
      initCleanupRef.current = undefined;

      if (osInstanceRef.current === osInstance) {
        osInstance.destroy();
        osInstanceRef.current = null;
      }
      restoreOverflowClasses();
    };
  }, [axis, enabled, autoHide, enableEdgeFade, elementRef, forceNativeScroll]);

  useEffect(() => {
    if (!hasInitEffectRunRef.current) {
      hasInitEffectRunRef.current = true;
      return;
    }

    initCleanupRef.current?.();
    reinitializeCallbacksRef.current();

    return () => {
      initCleanupRef.current?.();
      initCleanupRef.current = undefined;
    };
  }, [...deps]);

  return { elementRef, osInstanceRef };
}