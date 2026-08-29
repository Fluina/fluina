"use client";
import { type HTMLMotionProps, motion } from "motion/react";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Virtualizer, type VirtualizerHandle } from "virtua";
import {
  type ScrollAxis,
  type UseOverlayScrollOptions,
  useOverlayScroll,
} from "@/lib/overlayscrollbars";

type OverlayScrollConfig =
  | false
  | (Partial<UseOverlayScrollOptions> & { axis?: ScrollAxis });

export interface ScrollAreaProps<T> {
  children?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  viewportEl?: HTMLElement | null;
  className?: string;
  style?: CSSProperties;
  motionProps?: HTMLMotionProps<"div">;
  virtual?: boolean;
  items?: T[];
  overlayScroll?: OverlayScrollConfig;
  overlayScrollDeps?: unknown[];
  virtualConfig?: {
    bufferSize?: number;
    shift?: boolean;
    horizontal?: boolean;
    onScroll?: (offset: number) => void;
  };
  autoScroll?: {
    enabled?: boolean;
    behavior?: "smooth" | "instant";
    align?: "start" | "center" | "end";
    shouldScroll?: (items: T[]) => boolean;
    deps?: unknown[];
  };
  renderItem?: (item: T, index: number) => ReactElement | null;
}

export function ScrollArea<T>({
  children,
  scrollRef,
  viewportEl,
  className = "",
  style,
  motionProps,
  virtual = true,
  items = [],
  overlayScroll = {},
  overlayScrollDeps = [],
  virtualConfig,
  autoScroll,
  renderItem,
}: ScrollAreaProps<T>) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hostRef = scrollRef ?? internalScrollRef;
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const [overlayViewport, setOverlayViewport] = useState<HTMLElement | null>(
    null,
  );
  const overlayOptions = overlayScroll === false ? {} : overlayScroll;
  const isOverlayScrollEnabled = overlayScroll !== false;
  const { onInit: overlayOnInit, ...restOverlayOptions } = overlayOptions;

  useOverlayScroll<HTMLDivElement>(
    {
      axis: restOverlayOptions.axis ?? "y",
      ...restOverlayOptions,
      elementRef: hostRef,
      enabled: isOverlayScrollEnabled && restOverlayOptions.enabled !== false,
      onInit: (viewport, instance) => {
        setOverlayViewport(viewport);
        return overlayOnInit?.(viewport, instance);
      },
    },
    overlayScrollDeps,
  );

  const {
    enabled: isAutoScrollEnabled = false,
    behavior = "smooth",
    align = "end",
    shouldScroll,
    deps: autoScrollDeps = [],
  } = autoScroll || {};
  const viewportScrollRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    viewportScrollRef.current =
      viewportEl ?? overlayViewport ?? hostRef.current;
  }, [viewportEl, overlayViewport, hostRef]);

  useEffect(() => {
    if (!isAutoScrollEnabled) return;
    if (shouldScroll && !shouldScroll(items)) return;
    if (virtual && virtualizerRef.current) {
      virtualizerRef.current.scrollToIndex(items.length - 1, {
        align,
        smooth: behavior === "smooth",
      });
    } else if (viewportEl) {
      requestAnimationFrame(() => {
        viewportEl.scrollTo({
          top: viewportEl.scrollHeight,
          behavior,
        });
      });
    }
  }, [
    items,
    virtual,
    viewportEl,
    isAutoScrollEnabled,
    behavior,
    align,
    shouldScroll,
    ...autoScrollDeps,
  ]);

  return (
    <motion.div
      ref={hostRef}
      className={className}
      style={style}
      {...motionProps}
    >
      <div className="contents">
        {virtual && renderItem ? (
          <Virtualizer
            ref={virtualizerRef}
            scrollRef={viewportScrollRef}
            bufferSize={virtualConfig?.bufferSize}
            shift={virtualConfig?.shift}
            horizontal={virtualConfig?.horizontal}
            onScroll={virtualConfig?.onScroll}
          >
            {items.map((item, index) => renderItem(item, index))}
          </Virtualizer>
        ) : (
          children
        )}
      </div>
    </motion.div>
  );
}