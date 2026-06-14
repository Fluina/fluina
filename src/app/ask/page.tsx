"use client";
import { motion, LayoutGroup } from "motion/react";
import { Plus, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { TRANSITION } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";

export default function Ask() {
    const ref = useRef<HTMLTextAreaElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const osInstanceRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null);
    const narrowWidthRef = useRef<number | null>(null);
    const fullWidthRef = useRef<number | null>(null);
    const [height, setHeight] = useState<number>();
    const [taHeight, setTaHeight] = useState<number>();
    const [expanded, setExpanded] = useState(false);
    const [scrollable, setScrollable] = useState(false);
    const [isEmpty, setIsEmpty] = useState(true);

    const [animateHeight, setAnimateHeight] = useState(true);
    const [isMobile, setIsMobile] = useState(false);

    // 画面幅からモバイル（スマホ）環境かどうかを判定
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        setIsEmpty(el.value.length === 0);
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

        // 【対策1】スマホ環境では、IMEバグを防ぐため一時的な幅の書き換え（シミュレーション）をスキップ
        if (window.innerWidth < 768) {
            const prevHeight = el.style.height;
            el.style.height = "0px"; // 正確な scrollHeight を取得するための定石
            const scrollHeight = el.scrollHeight;
            el.style.height = prevHeight;

            const contentLines = Math.round((scrollHeight - padding) / lineHeight);
            const visibleLines = Math.min(Math.max(contentLines, 1), 5);
            const nextHeight = visibleLines * lineHeight + padding + borderY;

            setAnimateHeight(false); // スマホでの入力中のガタつき防止のためアニメーションをオフに
            setTaHeight(contentLines * lineHeight + padding + borderY);
            setHeight(nextHeight);
            setExpanded(contentLines >= 2);
            setScrollable(contentLines > 5);
            return;
        }

        // --- ここから下はPC向けの既存ロジック ---
        if (expanded) fullWidthRef.current = el.getBoundingClientRect().width;
        else narrowWidthRef.current = el.getBoundingClientRect().width;

        el.rows = 1;

        const linesAt = (width: number) => {
            const prevWidth = el.style.width;
            const prevHeight = el.style.height;
            const prevOverflow = el.style.overflowY;
            el.style.overflowY = "hidden";
            el.style.height = "0px"; // 正確な計測のために 0px に変更
            el.style.width = `${width}px`;
            const lines = Math.round((el.scrollHeight - padding) / lineHeight);
            el.style.width = prevWidth;
            el.style.height = prevHeight;
            el.style.overflowY = prevOverflow;
            return lines;
        };

        const narrowWidth = narrowWidthRef.current ?? el.getBoundingClientRect().width;
        const willExpand = linesAt(narrowWidth) >= 2;

        const grid = gridRef.current;
        if (!grid) return;
        const gridStyle = getComputedStyle(grid);
        const fullWidth =
            fullWidthRef.current ?? (
                grid.clientWidth
                - parseFloat(gridStyle.paddingLeft) - parseFloat(gridStyle.paddingRight)
            );
        const rawLines = willExpand ? linesAt(fullWidth) : 1;

        const contentLines = Math.max(rawLines, 1);
        const visibleLines = Math.min(contentLines, 5);

        const nextHeight = visibleLines * lineHeight + padding + borderY;

        if (willExpand !== expanded) {
            setAnimateHeight(true);
        } else {
            setAnimateHeight(false);
        }

        setTaHeight(contentLines * lineHeight + padding + borderY);
        setHeight(nextHeight);
        setExpanded(willExpand);
        setScrollable(contentLines > 5);
    }, [expanded]);

    // 依存配列に resize を指定
    useEffect(() => {
        resize();
    }, [resize]);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const el = ref.current;
            if (!el) return;

            if (e.shiftKey && (e.key === "Backspace" || e.key === "Delete")) {
                e.preventDefault();
                el.value = "";
                setIsEmpty(true);
                resize();
                el.focus();
                return;
            }

            if (e.isComposing) return;
            if (document.activeElement === el) return;
            if (
                document.activeElement?.tagName === "INPUT" ||
                document.activeElement?.tagName === "TEXTAREA"
            ) {
                return;
            }

            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (
                document.activeElement?.tagName === "BUTTON" &&
                (e.key === "Enter" || e.key === " ")
            ) {
                return;
            }

            const isPrintable = e.key.length === 1 || e.key === "Process";
            if (isPrintable) {
                el.focus();
            }
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [resize]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const osInstance = OverlayScrollbars(host, {
            scrollbars: {
                theme: OS_THEME_TEXTAREA,
                autoHide: "never",
            },
            overflow: {
                x: "hidden",
                y: "hidden",
            }
        });

        osInstanceRef.current = osInstance;

        return () => {
            if (OverlayScrollbars.valid(osInstance)) {
                osInstance.destroy();
            }
        };
    }, []);

    useEffect(() => {
        const osInstance = osInstanceRef.current;
        if (osInstance && OverlayScrollbars.valid(osInstance)) {
            osInstance.options({
                overflow: {
                    y: scrollable ? "scroll" : "hidden",
                },
            });
        }
    }, [scrollable]);

    return (
        <div className="size-full flex flex-col justify-center gap-8 p-4 items-center max-w-3xl">
            <LayoutGroup id="ask-input-group">
                {/* 【対策2】スマホ時は layout アニメーションによる位置ズレを防ぐため動的に無効化 */}
                <motion.h1
                    layout={!isMobile}
                    transition={TRANSITION}
                    className="max-md:mt-auto text-center font-sans-serif text-4xl font-thin text-fore-1"
                >
                    何か手伝えることはあるかな？
                </motion.h1>

                <motion.div
                    layout={!isMobile}
                    ref={gridRef}
                    transition={TRANSITION}
                    className="max-md:mt-auto grid grid-cols-[auto_1fr_auto] justify-center items-start w-full bg-back-1 rounded-4xl p-2 border border-back-5 gap-y-2 shadow-lg"
                >
                    <motion.button
                        layout={!isMobile}
                        type="button"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${expanded ? "row-start-2 col-start-1" : "row-start-1 col-start-1"
                            }`}
                    >
                        <Plus className="text-fore-2" />
                    </motion.button>

                    {isEmpty && (
                        <p
                            aria-hidden
                            className={`pointer-events-none self-start p-2 text-fore-9 text-left font-sans-serif font-medium truncate ${expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                                }`}
                        >
                            Fluinaに訊いてみてね！
                        </p>
                    )}

                    {/* 【対策3】入力中のIME崩壊を防ぐため、スマホ環境では layout アニメーションを無効化 */}
                    <motion.div
                        layout={!isMobile}
                        ref={hostRef}
                        animate={{ height }}
                        transition={animateHeight && !isMobile ? TRANSITION : { duration: 0 }}
                        style={{ height }}
                        className={`flex justify-start items-start ${expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                            }`}
                    >
                        <textarea
                            rows={1}
                            spellCheck={false}
                            ref={ref}
                            onChange={resize}
                            name="prompt"
                            style={{
                                height: scrollable && taHeight !== undefined ? taHeight : "100%"
                            }}
                            className="block w-full p-2 outline-none resize-none overflow-y-hidden animate-caret"
                        />
                    </motion.div>

                    <motion.button
                        layout={!isMobile}
                        type="button"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${expanded ? "row-start-2 col-start-3" : "row-start-1 col-start-3"
                            }`}
                    >
                        <ArrowUp className="text-fore-2" />
                    </motion.button>
                </motion.div>
            </LayoutGroup>
        </div>
    );
}