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

interface ImageCaptureConstructor {
  new(track: MediaStreamTrack): {
    grabFrame(): Promise<ImageBitmap>;
  };
}

type AttachedFile = {
  id: string;
  file: File;
  source: "input" | "paste" | "drag";
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

  const [isMobile, setIsMobile] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
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
    const editor = editorRef.current;
    const scrollContainer =
      scrollRef.current?.querySelector("[data-overlayscrollbars-viewport]") ||
      scrollRef.current;

    if (!editor) return;

    const currentScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const isAtBottom = scrollContainer
      ? scrollContainer.scrollHeight -
      scrollContainer.scrollTop -
      scrollContainer.clientHeight <
      18
      : false;

    if (singleLineRef.current === 0) {
      const originalText = editor.innerText;

      editor.innerText = "A";
      editor.style.height = "auto";
      singleLineRef.current = editor.scrollHeight;
      editor.innerText = originalText;
    }

    if (!isAdjusted) {
      singleLineWidthRef.current = editor.getBoundingClientRect().width;
    }

    const originalWidth = editor.style.width;

    if (isAdjusted && singleLineWidthRef.current > 0) {
      editor.style.width = `${singleLineWidthRef.current}px`;
    }

    editor.style.height = "auto";

    const checkHeight = editor.scrollHeight;

    if (isAdjusted && singleLineWidthRef.current > 0) {
      editor.style.width = originalWidth;
    }

    const nextIsAdjusted = checkHeight > singleLineRef.current;

    if (nextIsAdjusted !== isAdjusted) {
      setIsAdjusted(nextIsAdjusted);
    } else {
      editor.style.height = `${editor.scrollHeight}px`;
    }

    const MAX_LINES = 5;
    const maxScrollHeight = singleLineRef.current * MAX_LINES;
    const nextIsScrollable = editor.scrollHeight >= maxScrollHeight;

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
  }, [isAdjusted, isScrollable, isExpanded, scrollRef]);

  useLayoutEffect(() => {
    if (value === undefined) return;

    calcTextarea();
  }, [value, calcTextarea]);

  useEffect(() => {
    if (!editorRef.current) return;

    const currentDomText = editorRef.current.innerText;

    if (value === "") {
      if (currentDomText !== "") {
        editorRef.current.textContent = "";
        calcTextarea();
      }
      return;
    }

    if (currentDomText !== value) {
      editorRef.current.innerText = value;

      calcTextarea();
    }
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
    const editor = editorRef.current;

    let caretLine = 0;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor) {
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(editor);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const text = preCaretRange.toString();
      caretLine = text.split("\n").length - 1;
    }

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

  const filesScrollLeftRef = useRef(0);

  const { elementRef: filesScrollRef } = useOverlayScroll<HTMLDivElement>(
    {
      axis: "x",
      enabled: hasFiles,
      onScroll: (viewport) => {
        filesScrollLeftRef.current = viewport.scrollLeft;
      },
      onInit: (el) => {
        if (filesScrollLeftRef.current > 0) {
          el.scrollLeft = filesScrollLeftRef.current;
        }
      },
    },
    [hasFiles],
  );

  const filePreviewUrls = useMemo(() => {
    return files.map((item) => {
      const isImage = item.file.type.startsWith("image/");
      const isVideo = item.file.type.startsWith("video/");

      return isImage || isVideo ? URL.createObjectURL(item.file) : null;
    });
  }, [files]);

  useEffect(() => {
    return () => {
      filePreviewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [filePreviewUrls]);

  const handleFilesAdded = useCallback(
    (newFiles: FileList | File[], source: AttachedFile["source"] = "input") => {
      const newAttachedFiles: AttachedFile[] = Array.from(newFiles).map((file) => ({
        id: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        source,
      }));
      setFiles((prev) => [...prev, ...newAttachedFiles]);
    },
    [],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files);
      }

      e.target.value = "";

      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
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
        handleFilesAdded(droppedFiles, "drag");
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
  //    キーボードショートカット＆モバイル判定
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

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, [isMobileDevice]);

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
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
      editorRef.current?.focus();
    }
  };

  const handlePasteClipboardAsFile = useCallback(async () => {
    try {
      const fetchedFiles: File[] = [];

      if (navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();

        for (const item of clipboardItems) {
          for (const type of item.types) {
            const blob = await item.getType(type);
            const now = Date.now();

            if (type.startsWith("image/")) {
              const ext = type.split("/")[1] || "png";

              fetchedFiles.push(
                new File([blob], `pasted-${now}.${ext}`, { type }),
              );
            } else if (type === "text/plain") {
              const text = await blob.text();

              if (text.trim()) {
                fetchedFiles.push(
                  new File([text], `pasted-${now}.txt`, {
                    type: "text/plain",
                  }),
                );
              }
            } else if (type !== "text/html") {
              const ext = type.split("/")[1] || "bin";

              fetchedFiles.push(
                new File([blob], `pasted-${now}.${ext}`, { type }),
              );
            }
          }
        }
      } else if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();

        if (text.trim()) {
          const now = Date.now();

          fetchedFiles.push(
            new File([text], `pasted-${now}.txt`, {
              type: "text/plain",
            }),
          );
        }
      }

      if (fetchedFiles.length > 0) {
        handleFilesAdded(fetchedFiles, "paste");
      }
    } catch (err) {
      console.error("Failed to read clipboard contents: ", err);
    }
  }, [handleFilesAdded]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInputFocused && activeEl !== editorRef.current) {
        return;
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      if (clipboardData.files && clipboardData.files.length > 0) {
        e.preventDefault();
        const pastedFiles: File[] = [];
        const now = Date.now();

        Array.from(clipboardData.files).forEach((file, index) => {
          const ext = file.name.includes(".")
            ? file.name.split(".").pop()
            : "bin";
          pastedFiles.push(
            new File([file], `pasted-${now}-${index}.${ext}`, {
              type: file.type,
            }),
          );
        });

        handleFilesAdded(pastedFiles, "paste");

        return;
      }

      if (!isInputFocused) {
        const text = clipboardData.getData("text/plain");
        if (text) {
          e.preventDefault();

          const editor = editorRef.current;

          if (!editor) return;

          editor.focus();
          setValue((prev) => prev + text);
        }
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [handleFilesAdded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isOtherInputFocused =
        (activeEl?.tagName === "INPUT" ||
          activeEl?.tagName === "TEXTAREA" ||
          ((activeEl as HTMLElement)?.isContentEditable && activeEl !== editorRef.current));

      if (isOtherInputFocused) return;

      const isFilePasteShortcut =
        os === "mac"
          ? e.metaKey &&
          e.shiftKey &&
          e.altKey &&
          (e.key.toLowerCase() === "v" || e.code === "KeyV")
          : e.ctrlKey &&
          e.shiftKey &&
          e.altKey &&
          (e.key.toLowerCase() === "v" || e.code === "KeyV");

      if (isFilePasteShortcut) {
        e.preventDefault();
        handlePasteClipboardAsFile();
        return;
      }

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

          editorRef.current?.focus();

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

      const isInputFocused =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (!isInputFocused) {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          editorRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    os,
    isScrollable,
    isExpanded,
    hasInput,
    captureCaretPosition,
    handleClearFiles,
    handlePasteClipboardAsFile,
  ]);

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

    if (editorRef.current) {
      editorRef.current.innerText = "";
      editorRef.current.focus();
    }
  };

  useEffect(() => {
    return () => {
      if (pendingLineBreakTimeoutRef.current) {
        clearTimeout(pendingLineBreakTimeoutRef.current);
      }
    };
  }, []);

  const handleTakeScreenshot = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
      });
      const track = stream.getVideoTracks()[0];
      const ImageCaptureClass = (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture;

      if (!ImageCaptureClass) {
        throw new Error("ImageCapture API is not supported in this browser.");
      }

      const imageCapture = new ImageCaptureClass(track);
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement("canvas");

      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext("2d");

      context?.drawImage(bitmap, 0, 0);
      track.stop();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `screenshot-${Date.now()}.png`, {
          type: "image/png",
        });
        handleFilesAdded([file], "input");
      }, "image/png");
    } catch (err) {
      console.warn("Screenshot capture cancelled or failed:", err);
    }
  }, [handleFilesAdded]);

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
                    className="absolute inset-0 dark:opacity-0 opacity-100 opacity rounded-2xl"
                  />

                  <Image
                    src={Frame_Fluina_small_light}
                    alt="Frame Fluina small light"
                    width={60}
                    height={60}
                    className="absolute inset-0 dark:opacity-100 opacity-0 opacity rounded-2xl"
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
                <Menu.Trigger>
                  <Button
                    aria-label="Attatch"
                    shape="circle"
                    className="bg-back-2"
                  >
                    <Plus className="text-fore-1 all" />
                  </Button>

                  <Menu.Content>
                    <Menu.Item
                      icon={<Paperclip />}
                      shortcut="Ctrl+Shift+Alt+U"
                      onAction={() => fileInputRef.current?.click()}
                    >
                      ファイルを添付
                    </Menu.Item>

                    {!isMobile && (
                      <Menu.Item onAction={handleTakeScreenshot} icon={<Camera />}>
                        スクリーンショットを撮影
                      </Menu.Item>
                    )}

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
              </Tooltip>
            </motion.div>

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
                        const isExtensionOnly =
                          file.name.startsWith(".") && lastDotIndex === 0;
                        const hasExtension =
                          lastDotIndex !== -1 && lastDotIndex !== 0;

                        let fileNameWithoutExt = "";
                        let fileExtension = "";

                        if (isExtensionOnly) {
                          fileNameWithoutExt = "";
                          fileExtension = file.name.slice(1).toUpperCase();
                        } else if (hasExtension) {
                          fileNameWithoutExt = file.name.slice(0, lastDotIndex);
                          fileExtension = file.name
                            .slice(lastDotIndex + 1)
                            .toUpperCase();
                        } else {
                          fileNameWithoutExt = file.name;
                          fileExtension = "";
                        }

                        const displayBadge = fileExtension;

                        return (
                          <motion.div
                            key={id}
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={TRANSITION}
                            className="group size-30 relative flex-none overflow-clip flex justify-start items-center rounded-3xl bg-back-2 border border-back-5 focus-within:border-2 focus-within:border-fore-1"
                          >
                            <Tooltip content={file.name} placement="bottom">
                              <Button
                                onKeyDown={(e) => {
                                  if (e.key === "Backspace" || e.key === "Delete") {
                                    e.preventDefault();
                                    handleRemoveFile(fileIndex);
                                  }
                                }}
                                aria-label={file.name}
                                className="size-full scale-100! [&>*:not(:first-child)]:scale-100!"
                              >
                                {filePreviewUrls[fileIndex] ? (
                                  <div className="relative size-full">
                                    {file.type.startsWith("video/") ? (
                                      <video
                                        src={filePreviewUrls[fileIndex] ?? ""}
                                        className="size-full object-cover"
                                        preload="metadata"
                                      >
                                        <track kind="captions" />
                                      </video>
                                    ) : (
                                      <Image
                                        src={filePreviewUrls[fileIndex] ?? ""}
                                        alt={file.name}
                                        fill
                                        unoptimized
                                        className="size-full object-cover"
                                      />
                                    )}

                                    {displayBadge && (
                                      <div className="absolute left-2 right-2 bottom-2">
                                        <span className="block text-xs text-fore-1 text-center font-sans-serif font-light truncate w-full p-1 border border-back-5 bg-back-3 rounded-full">
                                          {displayBadge}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="p-2 size-full flex flex-col justify-between">
                                    <span className="line-clamp-3 p-1 break-all text-ellipsis text-sm text-fore-1 text-left font-sans-serif font-medium">
                                      {fileNameWithoutExt || file.name}
                                    </span>

                                    {displayBadge ? (
                                      <span className="text-xs text-fore-1 text-center font-sans-serif font-light truncate w-full p-1 border border-back-5 bg-back-3 rounded-full">
                                        {displayBadge}
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </Button>
                            </Tooltip>

                            <Tooltip
                              content="削除"
                              placement="left"
                              shortcut={{
                                mac: ["Delete"],
                                windows: ["Backspace"],
                              }}
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

            <motion.div
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
                <motion.div
                  autoFocus
                  contentEditable
                  suppressContentEditableWarning
                  ref={editorRef}
                  onInput={(e) => {
                    const text = e.currentTarget.innerText;

                    if (text === "\n" || text === "\r\n") {
                      e.currentTarget.textContent = "";
                      setValue("");
                    } else {
                      setValue(text);
                    }
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
                  spellCheck={false}
                  aria-multiline="true"
                  id="prompt"
                  className="block outline-none overflow-y-clip resize-none w-full animate-caret text-lg text-fore-1 text-left font-sans-serif font-medium"
                />
              </motion.div>
            </motion.div>

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
                      mac: ["⌘", "Shift", "Option", "Delete"],
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