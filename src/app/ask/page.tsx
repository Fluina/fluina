"use client";
import { motion, LayoutGroup, AnimatePresence } from "motion/react";
import { Plus, ArrowUp, Trash2, Minimize2, Maximize2, Mic, AudioLines } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { TRANSITION, THEME } from "@/lib/motion";
import { OverlayScrollbars } from "overlayscrollbars";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";
import Image from "next/image";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";

export default function Ask() {
    const [value, setValue] = useState("");
    const [isAdjusted, setIsAdjusted] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const singleLineRef = useRef<number>(0);
    const hasInput = value.length > 0;

    const handleClear = () => {
        setValue("");
        setIsAdjusted(false);
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        textareaRef.current?.focus();
    };

    useLayoutEffect(() => {
        const textarea = textareaRef.current;

        if (textarea) {
            const originalValue = textarea.value;

            textarea.value = "";
            textarea.style.height = "auto";
            singleLineRef.current = textarea.scrollHeight;
            textarea.value = originalValue;
            textarea.style.height = "auto";
        }
    }, []);

    const adjustTextarea = () => {
        const textarea = textareaRef.current;

        if (!textarea) return;

        textarea.style.height = "auto";

        const newHeight = textarea.scrollHeight;

        setIsAdjusted(newHeight > singleLineRef.current);

        textarea.style.height = `${newHeight}px`;
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement === textareaRef.current) return;

            const isInputKey =
                e.key.length === 1 ||
                e.key === "Backspace" ||
                e.key === "Enter";

            if (isInputKey) {
                textareaRef.current?.focus();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    return (
        <div className="size-full flex flex-col justify-center p-4 items-center max-w-3xl">
            <LayoutGroup>
                <motion.div
                    layout
                    className={`grid gap-2 items-center w-full rounded-4xl border border-back-5 shadow-lg bg-back-1 p-2
                        ${isAdjusted ? "grid-cols-[1fr_auto_auto] grid-rows-[1fr_auto]" :
                            hasInput ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto]"
                        }`}
                >
                    <motion.button
                        type="button"
                        aria-label="Attatch"
                        layout="position"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${isAdjusted ? "col-start-1 row-start-2" : ""}`}
                    >
                        <Plus className="text-fore-2" />
                    </motion.button>

                    <motion.div
                        layout="position"
                        transition={TRANSITION}
                        className="relative w-full px-2"
                    >
                        <motion.textarea
                            autoFocus
                            rows={1}
                            spellCheck={false}
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                adjustTextarea();
                            }}
                            name="prompt"
                            placeholder=""
                            className="outline-none resize-none animate-caret text-base text-fore-1 text-left font-sans-serif font-medium w-full"
                        />
                    </motion.div>

                        {hasInput && (
                            <motion.button
                                type="button"
                                aria-label="Clear"
                                onClick={handleClear}
                                layout="position"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={TRANSITION}
                                className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${isAdjusted ? "col-start-3 row-start-1 self-start" : ""}`}
                            >
                                <Trash2 className="text-red" />
                            </motion.button>
                        )}

                    <motion.button
                        type="button"
                        aria-label="Mic"
                        layout="position"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${isAdjusted ? "col-start-2 row-start-2" : ""}`}
                    >
                        <Mic className="text-fore-2" />
                    </motion.button>

                    <motion.button
                        type="button"
                        aria-label={hasInput ? "Send" : "Converse"}
                        layout="position"
                        transition={TRANSITION}
                        className={`size-10 rounded-full bg-back-2 flex justify-center items-center ${isAdjusted ? "col-start-3 row-start-2" : ""}`}
                    >
                        <AnimatePresence mode="popLayout" initial={false}>
                            {hasInput ? (
                                <motion.div
                                    key="send"
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                    transition={TRANSITION}
                                >
                                    <ArrowUp className="text-fore-2" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="converse"
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                    transition={TRANSITION}
                                >
                                    <AudioLines className="text-fore-2" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.button>
                </motion.div>
            </LayoutGroup>
        </div>
    );
}