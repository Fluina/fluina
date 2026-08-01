"use client";
import {
  ArrowUp,
  AudioLines,
  Camera,
  Delete,
  Folder,
  Globe,
  Maximize2,
  Mic,
  Minimize2,
  Paperclip,
  Plug,
  Plus,
  Puzzle,
  Zap,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Image from "next/image";
import { OverlayScrollbars } from "overlayscrollbars";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";
import { Button, Menu, Tooltip } from "@/components/parts";
import { THEME, TRANSITION } from "@/lib/motion";
import { useOS } from "@/lib/os";
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
  const os = useOS();

  const [value, setValue] = useState("");
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const [isDragOver, setIsDragOver] = useState(false);
  const [dragFileCount, setDragFileCount] = useState(0);

  const [aiReply, setAiReply] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasText = value.length > 0;
  const hasInput = value.trim().length > 0;

  const singleLineRef = useRef<number>(0);
  const singleLineWidthRef = useRef<number>(0);
  const isComposingRef = useRef(false);

  const osInstanceRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null);

  //  ================================================================
  //    Textarea
  //  ================================================================

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

    osInstanceRef.current = osInstance;

    return () => {
      osInstance.destroy();
      osInstanceRef.current = null;
    };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hasInput || isLoading) return;

    const userPrompt = value.trim();

    setValue("");
    setIsExpanded(false);

    setIsLoading(true);
    setAiReply("Fluinaが考え中...");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      const response = await fetch(`${apiUrl}/api/ask`, {
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
      setAiReply(
        "エラーが発生しました。バックエンドサーバーが起動しているか確認してください。",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const recalcTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;

    const scrollContainer =
      scrollRef.current?.querySelector("[data-overlayscrollbars-viewport]") ||
      scrollRef.current;

    if (!textarea) return;

    const currentScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    const isAtBottom = scrollContainer
      ? scrollContainer.scrollHeight -
      scrollContainer.scrollTop -
      scrollContainer.clientHeight <
      15
      : false;

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

    const MAX_LINES = 5;
    const maxScrollHeight = singleLineRef.current * MAX_LINES;

    const nextIsScrollable = textarea.scrollHeight >= maxScrollHeight;

    if (nextIsScrollable !== isScrollable) {
      setIsScrollable(nextIsScrollable);
    }

    if (!nextIsScrollable && isExpanded) {
      setIsExpanded(false);
    }

    if (scrollContainer) {
      if (isAtBottom) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
      } else {
        scrollContainer.scrollTop = currentScrollTop;
      }
    }
  }, [value, isAdjusted, isScrollable, isExpanded]);

  useLayoutEffect(() => {
    if (value === undefined) return;

    recalcTextareaHeight();
  }, [value, recalcTextareaHeight]);

  useEffect(() => {
    const vv = window.visualViewport;

    if (!vv) return;

    vv.addEventListener("resize", recalcTextareaHeight);
    vv.addEventListener("scroll", recalcTextareaHeight);

    return () => {
      vv.removeEventListener("resize", recalcTextareaHeight);
      vv.removeEventListener("scroll", recalcTextareaHeight);
    };
  }, [recalcTextareaHeight]);

  useEffect(() => {
    if (isExpanded !== undefined) {
      const timer = setTimeout(() => {
        osInstanceRef.current?.update(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      e.nativeEvent.isComposing ||
      isComposingRef.current ||
      e.keyCode === 229
    )
      return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) ||
      ("maxTouchPoints" in navigator &&
        navigator.maxTouchPoints > 0 &&
        window.innerWidth <= 768);

    if (isMobile) return;

    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if (!hasInput) return;

      e.preventDefault();

      formRef.current?.requestSubmit();
      textareaRef.current?.focus();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifierPressed =
        os === "mac"
          ? e.metaKey && e.shiftKey && e.altKey
          : e.ctrlKey && e.shiftKey && e.altKey;

      if (!modifierPressed) return;

      const key = e.key.toLowerCase();

      if (e.key === "Backspace") {
        e.preventDefault();
        setValue("");
        setIsExpanded(false);

        textareaRef.current?.focus();

        return;
      }

      if (e.code === "Space") {
        e.preventDefault();

        if (isScrollable || isExpanded) {
          setIsExpanded((prev) => !prev);
        }

        return;
      }

      if (key === "a") {
        e.preventDefault();
        return;
      }

      if (key === "m") {
        e.preventDefault();
        return;
      }

      if (key === "s") {
        e.preventDefault();

        if (hasInput) {
          formRef.current?.requestSubmit();
        }

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [os, isScrollable, isExpanded, hasInput]);

  useEffect(() => {
    if (hasText) return;

    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [hasText]);

  const handleClear = () => {
    setValue("");
    setIsExpanded(false);

    textareaRef.current?.focus();
  };

  //  ================================================================
  //    Drag and Drop
  //  ================================================================

  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer?.types.includes("Files")) {
        const fileCount = e.dataTransfer.items?.length || 0;

        setDragFileCount(fileCount);
        setIsDragOver(true);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer?.types.includes("Files")) {
        const fileCount = e.dataTransfer.items?.length || 0;

        setDragFileCount(fileCount);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.clientX === 0 && e.clientY === 0) {
        setIsDragOver(false);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;

      if (files && files.length > 0) {
        console.log("Dropped files:", files);
      }
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  return (
    <>
      <AnimatePresence
        mode="popLayout"
        initial={false}
        presenceAffectsLayout={false}
      >
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0)" }}
            animate={{ opacity: 1, backdropFilter: "blur(1rem)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0)" }}
            transition={TRANSITION}
            className="fixed inset-0 p-2 bg-back-0/50 z-1000 pointer-events-none flex items-center justify-center"
          >
            <div className="animate-pulse flex flex-col gap-2 items-center justify-center size-full border-2 border-dashed border-fore-1 rounded-2xl">
              <Paperclip
                className="text-fore-1 text-shadow-lg animate-bounce"
                size={64}
              />

              <p className="text-center font-sans-serif text-2xl font-medium text-fore-1 text-shadow-lg">
                {dragFileCount}ファイルをドロップして追加
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  className="text-center font-sans-serif text-3xl font-light text-fore-1"
                >
                  何でも訊いてみてね！
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
            onLayoutAnimationComplete={() => {
              osInstanceRef.current?.update(true);
            }}
            className={`max-md:mt-auto grid gap-1 min-h-0 w-full items-center rounded-4xl border border-back-5 shadow-lg bg-back-1 p-2 overflow-clip
                        ${isExpanded ? "h-full" : "max-h-full"}
                        ${isAdjusted || isExpanded
                ? "grid-cols-[1fr_auto_auto] grid-rows-[auto_1fr_auto]"
                : hasText
                  ? "grid-cols-[auto_1fr_auto_auto_auto]"
                  : "grid-cols-[auto_1fr_auto_auto]"
              }`}
          >
            <Menu.Trigger>
              <motion.div
                layout="position"
                transition={TRANSITION}
                className={`${isAdjusted && "col-start-1 row-start-3"}`}
              >
                <Tooltip
                  content="添付"
                  shortcut={{
                    mac: ["⌘", "Shift", "Option", "A"],
                    windows: ["Ctrl", "Shift", "Alt", "A"],
                  }}
                >
                  <Button
                    aria-label="Attatch"
                    shape="circle"
                    className="bg-back-2"
                  >
                    <Plus className="text-fore-1 all" />
                  </Button>
                </Tooltip>
              </motion.div>

              <Menu.Content>
                <Menu.Item icon={<Paperclip />} shortcut="Ctrl+Shift+Alt+U">
                  ファイルまたは写真を追加
                </Menu.Item>
                <Menu.Item icon={<Camera />}>
                  スクリーンショットを撮る
                </Menu.Item>

                <Menu.Separator />

                <Menu.SubmenuTrigger>
                  <Menu.Item icon={<Folder />}>プロジェクトに追加</Menu.Item>
                  <Menu.Content>
                    <Menu.Item>プロジェクト A</Menu.Item>
                    <Menu.Item>プロジェクト B</Menu.Item>
                  </Menu.Content>
                </Menu.SubmenuTrigger>

                <Menu.Item icon={<Puzzle />}>スキル</Menu.Item>
                <Menu.Item icon={<Plug />}>コネクタを追加</Menu.Item>
                <Menu.Item icon={<Zap />}>プラグインを追加...</Menu.Item>

                <Menu.Separator />

                <Menu.Section
                  selectionMode="single"
                  defaultSelectedKeys={["web-search"]}
                >
                  <Menu.Item id="web-search" icon={<Globe />}>
                    ウェブ検索
                  </Menu.Item>
                </Menu.Section>
              </Menu.Content>
            </Menu.Trigger>

            <label
              htmlFor="prompt"
              className={`relative w-full flex justify-start items-start ${isExpanded && "h-full"} ${isAdjusted || isExpanded ? "col-span-2 row-span-2" : "col-span-1"}`}
            >
              <span className="sr-only">プロンプトを入力</span>

              {!hasText && (
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
                    aria-hidden="true"
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
                    className="absolute overflow-y-hidden inset-0 p-2 w-full pointer-events-none text-lg text-fore-9 text-left font-sans-serif font-medium truncate block"
                  >
                    {PLACEHOLDERS[placeholderIndex]}
                  </motion.span>
                </AnimatePresence>
              )}

              <motion.div
                layout="position"
                transition={TRANSITION}
                ref={scrollRef}
                className={`overflow-y-auto p-2 flex justify-center items-start relative w-full ${isExpanded && " h-full max-h-full"}`}
                style={
                  !isExpanded && singleLineRef.current > 0
                    ? { maxHeight: `${singleLineRef.current * 5 + 16}px` }
                    : undefined
                }
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
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    setTimeout(() => {
                      isComposingRef.current = false;
                    }, 0);
                  }}
                  id="prompt"
                  name="prompt"
                  placeholder=""
                  className="block outline-none resize-none w-full animate-caret text-lg text-fore-1 text-left font-sans-serif font-medium"
                />
              </motion.div>
            </label>

            <AnimatePresence
              mode="popLayout"
              initial={false}
              presenceAffectsLayout={false}
            >
              {hasText && (
                <motion.div
                  layout="position"
                  initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                  transition={TRANSITION}
                  className={`${isAdjusted ? "col-start-3 row-start-1 self-start" : ""}`}
                >
                  <Tooltip
                    content="削除"
                    placement={isAdjusted ? "left" : "bottom"}
                    shortcut={{
                      mac: ["⌘", "Shift", "Option", "Backspace"],
                      windows: ["Ctrl", "Shift", "Alt", "Backspace"],
                    }}
                  >
                    <Button
                      aria-label="Clear"
                      onPress={handleClear}
                      shape="circle"
                    >
                      <Delete className="text-fore-1 all" />
                    </Button>
                  </Tooltip>
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
                  <Tooltip
                    content={isExpanded ? "縮小" : "拡大"}
                    placement={isAdjusted ? "left" : "bottom"}
                    shortcut={{
                      mac: ["⌘", "Shift", "Option", "Space"],
                      windows: ["Ctrl", "Shift", "Alt", "Space"],
                    }}
                  >
                    <Button
                      aria-label={isExpanded ? "Minimize" : "Maximize"}
                      onPress={() => setIsExpanded(!isExpanded)}
                      shape="circle"
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
                            <Minimize2 className="text-fore-1" />
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
                            <Maximize2 className="text-fore-1" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Button>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              layout="position"
              transition={TRANSITION}
              className={`${isAdjusted ? "col-start-2 row-start-3" : ""}`}
            >
              <Tooltip
                content="マイク"
                shortcut={{
                  mac: ["⌘", "Shift", "Option", "M"],
                  windows: ["Ctrl", "Shift", "Alt", "M"],
                }}
              >
                <Button aria-label="Mic" shape="circle" className="bg-back-2">
                  <Mic className="text-fore-1 all" />
                </Button>
              </Tooltip>
            </motion.div>

            <motion.div
              layout="position"
              transition={TRANSITION}
              className={`${isAdjusted ? "col-start-3 row-start-3" : ""}`}
            >
              <Tooltip
                content={hasInput ? "送信" : "会話"}
                shortcut={{
                  mac: ["⌘", "Shift", "Option", "S"],
                  windows: ["Ctrl", "Shift", "Alt", "S"],
                }}
              >
                <Button
                  type="submit"
                  isDisabled={isLoading}
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
                        <ArrowUp className="text-back-1_" />
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
                        <AudioLines className="text-back-1_" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </Tooltip>
            </motion.div>
          </motion.form>
        </LayoutGroup>
      </div>
    </>
  );
}
