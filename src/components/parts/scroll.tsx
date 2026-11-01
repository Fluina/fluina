"use client";
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
} from "@/lib/scrollbar";

type ScrollConfig =
  | false
  | (Partial<UseNativeScrollOptions> & { axis?: ScrollAxis });

export interface ScrollAreaProps<T> {
  children?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  viewportEl?: HTMLElement | null;
  className?: string;
  style?: CSSProperties;
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

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const next = el.offsetHeight;
      const delta = next - headerSizeRef.current;
      headerSizeRef.current = next;
      setHeaderSize(next);

      const scroller = viewportScrollRef.current;
      if (scroller && delta !== 0 && scroller.scrollTop > 0) {
        scroller.scrollTop += delta;
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className={className} style={style}>
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
    </div>
  );
}
