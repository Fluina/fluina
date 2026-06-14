"use client";
import { motion, LayoutGroup } from "motion/react";
import { Plus, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { TRANSITION } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";

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

    const resize = useCallback(() => {
        const el = textareaRef.current;
        const grid = gridRef.current;
        if (!el || !grid) return;

        // 1. 一度 auto にして正確な scrollHeight を取得（これは既存通り）
        el.style.height = "auto";
        const currentScrollHeight = el.scrollHeight;

        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

        // 最大高さ（例: 5行分）の計算
        const maxHeight = lineHeight * 5 + padding + border;
        const overLimit = currentScrollHeight > maxHeight;
        const finalTaHeight = overLimit ? maxHeight : currentScrollHeight;

        // 🔥 【超重要】Reactのステート更新を待たずに、DOMのスタイルを今すぐ直接書き換える！
        // これによりブラウザの描画前に高さが確定するため、スマホのカーソルが絶対に置いていかれません。
        el.style.height = `${finalTaHeight}px`;

        // もし外側のラッパー（hostRef）の高さも連動させているなら、それも直接一瞬で書き換える
        if (hostRef.current) {
            hostRef.current.style.height = `${finalTaHeight}px`;
        }

        // 2. その後、ボタンの配置換え（expanded）などの状態管理のためにステートを更新する
        setLayout((prev) => {
            const willExpand = currentScrollHeight > lineHeight + padding + border + 10;
            return {
                ...prev,
                height: finalTaHeight,
                taHeight: finalTaHeight,
                expanded: willExpand,
                scrollable: overLimit,
                isEmpty: el.value === "",
                shouldAnimate: false, // 💡 改行時のじわじわアニメーションは完全にオフにする
            };
        });
    }, []);

    useEffect(() => {
        resize();
        textareaRef.current?.focus();
    }, [resize]);

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
                <motion.h1
                    layout="position"
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
                    <LayoutGroup id="textarea-isolated-zone">
                        <motion.div
                            ref={hostRef}
                            style={{ height: layout.height }}
                            transition={{ duration: 0 }} // 🔥 アニメーション時間を0にして、一瞬で枠を広げる
                            className={`flex justify-start items-start ${layout.expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                                } ${!isOsActive ? "overflow-hidden" : ""}`}
                        >
                            <textarea
                                rows={1}
                                spellCheck={false}
                                ref={textareaRef}
                                onChange={resize}
                                name="prompt"
                                style={{
                                    height: "100%" // ラッパーの高さ（一瞬で変わる）に100%同期させる
                                }}
                                className={`block w-full p-2 outline-none resize-none animate-caret ${!isOsActive && layout.scrollable ? "overflow-y-auto" : "overflow-y-hidden"
                                    }`}
                            />
                        </motion.div>
                    </LayoutGroup>

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