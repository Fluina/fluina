"use client";
import { motion, LayoutGroup, AnimatePresence } from "motion/react";
import { Plus, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { TRANSITION, THEME } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";
import Image from "next/image";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";

type LayoutState = {
    height: number | undefined;
    taHeight: number | undefined;
    expanded: boolean;
    scrollable: boolean;
    isEmpty: boolean;
    shouldAnimate: boolean;
};

const PLACEHOLDERS = [
    "Fluinaに訊いてみて！",
    '"/"を入力してコマンドを発動！',
    "ドラッグアンドドロップでファイルを追加！"
];

export default function Ask() {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const osInstanceRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null);

    const narrowWidthRef = useRef<number | null>(null);
    const fullWidthRef = useRef<number | null>(null);

    const [layout, setLayout] = useState<LayoutState>({
        height: undefined,
        taHeight: undefined,
        expanded: false,
        scrollable: false,
        isEmpty: true,
        shouldAnimate: false,
    });
    const [isOsActive, setIsOsActive] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const [placeholderIndex, setPlaceholderIndex] = useState(0);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const ua = navigator.userAgent;
            setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua));
        }
    }, []);

    const resize = useCallback(() => {
        const el = textareaRef.current;
        const grid = gridRef.current;
        if (!el || !grid) return;

        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

        setLayout((prev) => {
            const currentWidth = el.getBoundingClientRect().width;
            if (prev.expanded) {
                fullWidthRef.current = currentWidth;
            } else {
                narrowWidthRef.current = currentWidth;
            }

            const calculateLinesAtWidth = (targetWidth: number) => {
                const originalWidth = el.style.width;
                const originalHeight = el.style.height;
                const originalOverflow = el.style.overflowY;

                el.rows = 1;
                el.style.overflowY = "hidden";
                el.style.height = "auto";
                el.style.width = `${targetWidth}px`;

                const lines = Math.round((el.scrollHeight - padding) / lineHeight);

                el.style.width = originalWidth;
                el.style.height = originalHeight;
                el.style.overflowY = originalOverflow;
                return lines;
            };

            const textLength = el.value.length;
            const isEmptyText = textLength === 0;

            const narrowWidth = narrowWidthRef.current ?? currentWidth;
            const willExpand = !isEmptyText && calculateLinesAtWidth(narrowWidth) >= 2;

            const gridStyle = getComputedStyle(grid);
            const gridPadding = parseFloat(gridStyle.paddingLeft) + parseFloat(gridStyle.paddingRight);
            const fullWidth = fullWidthRef.current ?? (grid.clientWidth - gridPadding);

            const rawLines = willExpand ? calculateLinesAtWidth(fullWidth) : 1;
            const contentLines = Math.max(rawLines, 1);
            const visibleLines = Math.min(contentLines, 5);

            return {
                height: visibleLines * lineHeight + padding + borderY,
                taHeight: contentLines * lineHeight + padding + borderY,
                expanded: willExpand,
                scrollable: contentLines > 5,
                isEmpty: isEmptyText,
                shouldAnimate: willExpand !== prev.expanded,
            };
        });
    }, []);

    useEffect(() => {
        resize();
        textareaRef.current?.focus();
    }, [resize]);

    useEffect(() => {
        if (!layout.isEmpty) return;

        const interval = setInterval(() => {
            setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [layout.isEmpty]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const el = textareaRef.current;
            if (!el) return;

            if (e.ctrlKey && (e.key === "Backspace" || e.key === "Delete")) {
                e.preventDefault();
                el.value = "";
                resize();
                el.focus();
                return;
            }

            if (e.isComposing || document.activeElement === el) return;
            if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "")) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (document.activeElement?.tagName === "BUTTON" && /^(Enter| )$/.test(e.key)) return;

            if (e.key.length === 1 || e.key === "Process") {
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
            scrollbars: { theme: OS_THEME_TEXTAREA, autoHide: "never" },
            overflow: { x: "hidden", y: "hidden" }
        });

        if (OverlayScrollbars.valid(osInstance)) {
            osInstanceRef.current = osInstance;
            setIsOsActive(true);
        }

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
                overflow: { y: layout.scrollable ? "scroll" : "hidden" },
            });
        }
    }, [layout.scrollable]);

    return (
        <div className="size-full flex flex-col justify-center gap-8 p-4 items-center max-w-3xl">
            <LayoutGroup>
                <div className="max-md:mt-auto flex flex-col justify-center items-center gap-4">
                    <motion.div
                        layout="position"
                        transition={TRANSITION}
                        className="relative size-15"
                    >
                        <Image
                            src={Frame_Fluina_small_dark}
                            alt="Frame Fluina small dark"
                            width={60}
                            height={60}
                            className="absolute inset-0 dark:opacity-0 opacity-100 opacity"
                        />

                        <Image
                            src={Frame_Fluina_small_light}
                            alt="Frame Fluina small light"
                            width={60}
                            height={60}
                            className="absolute inset-0 dark:opacity-100 opacity-0 opacity"
                        />
                    </motion.div>

                    <motion.h1
                        layout="position"
                        transition={TRANSITION}
                        className="text-center font-sans-serif text-3xl font-thin text-fore-1"
                    >
                        何か手伝えることはある？
                    </motion.h1>
                </div>

                <motion.div
                    layout={!isMobile}
                    ref={gridRef}
                    transition={TRANSITION}
                    className="max-md:mt-auto grid grid-cols-[auto_1fr_auto] justify-center items-start w-full bg-back-1 rounded-4xl p-2 border border-back-5 shadow-lg"
                >
                    <motion.button
                        layout
                        type="button"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${layout.expanded ? "row-start-2 col-start-1" : "row-start-1 col-start-1"
                            }`}
                    >
                        <Plus className="text-fore-2" />
                    </motion.button>

                    <div className={`relative flex justify-start items-start ${layout.expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                        }`}>
                        <div className="absolute inset-0 pointer-events-none">
                            {!layout.isEmpty ? null : (
                                <AnimatePresence mode="wait">
                                    <motion.p
                                        key={placeholderIndex}
                                        layout={false}
                                        initial={{ "--mask-x": "100%" } as import("motion/react").TargetAndTransition}
                                        animate={{ "--mask-x": "50%" } as import("motion/react").TargetAndTransition}
                                        exit={{ "--mask-x": "0%" } as import("motion/react").TargetAndTransition}
                                        transition={THEME}
                                        style={{
                                            maskImage: "linear-gradient(to right, transparent 0%, transparent 15%, black 30%, black 70%, transparent 85%, transparent 100%)",
                                            WebkitMaskImage: "linear-gradient(to right, transparent 0%, transparent 15%, black 30%, black 70%, transparent 85%, transparent 100%)",
                                            maskSize: "500% 100%",
                                            WebkitMaskSize: "500% 100%",
                                            maskRepeat: "no-repeat",
                                            WebkitMaskRepeat: "no-repeat",
                                            maskPosition: "var(--mask-x) 0%",
                                            WebkitMaskPosition: "var(--mask-x) 0%",
                                        }}
                                        aria-hidden
                                        className="p-2 text-base text-fore-9 text-left font-sans-serif font-medium truncate w-full"
                                    >
                                        {PLACEHOLDERS[placeholderIndex]}
                                    </motion.p>
                                </AnimatePresence>
                            )}
                        </div>

                        <motion.div
                            layout="position"
                            ref={hostRef}
                            style={{ height: layout.height }}
                            transition={layout.shouldAnimate ? TRANSITION : { duration: 0 }}
                            className={`w-full ${!isOsActive ? "overflow-hidden" : ""}`}
                        >
                            <textarea
                                rows={1}
                                spellCheck={false}
                                ref={textareaRef}
                                onChange={resize}
                                name="prompt"
                                style={{
                                    height: isOsActive && layout.scrollable && layout.taHeight !== undefined ? layout.taHeight : "100%"
                                }}
                                className={`block w-full p-2 outline-none resize-none animate-caret text-base text-fore-1 text-left font-sans-serif font-medium ${!isOsActive && layout.scrollable ? "overflow-y-auto" : "overflow-y-hidden"
                                    }`}
                            />
                        </motion.div>
                    </div>

                    <motion.button
                        layout
                        type="button"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${layout.expanded ? "row-start-2 col-start-3" : "row-start-1 col-start-3"
                            }`}
                    >
                        <ArrowUp className="text-fore-2" />
                    </motion.button>
                </motion.div>
            </LayoutGroup>
        </div>
    );
}