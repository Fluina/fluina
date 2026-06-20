"use client";
import { motion, LayoutGroup, AnimatePresence } from "motion/react";
import { Plus, ArrowUp, Trash2, Minimize2, Maximize2, Mic, AudioLines, X } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { TRANSITION, THEME } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";
import Image from "next/image";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";
import { Button } from "@/components/parts/button"

export default function Ask() {
    const [value, setValue] = useState("");
    const [isAdjusted, setIsAdjusted] = useState(false);

    const formRef = useRef<HTMLFormElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const hasInput = value.length > 0;
    const singleLineRef = useRef<number>(0);
    const singleLineWidthRef = useRef<number>(0);

    useEffect(() => {
        if (!scrollRef.current) return;

        const osInstance = OverlayScrollbars(scrollRef.current, {
            scrollbars: {
                theme: OS_THEME_TEXTAREA,
                autoHide: "leave",
            },
            overflow: {
                x: "hidden",
                y: "scroll",
            }
        });

        return () => {
            osInstance.destroy();
        };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!hasInput) return;

        console.log("Submitted:", value);

        setValue("");
    };

    useLayoutEffect(() => {
        if (value === undefined) return;

        const textarea = textareaRef.current;

        if (!textarea) return;

        if (singleLineRef.current === 0) {
            const originalValue = textarea.value;

            if (originalValue && originalValue !== value) {
                setValue(originalValue);
            }

            textarea.value = "";
            textarea.style.height = "auto";
            singleLineRef.current = textarea.scrollHeight;
            textarea.value = originalValue;
        }

        if (!isAdjusted) {
            singleLineWidthRef.current = textarea.getBoundingClientRect().width;
        }

        const originalWidth = textarea.style.width;

        if (isAdjusted && singleLineWidthRef.current > 0) {
            textarea.style.width = `${singleLineWidthRef.current}px`;
        }

        textarea.style.height = "auto";

        const checkHeight = textarea.scrollHeight;

        if (isAdjusted && singleLineWidthRef.current > 0) {
            textarea.style.width = originalWidth;
        }

        const nextIsAdjusted = checkHeight > singleLineRef.current;

        if (nextIsAdjusted !== isAdjusted) {
            setIsAdjusted(nextIsAdjusted);
        } else {
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value, isAdjusted]);

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;

        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace") {
            e.preventDefault();
            setValue("");

            return;
        }

        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

        if (isTouchDevice) return;

        if (e.key === "Enter") {
            if (e.shiftKey) {
                return;
            } else {
                e.preventDefault();
                if (hasInput) {
                    formRef.current?.requestSubmit();
                }
            }
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement === textareaRef.current) return;

            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const isInputKey =
                (e.key.length === 1 && e.key !== " ")

            if (isInputKey) {
                textareaRef.current?.focus();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const handleClear = () => {
        setValue("");

        textareaRef.current?.focus();
    };

    return (
        <div className="size-full flex flex-col justify-center p-4 items-center max-w-3xl">
            <LayoutGroup>
                <motion.form
                    layout
                    transition={TRANSITION}
                    ref={formRef}
                    onSubmit={handleSubmit}
                    className={`grid gap-1 max-h-full min-h-0 w-full items-center rounded-4xl border border-back-5 shadow-lg bg-back-1 p-2 overflow-clip
                        ${isAdjusted ? "grid-cols-[1fr_auto_auto] grid-rows-[1fr_auto]" :
                            hasInput ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto]"
                        }`}
                >
                    <motion.div
                        layout="position"
                        transition={TRANSITION}
                        className={`${isAdjusted ? "col-start-1 row-start-2" : ""}`}
                    >
                        <Button
                            aria-label="Attatch"
                            className="size-10 rounded-full bg-back-2 flex justify-center items-center"
                        >
                            <Plus className="text-fore-2 all" />
                        </Button>
                    </motion.div>

                    <label className={`relative w-full flex justify-start items-center  ${isAdjusted ? "col-span-2" : "col-span-1"}`}>
                        {!hasInput && (
                            <span className="absolute inset-0 m-2 w-full pointer-events-none text-base text-fore-9 text-left font-sans-serif font-medium truncate">
                                Fluinaに訊いてみて！
                            </span>
                        )}

                        <motion.div
                            layout="position"
                            transition={TRANSITION}
                            ref={scrollRef}
                            className="overflow-y-auto max-h-34 p-2 flex justify-center relative items-center w-full"
                        >
                            <motion.textarea
                                autoFocus
                                rows={1}
                                spellCheck={false}
                                ref={textareaRef}
                                value={value}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                }}
                                onKeyDown={handleTextareaKeyDown}
                                id="prompt"
                                name="prompt"
                                placeholder=""
                                className="overflow-y-auto block outline-none resize-none w-full animate-caret text-base text-fore-1 text-left font-sans-serif font-medium"
                            />
                        </motion.div>
                    </label>

                    <AnimatePresence mode="popLayout" initial={false} presenceAffectsLayout={false}>
                        {hasInput && (
                            <motion.div
                                layout="position"
                                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                                transition={TRANSITION}
                                className={`${isAdjusted ? "col-start-3 row-start-1 self-start" : ""}`}
                            >
                                <Button
                                    aria-label="Clear"
                                    onClick={handleClear}
                                    className="size-10 rounded-full bg-back-2 flex justify-center items-center"
                                >
                                    <Trash2 className="text-red all" />
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.div
                        layout="position"
                        transition={TRANSITION}
                        className={`${isAdjusted ? "col-start-2 row-start-2" : ""}`}
                    >
                        <Button
                            aria-label="Mic"
                            className="size-10 rounded-full bg-back-2 flex justify-center items-center"
                        >
                            <Mic className="text-fore-2 all" />
                        </Button>
                    </motion.div>

                    <motion.div
                        layout="position"
                        transition={TRANSITION}
                        className={`${isAdjusted ? "col-start-3 row-start-2" : ""}`}
                    >
                        <Button
                            type="submit"
                            aria-label={hasInput ? "Send" : "Converse"}
                            className="size-10 rounded-full bg-blue flex justify-center items-center"
                        >
                            <AnimatePresence mode="popLayout" initial={false} presenceAffectsLayout={false}>
                                {hasInput ? (
                                    <motion.div
                                        key="send"
                                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                                        transition={TRANSITION}
                                        className="all"
                                    >
                                        <ArrowUp className="text-fore-2" />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="converse"
                                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                                        transition={TRANSITION}
                                        className="all"
                                    >
                                        <AudioLines className="text-fore-2" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Button>
                    </motion.div>
                </motion.form>
            </LayoutGroup>
        </div>
    );
}