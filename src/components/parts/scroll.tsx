"use client";
import { type HTMLMotionProps, motion } from "motion/react";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Virtualizer } from "virtua";
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
  renderItem?: (item: T, index: number) => ReactElement;
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
  renderItem,
}: ScrollAreaProps<T>) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hostRef = scrollRef ?? internalScrollRef;
  const [overlayViewport, setOverlayViewport] = useState<HTMLElement | null>(
    null,
  );
  const overlayOptions = overlayScroll === false ? {} : overlayScroll;
  const isOverlayScrollEnabled = overlayScroll !== false;
  const {
    onInit: overlayOnInit,
    onScroll: overlayOnScroll,
    ...restOverlayOptions
  } = overlayOptions;

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
      onScroll: (viewport, instance) => {
        overlayOnScroll?.(viewport, instance);
      },
    },
    overlayScrollDeps,
  );

  const viewportScrollRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    viewportScrollRef.current =
      viewportEl ?? overlayViewport ?? hostRef.current;
  }, [viewportEl, overlayViewport, hostRef]);

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
            data={items}
            scrollRef={viewportScrollRef}
            bufferSize={virtualConfig?.bufferSize}
            shift={virtualConfig?.shift}
            horizontal={virtualConfig?.horizontal}
            onScroll={virtualConfig?.onScroll}
          >
            {renderItem}
          </Virtualizer>
        ) : (
          children
        )}
        {virtual && renderItem && children}
      </div>
    </motion.div>
  );
}
