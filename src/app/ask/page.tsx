"use client";
import { motion, LayoutGroup } from "motion/react";
import { Plus, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { TRANSITION } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";

// レイアウトに関するステートの型定義
type LayoutState = {
    height: number | undefined;
    taHeight: number | undefined;
    expanded: boolean;
    scrollable: boolean;
    isEmpty: boolean;
    shouldAnimate: boolean;
};

export default function Ask() {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const osInstanceRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null);

    // 計算用の幅を記憶するRef（不要な再レンダリングを防止）
    const narrowWidthRef = useRef<number | null>(null);
    const fullWidthRef = useRef<number | null>(null);

    // 1. 【最強の最適化】バラバラだったステートを1つに統合
    const [layout, setLayout] = useState<LayoutState>({
        height: undefined,
        taHeight: undefined,
        expanded: false,
        scrollable: false,
        isEmpty: true,
        shouldAnimate: false,
    });
    const [isOsActive, setIsOsActive] = useState(false);

    // 2. レイアウトの計測とステート更新を一括で行う純粋関数
    const resize = useCallback(() => {
        const el = textareaRef.current;
        const grid = gridRef.current;
        if (!el || !grid) return;

        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

        // セーフティ：ステート更新関数（純粋関数）の中で一気に次状態を計算
        setLayout((prev) => {
            const currentWidth = el.getBoundingClientRect().width;
            if (prev.expanded) {
                fullWidthRef.current = currentWidth;
            } else {
                narrowWidthRef.current = currentWidth;
            }

            // 指定された幅での行数をシミュレートするヘルパー
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

            // 展開判定（テキストがあり、かつ狭い幅で2行以上になるか）
            const narrowWidth = narrowWidthRef.current ?? currentWidth;
            const willExpand = !isEmptyText && calculateLinesAtWidth(narrowWidth) >= 2;

            // フル幅の取得
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
                shouldAnimate: willExpand !== prev.expanded, // 状態が変化する時だけアニメーション
            };
        });
    }, []); // 完全に不変な関数に

    // 初回マウント時のリサイズとフォーカス
    useEffect(() => {
        resize();
        textareaRef.current?.focus();
    }, [resize]);

    // グローバルキーボードショートカットの管理
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const el = textareaRef.current;
            if (!el) return;

            // Ctrl + Backspace / Delete で全消去
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

            // 文字入力で自動フォーカス
            if (e.key.length === 1 || e.key === "Process") {
                el.focus();
            }
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [resize]);

    // OverlayScrollbars の初期化とクリーンアップ
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

    // スクロール可否の同期
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
                <motion.h1
                    layout
                    transition={TRANSITION}
                    className="max-md:mt-auto text-center font-sans-serif text-4xl font-thin text-fore-1"
                >
                    何か手伝えることはあるかな？
                </motion.h1>

                <motion.div
                    layout
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

                    {layout.isEmpty && (
                        <p
                            aria-hidden
                            className={`pointer-events-none self-start p-2 text-fore-9 text-left font-sans-serif font-medium truncate ${layout.expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                                }`}
                        >
                            Fluinaに訊いてみてね！
                        </p>
                    )}

                    <motion.div
                        layout
                        ref={hostRef}
                        style={{ height: layout.height }}
                        transition={layout.shouldAnimate ? TRANSITION : { duration: 0 }}
                        className={`flex justify-start items-start ${layout.expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                            } ${!isOsActive ? "overflow-hidden" : ""}`}
                    >
                        <motion.textarea
                            layout
                            rows={1}
                            spellCheck={false}
                            ref={textareaRef}
                            onChange={resize}
                            name="prompt"
                            style={{
                                height: isOsActive && layout.scrollable && layout.taHeight !== undefined ? layout.taHeight : "100%"
                            }}
                            className={`block w-full p-2 outline-none resize-none animate-caret ${!isOsActive && layout.scrollable ? "overflow-y-auto" : "overflow-y-hidden"
                                }`}
                        />
                    </motion.div>

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