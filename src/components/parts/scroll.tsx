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
  header?: ReactNode;
  virtualConfig?: {
    bufferSize?: number;
    shift?: boolean;
    horizontal?: boolean;
    keepMounted?: readonly number[];
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
  header,
  virtualConfig,
  renderItem,
}: ScrollAreaProps<T>) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hostRef = scrollRef ?? internalScrollRef;
  const [overlayViewport, setOverlayViewport] = useState<HTMLElement | null>(
    null,
  );
  // viewport が作り直されたら Virtualizer も再マウントし、スクロール先を取り直させる
  const lastViewportRef = useRef<HTMLElement | null>(null);
  const [viewportGeneration, setViewportGeneration] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerSizeRef = useRef(0);
  const [headerSize, setHeaderSize] = useState(0);
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
        if (lastViewportRef.current !== viewport) {
          lastViewportRef.current = viewport;
          setViewportGeneration((generation) => generation + 1);
        }
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

  const hasHeader = header !== undefined;

  // header は Virtualizer の外にあるため、高さを startMargin として伝える
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const next = el.offsetHeight;
      const delta = next - headerSizeRef.current;
      headerSizeRef.current = next;
      setHeaderSize(next);

      // header の増減で内容が動かないよう、スクロール位置を補正する
      const scroller = viewportScrollRef.current;
      if (scroller && delta !== 0 && scroller.scrollTop > 0) {
        scroller.scrollTop += delta;
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={hostRef}
      className={className}
      style={style}
      {...motionProps}
    >
      <div className="contents">
        {hasHeader && <div ref={headerRef}>{header}</div>}
        {virtual && renderItem ? (
          <Virtualizer
            key={viewportGeneration}
            data={items}
            scrollRef={viewportScrollRef}
            startMargin={hasHeader ? headerSize : 0}
            bufferSize={virtualConfig?.bufferSize}
            shift={virtualConfig?.shift}
            horizontal={virtualConfig?.horizontal}
            keepMounted={virtualConfig?.keepMounted}
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
