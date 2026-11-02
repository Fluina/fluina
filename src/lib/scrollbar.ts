import { type DependencyList, type RefObject, useEffect, useRef } from "react";

export type ScrollAxis = "x" | "y" | "both" | "none";

export interface UseNativeScrollOptions<T extends HTMLElement = HTMLElement> {
  axis: ScrollAxis;
  enableEdgeFade?: boolean;
  elementRef?: RefObject<T | null>;
  onScroll?: (viewport: HTMLElement) => void;
  onInit?: (viewport: HTMLElement) => (() => void) | undefined;
}

export interface UseNativeScrollResult<T extends HTMLElement> {
  elementRef: RefObject<T | null>;
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

function applyOverflow(host: HTMLElement, axis: ScrollAxis) {
  const classes = getOverflowClasses(axis);
  const addedClasses = classes.filter(
    (className) => !host.classList.contains(className),
  );
  const originalStyles = ["overflow-x", "overflow-y", "scroll-behavior"].map(
    (property) => ({
      property,
      value: host.style.getPropertyValue(property),
      priority: host.style.getPropertyPriority(property),
    }),
  );
  const overflowX = axis === "x" || axis === "both" ? "auto" : "hidden";
  const overflowY = axis === "y" || axis === "both" ? "auto" : "hidden";

  host.classList.add(...addedClasses);
  host.style.setProperty("overflow-x", overflowX);
  host.style.setProperty("overflow-y", overflowY);
  host.style.setProperty("scroll-behavior", "auto");

  return () => {
    host.classList.remove(...addedClasses);
    for (const { property, value, priority } of originalStyles) {
      if (value) {
        host.style.setProperty(property, value, priority);
      } else {
        host.style.removeProperty(property);
      }
    }
  };
}

function updateScrollFadeVariables(
  host: HTMLElement,
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
  const canScrollY = (axis === "y" || axis === "both") && maxScrollTop > 1;
  const maxScrollLeft = scrollWidth - clientWidth;
  const canScrollX = (axis === "x" || axis === "both") && maxScrollLeft > 1;
  const viewportTop = viewport.getBoundingClientRect().top + viewport.clientTop;
  const anchorTolerance = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  const isAtTopAnchor = Array.from(
    viewport.querySelectorAll<HTMLElement>("[data-scroll-fade-top-anchor]"),
  ).some(
    (anchor) =>
      Math.abs(anchor.getBoundingClientRect().top - viewportTop) <=
      anchorTolerance,
  );
  const fadeValues = {
    top: canScrollY && scrollTop > 1 && !isAtTopAnchor ? 1 : 0,
    bottom: canScrollY && scrollTop < maxScrollTop - 1 ? 1 : 0,
    left: canScrollX && scrollLeft > 1 ? 1 : 0,
    right: canScrollX && scrollLeft < maxScrollLeft - 1 ? 1 : 0,
  };
  const targets = [host];
  const edgeOverlay = host.nextElementSibling;
  if (
    edgeOverlay instanceof HTMLElement &&
    edgeOverlay.classList.contains("scroll-edge-blur")
  ) {
    targets.push(edgeOverlay);
  }

  for (const target of targets) {
    for (const [edge, value] of Object.entries(fadeValues)) {
      target.style.setProperty(`--scroll-fade-${edge}`, value.toString());
    }
  }
}

function setOverlayRect(
  host: HTMLElement,
  overlay: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const offsetParent = overlay.offsetParent;
  const hostRect = host.getBoundingClientRect();
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

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
}

function syncEdgeOverlayRect(host: HTMLElement, overlay: HTMLElement) {
  const style = getComputedStyle(host);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

  setOverlayRect(
    host,
    overlay,
    borderLeft,
    borderTop,
    Math.max(host.offsetWidth - borderLeft - borderRight, 0),
    Math.max(host.offsetHeight - borderTop - borderBottom, 0),
  );
}

function observeThroughContents(parent: HTMLElement, observer: ResizeObserver) {
  for (const child of parent.children) {
    if (!(child instanceof HTMLElement)) continue;
    observer.observe(child);
    if (getComputedStyle(child).display === "contents") {
      observeThroughContents(child, observer);
    }
  }
}

type FadeEdge = "top" | "bottom" | "left" | "right";

function resolveFadeSize(host: HTMLElement): number {
  const raw = getComputedStyle(host)
    .getPropertyValue("--scroll-fade-size")
    .trim();
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return 0;
  if (raw.endsWith("rem")) {
    return (
      value *
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    );
  }
  if (raw.endsWith("em")) {
    return value * Number.parseFloat(getComputedStyle(host).fontSize);
  }
  return value;
}

function setupFadeInteraction(host: HTMLElement, viewport: HTMLElement) {
  const getEdge = (event: PointerEvent | MouseEvent): FadeEdge | null => {
    const rect = viewport.getBoundingClientRect();
    const left = rect.left + viewport.clientLeft;
    const top = rect.top + viewport.clientTop;
    const x = event.clientX - left;
    const y = event.clientY - top;
    if (
      x < 0 ||
      y < 0 ||
      x > viewport.clientWidth ||
      y > viewport.clientHeight
    ) {
      return null;
    }

    const size = resolveFadeSize(host) / 2;
    const candidates: [FadeEdge, number][] = [];
    const active = (name: string) =>
      host.style.getPropertyValue(`--scroll-fade-${name}`) === "1";
    if (active("top") && y <= size) candidates.push(["top", y]);
    if (active("bottom") && viewport.clientHeight - y <= size) {
      candidates.push(["bottom", viewport.clientHeight - y]);
    }
    if (active("left") && x <= size) candidates.push(["left", x]);
    if (active("right") && viewport.clientWidth - x <= size) {
      candidates.push(["right", viewport.clientWidth - x]);
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a[1] - b[1]);
    return candidates[0][0];
  };

  const playRipple = (edge: FadeEdge, event: MouseEvent) => {
    const rect = viewport.getBoundingClientRect();
    const size = resolveFadeSize(host) / 2;
    const left = rect.left + viewport.clientLeft;
    const top = rect.top + viewport.clientTop;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const region = {
      left: edge === "right" ? left + width - size : left,
      top: edge === "bottom" ? top + height - size : top,
      width: edge === "left" || edge === "right" ? size : width,
      height: edge === "top" || edge === "bottom" ? size : height,
    };

    const container = document.createElement("span");
    container.setAttribute("aria-hidden", "true");
    container.className =
      "scroll-edge-ripple pointer-events-none fixed overflow-clip z-50";
    container.dataset.edge = edge;
    container.style.left = `${region.left}px`;
    container.style.top = `${region.top}px`;
    container.style.width = `${region.width}px`;
    container.style.height = `${region.height}px`;

    const x = event.clientX - region.left;
    const y = event.clientY - region.top;
    const rippleSize =
      Math.max(
        Math.hypot(x, y),
        Math.hypot(region.width - x, y),
        Math.hypot(x, region.height - y),
        Math.hypot(region.width - x, region.height - y),
      ) * 2;
    const ripple = document.createElement("span");
    ripple.className =
      "all pointer-events-none absolute overflow-clip bg-fore-1 scale-0 opacity-50";
    ripple.style.width = `${rippleSize}px`;
    ripple.style.height = `${rippleSize}px`;
    ripple.style.left = `${x - rippleSize / 2}px`;
    ripple.style.top = `${y - rippleSize / 2}px`;
    container.append(ripple);
    document.body.append(container);

    setTimeout(() => {
      ripple.classList.remove("scale-0", "opacity-50");
      ripple.classList.add("scale-100", "opacity-0");
    }, 10);
    setTimeout(() => container.remove(), 500);
  };

  const setCursor = (edge: FadeEdge | null) => {
    if (edge === "top" || edge === "bottom") {
      host.setAttribute("data-scroll-fade-cursor", "row");
    } else if (edge === "left" || edge === "right") {
      host.setAttribute("data-scroll-fade-cursor", "col");
    } else {
      host.removeAttribute("data-scroll-fade-cursor");
    }
  };

  let downX = 0;
  let downY = 0;
  let downEdge: FadeEdge | null = null;
  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    setCursor(getEdge(event));
  };
  const handlePointerLeave = () => setCursor(null);
  const handlePointerDown = (event: PointerEvent) => {
    downX = event.clientX;
    downY = event.clientY;
    downEdge = getEdge(event);
  };
  const handleClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const edge = getEdge(event);
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY) > 5;
    if (!edge || edge !== downEdge || moved) return;
    if (window.getSelection()?.toString()) return;

    event.preventDefault();
    event.stopPropagation();
    playRipple(edge, event);
    viewport.scrollTo({
      top:
        edge === "top"
          ? 0
          : edge === "bottom"
            ? viewport.scrollHeight
            : undefined,
      left:
        edge === "left"
          ? 0
          : edge === "right"
            ? viewport.scrollWidth
            : undefined,
      behavior: "smooth",
    });
  };

  viewport.addEventListener("pointermove", handlePointerMove);
  viewport.addEventListener("pointerleave", handlePointerLeave);
  viewport.addEventListener("pointerdown", handlePointerDown, true);
  viewport.addEventListener("click", handleClick, true);

  return () => {
    viewport.removeEventListener("pointermove", handlePointerMove);
    viewport.removeEventListener("pointerleave", handlePointerLeave);
    viewport.removeEventListener("pointerdown", handlePointerDown, true);
    viewport.removeEventListener("click", handleClick, true);
    host.removeAttribute("data-scroll-fade-cursor");
  };
}

function setupEdgeFade(host: HTMLElement, axis: ScrollAxis) {
  host.setAttribute("data-scroll-edge-fade", "");
  const edgeOverlay = document.createElement("div");
  edgeOverlay.className = "scroll-edge-blur";
  edgeOverlay.setAttribute("aria-hidden", "true");
  host.after(edgeOverlay);

  const update = () => {
    syncEdgeOverlayRect(host, edgeOverlay);
    updateScrollFadeVariables(host, host, axis);
  };
  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(host);
  observeThroughContents(host, resizeObserver);

  const mutationObserver = new MutationObserver((records) => {
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
  mutationObserver.observe(host, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  const cleanupInteraction = setupFadeInteraction(host, host);
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
      cleanupInteraction();
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      visualViewport?.removeEventListener("resize", update);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      edgeOverlay.remove();
      host.removeAttribute("data-scroll-edge-fade");
    },
  };
}

export function useNativeScroll<T extends HTMLElement = HTMLDivElement>(
  {
    axis,
    enableEdgeFade = true,
    elementRef: externalRef,
    onScroll,
    onInit,
  }: UseNativeScrollOptions<T>,
  deps: DependencyList = [],
): UseNativeScrollResult<T> {
  const internalRef = useRef<T>(null);
  const elementRef = externalRef ?? internalRef;
  const onScrollRef = useRef(onScroll);
  const onInitRef = useRef(onInit);
  const initCleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    onScrollRef.current = onScroll;
    onInitRef.current = onInit;
  });

  useEffect(() => {
    const host = elementRef.current;
    if (!host) return;

    const restoreOverflow = applyOverflow(host, axis);
    const edgeFade = enableEdgeFade ? setupEdgeFade(host, axis) : undefined;
    const initializeCallbacks = () => {
      initCleanupRef.current?.();
      initCleanupRef.current = onInitRef.current?.(host);
    };
    const handleScroll = () => {
      edgeFade?.update();
      onScrollRef.current?.(host);
    };

    host.addEventListener("scroll", handleScroll, { passive: true });
    initializeCallbacks();

    return () => {
      host.removeEventListener("scroll", handleScroll);
      edgeFade?.cleanup();
      initCleanupRef.current?.();
      initCleanupRef.current = undefined;
      restoreOverflow();
    };
    // deps lets conditionally mounted hosts be re-attached
  }, [axis, enableEdgeFade, elementRef, ...deps]);

  return { elementRef };
}
