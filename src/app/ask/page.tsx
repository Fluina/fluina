"use client";

import { motion, LayoutGroup } from "motion/react";
import { Plus, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { TRANSITION } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";

export default function Ask() {
    const ref = useRef<HTMLTextAreaElement>(null);
    // 【追加】高さを裏で安全に計測するための隠しテキストエリア用Ref
    const shadowRef = useRef<HTMLTextAreaElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const osInstanceRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null);

    // useCallbackの依存配列から外すために、expandedの状態をRefでも保持する
    const expandedRef = useRef(false);

    const [height, setHeight] = useState<number>();
    const [taHeight, setTaHeight] = useState<number>();
    const [expanded, setExpanded] = useState(false);
    const [scrollable, setScrollable] = useState(false);
    const [isEmpty, setIsEmpty] = useState(true);
    const [animateHeight, setAnimateHeight] = useState(true);

    // テキストエリアのサイズとレイアウト（1行か複数行か）を計算・更新する関数
    const resize = useCallback(() => {
        const el = ref.current;
        const shadow = shadowRef.current;
        const grid = gridRef.current;

        if (!el || !shadow || !grid) return;

        const val = el.value;
        setIsEmpty(val.length === 0);

        // 計測用の隠しテキストエリアに値を同期（空の場合は1行分の高さを確保するためにスペースをいれる）
        shadow.value = val || " ";

        const style = getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize) || 16;
        const lineHeight = parseFloat(style.lineHeight) || (fontSize * 1.5);
        const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const borderY = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);

        const gridStyle = getComputedStyle(grid);
        const gridPadX = (parseFloat(gridStyle.paddingLeft) || 0) + (parseFloat(gridStyle.paddingRight) || 0);

        // アニメーション中の誤計測を防ぐため、実際のコンテナ幅から計算で割り出す
        const gridWidth = grid.clientWidth > 0 ? grid.clientWidth : Math.min(window.innerWidth - 32, 768);
        const fullWidth = gridWidth - gridPadX;
        // 左右のボタン(40px * 2 = 80px) を引いたサイズがNarrow幅
        const narrowWidth = Math.max(fullWidth - 80, 50);

        // 隠しテキストエリアを使って安全に何行になるかを計算するインナー関数
        const linesAt = (width: number) => {
            shadow.style.width = `${width}px`;
            shadow.style.height = "0px"; // scrollHeightを正確に取得するために一旦0にする
            const scrollHeight = shadow.scrollHeight;
            const lines = Math.round((scrollHeight - padding) / lineHeight);
            return Math.max(lines, 1);
        };

        const narrowLines = linesAt(narrowWidth);
        const willExpand = narrowLines >= 2;

        const rawLines = willExpand ? linesAt(fullWidth) : 1;
        const contentLines = Math.max(rawLines, 1);
        const visibleLines = Math.min(contentLines, 5); // 最大5行まで表示

        const nextHeight = visibleLines * lineHeight + padding + borderY;
        const newTaHeight = contentLines * lineHeight + padding + borderY;

        setAnimateHeight(willExpand !== expandedRef.current);
        expandedRef.current = willExpand;

        setTaHeight(newTaHeight);
        setHeight(nextHeight);
        setExpanded(willExpand);
        setScrollable(contentLines > 5);
    }, []);

    // 初回レンダリング時にサイズを初期化
    useEffect(() => {
        resize();
    }, [resize]);

    // マウント時にテキストエリアにフォーカスを当てる
    useEffect(() => {
        ref.current?.focus();
    }, []);

    // グローバルなキーボードイベントの監視
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

    // カスタムスクロールバー (OverlayScrollbars) の初期化
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

    // 5行を超えてスクロールが必要になったタイミングでスクロールを有効化
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
        <div className="size-full flex flex-col justify-center gap-8 p-4 items-center max-w-3xl relative">

            {/* 【追加】高さ計算用の隠しテキストエリア（レイアウトやIMEのバグを防ぐ） */}
            <textarea
                ref={shadowRef}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="block p-2 outline-none resize-none overflow-hidden absolute top-0 left-0 -z-10 opacity-0 pointer-events-none"
            />

            <LayoutGroup>
                {/* ページタイトル */}
                <motion.h1
                    layout
                    transition={TRANSITION}
                    className="max-md:mt-auto text-center font-sans-serif text-4xl font-thin text-fore-1"
                >
                    何か手伝えることはあるかな？
                </motion.h1>

                {/* 入力欄を内包するコンテナグリッド */}
                <motion.div
                    layout
                    ref={gridRef}
                    transition={TRANSITION}
                    className="max-md:mt-auto grid grid-cols-[auto_1fr_auto] justify-center items-start w-full bg-back-1 rounded-4xl p-2 border border-back-5 gap-y-2 shadow-lg"
                >
                    {/* プラスボタン */}
                    <motion.button
                        layout
                        type="button"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${expanded ? "row-start-2 col-start-1" : "row-start-1 col-start-1"
                            }`}
                    >
                        <Plus className="text-fore-2" />
                    </motion.button>

                    {/* プレースホルダー文字列 */}
                    {isEmpty && (
                        <p
                            aria-hidden
                            className={`pointer-events-none self-start p-2 text-fore-9 text-left font-sans-serif font-medium truncate ${expanded ? "row-start-1 col-span-3" : "row-start-1 col-start-2"
                                }`}
                        >
                            Fluinaに訊いてみてね！
                        </p>
                    )}

                    {/* テキストエリアをラップするスクロールホスト */}
                    <motion.div
                        layout
                        ref={hostRef}
                        transition={animateHeight ? TRANSITION : { duration: 0 }}
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

                    {/* 送信ボタン（上矢印） */}
                    <motion.button
                        layout
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