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
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Image from "next/image";
import type { SyntheticEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";
import { Button, Menu, Tooltip } from "@/components/parts";
import { THEME, TRANSITION } from "@/lib/motion";
import { useOS } from "@/lib/os";
import { useOverlayScroll } from "@/lib/overlayscrollbars";

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

type AttachedFile = {
  id: string;
  file: File;
};

export default function Ask() {
  const os = useOS();

  const [value, setValue] = useState("");
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const [files, setFiles] = useState<AttachedFile[]>([]);

  const [aiReply, setAiReply] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollTopRef = useRef(0);
  const pendingCaretRef = useRef<{
    caretTop: number;
    caretRatio: number | null;
  } | null>(null);

  const hasText = value.length > 0;
  const hasInput = value.trim().length > 0;
  const hasFiles = files.length > 0;

  const singleLineRef = useRef<number>(0);
  const singleLineWidthRef = useRef<number>(0);
  const isComposingRef = useRef(false);
  const pendingLineBreakTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { elementRef: scrollRef } = useOverlayScroll<HTMLDivElement>(
    {
      axis: "y",
      onScroll: (viewport) => {
        scrollTopRef.current = viewport.scrollTop;
      },
      onInit: (el) => {
        const prevScrollTop = scrollTopRef.current;
        const pending = pendingCaretRef.current;
        const caretTop = pending?.caretTop ?? 0;
        const caretRatio = pending?.caretRatio ?? null;

        pendingCaretRef.current = null;

        const restore = () => {
          const maxScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);

          const target =
            caretRatio !== null
              ? caretTop - caretRatio * el.clientHeight
              : prevScrollTop;

          const clamped = Math.min(Math.max(target, 0), maxScrollTop);
          el.scrollTop = clamped;
          scrollTopRef.current = clamped;
        };

        restore();

        const timer = setTimeout(restore, 500);

        return () => clearTimeout(timer);
      },
    },
    [isExpanded],
  );

  //  ================================================================
  //    送信
  //  ================================================================

  const handleSubmit = async (e?: SyntheticEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!hasInput || isLoading) return;

    const userPrompt = value.trim();

    setValue("");
    setIsExpanded(false);
    setFiles([]);

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

  //  ================================================================
  //    テキストエリア
  //  ================================================================

  const calcTextarea = useCallback(() => {
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
      18
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
  }, [value, isAdjusted, isScrollable, isExpanded, scrollRef]);

  useLayoutEffect(() => {
    if (value === undefined) return;

    calcTextarea();
  }, [value, calcTextarea]);

  useEffect(() => {
    const vv = window.visualViewport;

    if (!vv) return;

    vv.addEventListener("resize", calcTextarea);
    vv.addEventListener("scroll", calcTextarea);

    return () => {
      vv.removeEventListener("resize", calcTextarea);
      vv.removeEventListener("scroll", calcTextarea);
    };
  }, [calcTextarea]);

  const captureCaretPosition = useCallback(() => {
    const lineHeight = singleLineRef.current || 0;
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? 0;
    const caretLine = lineHeight
      ? (textarea?.value.slice(0, selectionStart).split("\n").length ?? 1) - 1
      : 0;
    const caretTop = caretLine * lineHeight;

    const viewportEl =
      scrollRef.current?.querySelector<HTMLElement>(
        "[data-overlayscrollbars-viewport]",
      ) ?? scrollRef.current;

    const clientHeight = viewportEl?.clientHeight ?? 0;
    const scrollTop = viewportEl?.scrollTop ?? scrollTopRef.current;

    const caretRatio =
      lineHeight && clientHeight > 0
        ? Math.min(Math.max((caretTop - scrollTop) / clientHeight, 0), 1)
        : null;

    pendingCaretRef.current = { caretTop, caretRatio };
  }, [scrollRef]);

  //  ================================================================
  //    添付ファイル
  //  ================================================================

  const { elementRef: filesScrollRef } = useOverlayScroll<HTMLDivElement>(
    { axis: "x", enabled: hasFiles },
    [files.length],
  );

  const filePreviewUrls = useMemo(() => {
    return files.map((item) =>
      item.file.type.startsWith("image/") ? URL.createObjectURL(item.file) : null,
    );
  }, [files]);

  useEffect(() => {
    return () => {
      filePreviewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [filePreviewUrls]);

  const handleFilesAdded = useCallback((newFiles: FileList | File[]) => {
    const newAttachedFiles: AttachedFile[] = Array.from(newFiles).map((file) => ({
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
    }));
    setFiles((prev) => [...prev, ...newAttachedFiles]);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files);
      }

      e.target.value = "";
    },
    [handleFilesAdded],
  );

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  //  ================================================================
  //    ドラッグ＆ドロップ
  //  ================================================================

  const [isDragOver, setIsDragOver] = useState(false);
  const [dragFileCount, setDragFileCount] = useState(0);

  const dragCounterRef = useRef(0);

  useEffect(() => {
    const hasFilesCheck = (e: DragEvent) => {
      if (!e.dataTransfer) return false;

      return e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files");
    };

    const getActualFileCount = (e: DragEvent) => {
      if (!e.dataTransfer) return 0;

      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        return Array.from(e.dataTransfer.items).filter(
          (item) => item.kind === "file",
        ).length;
      }

      return e.dataTransfer.files?.length || 0;
    };

    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!hasFilesCheck(e)) return;

      dragCounterRef.current += 1;

      const fileCount = getActualFileCount(e);
      setIsDragOver(true);
      if (fileCount > 0) {
        setDragFileCount(fileCount);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!hasFilesCheck(e)) return;
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }

      const fileCount = getActualFileCount(e);

      if (fileCount > 0 && fileCount !== dragFileCount) {
        setDragFileCount(fileCount);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current -= 1;

      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
        setDragFileCount(0);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current = 0;

      setIsDragOver(false);
      setDragFileCount(0);

      const dt = e.dataTransfer;
      if (!dt) return;

      let droppedFiles: File[] = [];

      if (dt.files && dt.files.length > 0) {
        droppedFiles = Array.from(dt.files);
      } else if (dt.items && dt.items.length > 0) {
        droppedFiles = Array.from(dt.items)
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
      }

      if (droppedFiles.length > 0) {
        handleFilesAdded(droppedFiles);
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
  }, [handleFilesAdded, dragFileCount]);

  //  ================================================================
  //    キーボードショートカット
  //  ================================================================

  const isMobileDevice = useCallback(() => {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) ||
      ("maxTouchPoints" in navigator &&
        navigator.maxTouchPoints > 0 &&
        window.innerWidth <= 768)
    );
  }, []);

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      e.nativeEvent.isComposing ||
      isComposingRef.current ||
      e.keyCode === 229
    )
      return;

    if (isMobileDevice()) return;

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
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      const modifierPressed =
        os === "mac"
          ? e.metaKey && e.shiftKey && e.altKey
          : e.ctrlKey && e.shiftKey && e.altKey;

      if (modifierPressed) {
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
            captureCaretPosition();
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

        if (key === "x") {
          e.preventDefault();
          handleClearFiles();

          return;
        }
      }

      if (!isInputFocused) {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          textareaRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [os, isScrollable, isExpanded, hasInput, captureCaretPosition, handleClearFiles]);

  useEffect(() => {
    if (hasText) return;

    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [hasText]);

  const handleClearText = () => {
    setValue("");
    setIsAdjusted(false);
    setIsExpanded(false);

    textareaRef.current?.focus();
  };

  useEffect(() => {
    return () => {
      if (pendingLineBreakTimeoutRef.current) {
        clearTimeout(pendingLineBreakTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
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
                {dragFileCount}ファイルをドロップして添付！
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="size-full flex flex-col p-4 gap-8 items-center max-w-3xl justify-center">
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {!isExpanded && (
              <motion.div
                layout="position"
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -25 }}
                transition={TRANSITION}
                className="max-md:mt-auto flex flex-col justify-center items-center gap-4"
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
            onSubmit={handleSubmit}
            ref={formRef}
            layout
            transition={TRANSITION}
            className={`max-md:mt-auto grid gap-1 min-h-0 w-full items-center rounded-4xl border border-back-5 shadow-lg bg-back-1 p-2 overflow-clip
              ${isExpanded ? "h-full" : "max-h-full"}
              ${hasFiles
                ? isAdjusted || isExpanded
                  ? "grid-cols-[auto_1fr_auto] grid-rows-[auto_auto_1fr_auto]"
                  : hasText
                    ? "grid-cols-[auto_1fr_auto_auto_auto] grid-rows-[auto_auto]"
                    : "grid-cols-[auto_1fr_auto_auto] grid-rows-[auto_auto]"
                : isAdjusted || isExpanded
                  ? "grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto]"
                  : hasText
                    ? "grid-cols-[auto_1fr_auto_auto_auto]"
                    : "grid-cols-[auto_1fr_auto_auto]"
              }`}
          >
            <Menu.Trigger>
              <motion.div
                layout="position"
                transition={TRANSITION}
                className={`${hasFiles
                  ? isAdjusted || isExpanded
                    ? "col-start-1 row-start-4"
                    : "col-start-1 row-start-2"
                  : isAdjusted || isExpanded
                    ? "col-start-1 row-start-3"
                    : "col-start-1 row-start-1"
                  }`}
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
                <Menu.Item
                  icon={<Paperclip />}
                  shortcut="Ctrl+Shift+Alt+U"
                  onAction={() => fileInputRef.current?.click()}
                >
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

            <input
              onChange={handleFileInputChange}
              ref={fileInputRef}
              type="file"
              multiple
              hidden
            />

            <AnimatePresence mode="popLayout" initial={false}>
              {hasFiles && (
                <motion.div
                  ref={filesScrollRef}
                  layout="position"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={TRANSITION}
                  className={`flex items-center justify-center overflow-x-auto p-px w-full col-start-1 row-start-1 ${isAdjusted || isExpanded
                    ? "col-span-2"
                    : hasText
                      ? "col-span-4"
                      : "col-span-3"
                    }`}
                >
                  <motion.div
                    layout="position"
                    transition={TRANSITION}
                    className="flex flex-row flex-nowrap justify-start items-center gap-2 w-full"
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      {files.map(({ id, file }, fileIndex) => {
                        const lastDotIndex = file.name.lastIndexOf(".");
                        const hasExtension =
                          lastDotIndex !== -1 && lastDotIndex !== 0;
                        const fileNameWithoutExt = hasExtension
                          ? file.name.slice(0, lastDotIndex)
                          : file.name;
                        const fileExtension = hasExtension
                          ? file.name.slice(lastDotIndex + 1).toUpperCase()
                          : "";

                        return (
                          <motion.div
                            key={id}
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={TRANSITION}
                            className="group size-30 relative flex-none flex justify-start items-center rounded-3xl bg-back-2 border border-back-5 overflow-clip"
                          >
                            <Tooltip content={file.name} placement="bottom">
                              <Button
                                aria-label={file.name}
                                className="size-full flex justify-center items-center scale-100! [&>*:not(:first-child)]:scale-100! none"
                              >
                                {filePreviewUrls[fileIndex] ? (
                                  <Image
                                    src={filePreviewUrls[fileIndex] ?? ""}
                                    alt={file.name}
                                    fill
                                    unoptimized
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <div className="p-2 size-full flex flex-col justify-between overflow-hidden">
                                    <span className="line-clamp-3 p-1 break-all text-ellipsis overflow-hidden text-sm text-fore-1 text-left font-sans-serif font-medium">
                                      {fileNameWithoutExt}
                                    </span>

                                    {fileExtension && (
                                      <span className="text-xs text-fore-1 text-center font-sans-serif font-light truncate w-full p-1 border border-back-5 bg-back-3 rounded-full">
                                        {fileExtension}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </Button>
                            </Tooltip>

                            <Tooltip
                              content="削除"
                              placement="left"
                            >
                              <Button
                                onPress={() => handleRemoveFile(fileIndex)}
                                aria-label="Remove the file"
                                shape="circle"
                                className="absolute top-1 right-1 bg-fore-1 md:opacity-0 max-md:opacity-100 group-focus-within:opacity-100 md:group-hover:opacity-100"
                              >
                                <X className="text-back-1 all" />
                              </Button>
                            </Tooltip>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout" initial={false}>
              {hasFiles && (
                <motion.div
                  layout="position"
                  initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                  transition={TRANSITION}
                  className={`row-start-1 ${isAdjusted || isExpanded
                    ? "col-start-3"
                    : hasText
                      ? "col-start-5"
                      : "col-start-4"
                    }`}
                >
                  <Tooltip
                    content="消去"
                    placement="left"
                    shortcut={{
                      mac: ["⌘", "Shift", "Option", "X"],
                      windows: ["Ctrl", "Shift", "Alt", "X"],
                    }}
                  >
                    <Button
                      onPress={handleClearFiles}
                      aria-label="Clear Files"
                      shape="circle"
                    >
                      <Trash2 className="text-fore-1 all" />
                    </Button>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.label
              layout="position"
              transition={TRANSITION}
              className={`relative w-full flex flex-col justify-start items-start ${isExpanded ? "h-full" : ""
                } ${hasFiles
                  ? isAdjusted || isExpanded
                    ? "col-start-1 col-span-2 row-start-2 row-span-2"
                    : "col-start-2 row-start-2"
                  : isAdjusted || isExpanded
                    ? "col-start-1 col-span-2 row-start-1 row-span-2"
                    : "col-start-2 row-start-1"
                }`}
            >
              <span className="sr-only">プロンプトを入力</span>

              {!hasText && (
                <AnimatePresence mode="wait" initial={false}>
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
                    className="absolute inset-0 p-2 w-full pointer-events-none text-lg text-fore-9 text-left font-sans-serif font-medium truncate block"
                  >
                    {PLACEHOLDERS[placeholderIndex]}
                  </motion.span>
                </AnimatePresence>
              )}

              <motion.div
                ref={scrollRef}
                layout="position"
                transition={TRANSITION}
                className={`overflow-y-auto p-2 flex justify-center items-start relative w-full ${isExpanded && " h-full max-h-full"}`}
                style={
                  !isExpanded && singleLineRef.current > 0
                    ? { maxHeight: `${singleLineRef.current * 5 + 16}px` }
                    : undefined
                }
              >
                <motion.textarea
                  onChange={(e) => {
                    setValue(e.target.value);
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    setTimeout(() => {
                      isComposingRef.current = false;
                    }, 0);
                  }}
                  ref={textareaRef}
                  value={value}
                  autoFocus
                  rows={1}
                  spellCheck={false}
                  id="prompt"
                  name="prompt"
                  placeholder=""
                  className="block outline-none overflow-y-clip resize-none w-full animate-caret text-lg text-fore-1 text-left font-sans-serif font-medium"
                />
              </motion.div>
            </motion.label>

            <AnimatePresence mode="popLayout" initial={false}>
              {hasText && (
                <motion.div
                  layout="position"
                  initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                  transition={TRANSITION}
                  className={`${hasFiles
                    ? isAdjusted || isExpanded
                      ? "col-start-3 row-start-2 justify-self-end"
                      : "col-start-3 row-start-2"
                    : isAdjusted || isExpanded
                      ? "col-start-3 row-start-1 justify-self-end"
                      : "col-start-3 row-start-1"
                    }`}
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
                      onPress={handleClearText}
                      aria-label="Clear Text"
                      shape="circle"
                    >
                      <Delete className="text-fore-1 all" />
                    </Button>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout" initial={false}>
              {(isScrollable || isExpanded) && (
                <motion.div
                  layout="position"
                  initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                  transition={TRANSITION}
                  className={`self-start ${hasFiles
                    ? hasText
                      ? "col-start-3 row-start-3 justify-self-end"
                      : "col-start-3 row-start-2 justify-self-end"
                    : hasText
                      ? "col-start-3 row-start-2 justify-self-end"
                      : "col-start-3 row-start-1 justify-self-end"
                    }`}
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
                      onPress={() => {
                        captureCaretPosition();
                        setIsExpanded(!isExpanded);
                      }}
                      aria-label={isExpanded ? "Minimize" : "Maximize"}
                      shape="circle"
                    >
                      <AnimatePresence mode="popLayout" initial={false}>
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
              className={`${hasFiles
                ? isAdjusted || isExpanded
                  ? "col-start-2 row-start-4 justify-self-end"
                  : hasText
                    ? "col-start-4 row-start-2"
                    : "col-start-3 row-start-2"
                : isAdjusted || isExpanded
                  ? "col-start-2 row-start-3 justify-self-end"
                  : hasText
                    ? "col-start-4 row-start-1"
                    : "col-start-3 row-start-1"
                }`}
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
              className={`${hasFiles
                ? isAdjusted || isExpanded
                  ? "col-start-3 row-start-4 justify-self-end"
                  : hasText
                    ? "col-start-5 row-start-2"
                    : "col-start-4 row-start-2"
                : isAdjusted || isExpanded
                  ? "col-start-3 row-start-3 justify-self-end"
                  : hasText
                    ? "col-start-5 row-start-1"
                    : "col-start-4 row-start-1"
                }`}
            >
              <Tooltip
                content={hasInput ? "送信" : "会話"}
                shortcut={{
                  mac: ["⌘", "Shift", "Option", "S"],
                  windows: ["Ctrl", "Shift", "Alt", "S"],
                }}
              >
                <Button
                  isDisabled={isLoading}
                  type="submit"
                  aria-label={hasInput ? "Send" : "Converse"}
                  shape="circle"
                  color="primary"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
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