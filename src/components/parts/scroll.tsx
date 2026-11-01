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
  type UseNativeScrollOptions,
  useNativeScroll,
} from "@/lib/native-scroll";

type ScrollConfig =
  | false
  | (Partial<UseNativeScrollOptions> & { axis?: ScrollAxis });

export interface ScrollAreaProps<T> {
  children?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  viewportEl?: HTMLElement | null;
  className?: string;
  style?: CSSProperties;
  motionProps?: HTMLMotionProps<"div">;
  virtual?: boolean;
  items?: T[];
  scroll?: ScrollConfig;
  scrollDeps?: unknown[];
  header?: ReactNode;
  virtualConfig?: {
    bufferSize?: number;
    itemSize?: number;
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
  scroll = {},
  scrollDeps = [],
  header,
  virtualConfig,
  renderItem,
}: ScrollAreaProps<T>) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hostRef = scrollRef ?? internalScrollRef;
  const headerRef = useRef<HTMLDivElement>(null);
  const headerSizeRef = useRef(0);
  const [headerSize, setHeaderSize] = useState(0);
  const [viewportGeneration, setViewportGeneration] = useState(0);
  const scrollOptions = scroll === false ? {} : scroll;
  const {
    onInit: scrollOnInit,
    onScroll: scrollOnScroll,
    ...restScrollOptions
  } = scrollOptions;

  useNativeScroll<HTMLDivElement>(
    {
      axis: restScrollOptions.axis ?? "y",
      ...restScrollOptions,
      elementRef: hostRef,
      onInit: scrollOnInit,
      onScroll: scrollOnScroll,
    },
    scrollDeps,
  );

  const viewportScrollRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    viewportScrollRef.current = viewportEl ?? hostRef.current;
    setViewportGeneration((generation) => generation + 1);
  }, [viewportEl, hostRef]);

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
            itemSize={virtualConfig?.itemSize}
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
