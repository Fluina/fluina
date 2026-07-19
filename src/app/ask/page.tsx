"use client";
import {
  ArrowUp,
  AudioLines,
  Maximize2,
  Mic,
  Minimize2,
  Plus,
  Trash2,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Image from "next/image";
import { OverlayScrollbars } from "overlayscrollbars";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";
import { Button } from "@/components/parts/button";
import { THEME, TRANSITION } from "@/lib/motion";
import { OS_THEME_TEXTAREA } from "@/lib/overlayscrollbars";

const PLACEHOLDERS = [
  "Fluinaに訊いてみて！",
  "/ を入力してコマンドを発動！",
  "ドラッグ＆ドロップでファイルを添付！",
  "# を入力してタグを追記！",
  "リンクを挿入！",
  "ファイルとテキストを連関！",
  "コピペで註記！",
  "今日も、おつかれ様。",
];

export default function Ask() {
  const [value, setValue] = useState("");
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const [aiReply, setAiReply] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const formRef = useRef<HTMLFormElement>(null);
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
      },
    });

    return () => {
      osInstance.destroy();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasInput || isLoading) return;

    const userPrompt = value;
    setValue("");
    setIsExpanded(false);

    setIsLoading(true);
    setAiReply("Fluinaが考え中...");

    try {
      // 💡 修正：環境変数からAPIの基本URLを取得し、無ければローカルにフォールバック 
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      // 💡 修正：取得した環境変数のURLをベースにリクエストを送信 
      const response = await fetch(`${apiUrl}/api/ask/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: userPrompt }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response from Elysia server");
      }

      const data = await response.json();
      setAiReply(data.reply);
    } catch (error) {
      console.error("Connection Error:", error);
      setAiReply("エラーが発生しました。バックエンドサーバーが起動しているか確認してください。");
    } finally {
      setIsLoading(false);
    }
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

    const nextIsScrollable = textarea.scrollHeight >= 136;

    if (nextIsScrollable !== isScrollable) {
      setIsScrollable(nextIsScrollable);
    }

    if (!nextIsScrollable && isExpanded) {
      setIsExpanded(false);
    }
  }, [value, isAdjusted, isScrollable, isExpanded]);

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.nativeEvent.isComposing) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "Backspace") {
      e.preventDefault();
      setValue("");
      setIsExpanded(false);

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

      const isInputKey = e.key.length === 1 && e.key !== " ";

      if (isInputKey) {
        textareaRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (hasInput) return;

    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [hasInput]);

  const handleClear = () => {
    setValue("");
    setIsExpanded(false);

    textareaRef.current?.focus();
  };

  return (
    <div className="size-full flex flex-col p-4 gap-8 items-center max-w-3xl justify-center">
      <LayoutGroup>
        <AnimatePresence
          mode="popLayout"
          initial={false}
          presenceAffectsLayout={false}
        >
          {!isExpanded && (
            <motion.div
              layout="position"
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={TRANSITION}
              className="max-md:mt-auto flex flex-col justify-center items-center gap-4 z-10"
            >
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
                  className="absolute inset-0 dark:opacity-0 opacity-100"
                />

                <Image
                  src={Frame_Fluina_small_light}
                  alt="Frame Fluina small light"
                  width={60}
                  height={60}
                  className="absolute inset-0 dark:opacity-100 opacity-0"
                />
              </motion.div>

              <motion.h1
                layout="position"
                transition={TRANSITION}
                className="text-center font-sans-serif text-3xl font-thin text-fore-1"
              >
                何か手伝えることはある？
              </motion.h1>
            </motion.div>
          )}
        </AnimatePresence>

        {aiReply && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-full p-4 rounded-2xl bg-back-2 border border-back-5 text-fore-1 font-sans-serif text-left ${isLoading ? "animate-pulse opacity-70" : ""}`}
          >
            <p className="whitespace-pre-wrap">{aiReply}</p>
          </motion.div>
        )}

        <motion.form
          layout
          transition={TRANSITION}
          ref={formRef}
          onSubmit={handleSubmit}
          className={`max-md:mt-auto grid gap-1 min-h-0 w-full items-center rounded-4xl border border-back-5 shadow-lg bg-back-1 p-2 overflow-clip
                        ${isExpanded ? "h-full" : "max-h-full"}
                        ${isAdjusted || isExpanded
              ? "grid-cols-[1fr_auto_auto] grid-rows-[auto_1fr_auto]"
              : hasInput
                ? "grid-cols-[auto_1fr_auto_auto_auto]"
                : "grid-cols-[auto_1fr_auto_auto]"
            }`}
        >
          <motion.div
            layout="position"
            transition={TRANSITION}
            className={`${isAdjusted ? "col-start-1 row-start-3" : ""}`}
          >
            <Button aria-label="Attatch" shape="circle" className="bg-back-2">
              <Plus className="text-fore-2 all" />
            </Button>
          </motion.div>

          <label
            className={`relative w-full flex justify-start items-center ${isExpanded ? "h-full items-start" : "items-center"} ${isAdjusted || isExpanded ? "col-span-2 row-span-2" : "col-span-1"}`}
          >
            {!hasInput && (
              <AnimatePresence
                mode="wait"
                initial={false}
                presenceAffectsLayout={false}
              >
                <motion.span
                  key={placeholderIndex}
                  layout={false}
                  initial={
                    {
                      "--mask-x": "100%",
                    } as import("motion/react").TargetAndTransition
                  }
                  animate={
                    {
                      "--mask-x": "50%",
                    } as import("motion/react").TargetAndTransition
                  }
                  exit={
                    {
                      "--mask-x": "0%",
                    } as import("motion/react").TargetAndTransition
                  }
                  transition={THEME}
                  aria-hidden
                  style={{
                    maskImage:
                      "linear-gradient(to right, transparent 0%, transparent 15%, black 30%, black 70%, transparent 85%, transparent 100%)",
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent 0%, transparent 15%, black 30%, black 70%, transparent 85%, transparent 100%)",
                    maskSize: "500% 100%",
                    WebkitMaskSize: "500% 100%",
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "var(--mask-x) 0%",
                    WebkitMaskPosition: "var(--mask-x) 0%",
                  }}
                  className="absolute inset-0 p-2 w-full pointer-events-none text-base text-fore-9 text-left font-sans-serif font-medium truncate block"
                >
                  {PLACEHOLDERS[placeholderIndex]}
                </motion.span>
              </AnimatePresence>
            )}

            <motion.div
              layout="position"
              transition={TRANSITION}
              ref={scrollRef}
              className={`overflow-y-auto p-2 flex justify-center relative items-center w-full ${isExpanded ? " h-full max-h-full" : "max-h-34"}`}
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
                disabled={isLoading}
                onKeyDown={handleTextareaKeyDown}
                id="prompt"
                name="prompt"
                placeholder=""
                className="overflow-y-auto block outline-none resize-none w-full animate-caret text-base text-fore-1 text-left font-sans-serif font-medium"
              />
            </motion.div>
          </label>

          <AnimatePresence
            mode="popLayout"
            initial={false}
            presenceAffectsLayout={false}
          >
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
                  shape="circle"
                  className="bg-back-2"
                >
                  <Trash2 className="text-red all" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence
            mode="popLayout"
            initial={false}
            presenceAffectsLayout={false}
          >
            {(isScrollable || isExpanded) && (
              <motion.div
                layout="position"
                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                transition={TRANSITION}
                className={`${isAdjusted ? "col-start-3 row-start-2 self-start" : ""}`}
              >
                <Button
                  aria-label="Maximize"
                  onClick={() => setIsExpanded(!isExpanded)}
                  shape="circle"
                  className="bg-back-2"
                >
                  <AnimatePresence
                    mode="popLayout"
                    initial={false}
                    presenceAffectsLayout={false}
                  >
                    {isExpanded ? (
                      <motion.div
                        key="maximize"
                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                        transition={TRANSITION}
                        className="all"
                      >
                        <Minimize2 className="text-yellow" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="minimize"
                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                        transition={TRANSITION}
                        className="all"
                      >
                        <Maximize2 className="text-yellow" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout="position"
            transition={TRANSITION}
            className={`${isAdjusted ? "col-start-2 row-start-3" : ""}`}
          >
            <Button aria-label="Mic" shape="circle" className="bg-back-2">
              <Mic className="text-fore-2 all" />
            </Button>
          </motion.div>

          <motion.div
            layout="position"
            transition={TRANSITION}
            className={`${isAdjusted ? "col-start-3 row-start-3" : ""}`}
          >
            <Button
              type="submit"
              disabled={isLoading}
              aria-label={hasInput ? "Send" : "Converse"}
              shape="circle"
              color="primary"
            >
              <AnimatePresence
                mode="popLayout"
                initial={false}
                presenceAffectsLayout={false}
              >
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