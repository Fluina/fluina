"use client";
import { createMathPlugin } from "@streamdown/math";
import {
  ArrowUp,
  AudioLines,
  Camera,
  Check,
  Copy,
  Delete,
  Folder,
  Globe,
  Loader,
  Maximize2,
  Mic,
  Minimize2,
  Paperclip,
  Pencil,
  Plug,
  Plus,
  Puzzle,
  RotateCcw,
  Square,
  Timer,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Image from "next/image";
import type { SyntheticEvent } from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";
import { Button, Menu, ScrollArea, Tooltip } from "@/components/parts";
import {
  type ArchivedAttachment,
  appendChatMessage,
  type ChatArchivePage,
  type ChatArchiveRecord,
  getChatArchiveSummary,
  loadLatestChatPage,
  loadLatestChatTurns,
  loadMessagesToSummarize,
  loadOlderChatTurns,
  requestPersistentChatStorage,
  saveChatArchiveSummary,
} from "@/lib/chat-archive";
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
  new (
    track: MediaStreamTrack,
  ): {
    grabFrame(): Promise<ImageBitmap>;
  };
}

type AttachedFile = {
  id: string;
  file: File;
  source: "input" | "paste" | "drag";
};

type MessageNotice = {
  kind: "cancelled" | "error";
  text: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ArchivedAttachment[];
  timestamp: number;
  duration?: number;
  edited?: boolean;
  notice?: MessageNotice;
};

const USER_CANCEL_REASON = "user-cancelled";
const CANCELLED_NOTICE_TEXT = "送信が取り消されました。";

const CHAT_PAGE_TURN_LIMIT = 10;
const CHAT_PAGE_MESSAGE_LIMIT = CHAT_PAGE_TURN_LIMIT * 2;
const SUMMARY_BATCH_LIMIT = 20;
const CHAT_MESSAGE_MAX_LENGTH = 4000;
const EMPTY_ASSISTANT_MESSAGE =
  "この返答は空で保存されています。元の質問から再試行してください。";
type ChatScrollBehavior = "instant" | "smooth";
const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

const MessageNoticeBox = ({ notice }: { notice: MessageNotice }) => (
  <p
    role={notice.kind === "error" ? "alert" : "status"}
    className={`select-text text-sm p-2 border border-dashed ${
      notice.kind === "error"
        ? "text-red border-red bg-red/25"
        : "text-yellow border-yellow bg-yellow/25"
    }`}
  >
    {notice.text}
  </p>
);
const markdownPlugins = { math: mathPlugin };

const MessageAttachments = ({
  attachments,
}: {
  attachments: NonNullable<Message["attachments"]>;
}) => {
  const urls = useMemo(
    () =>
      attachments.map(({ blob, type }) =>
        type.startsWith("image/") ? URL.createObjectURL(blob) : null,
      ),
    [attachments],
  );

  useEffect(
    () => () => {
      for (const url of urls) {
        if (url) URL.revokeObjectURL(url);
      }
    },
    [urls],
  );

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map(({ id, name }, index) => {
        const url = urls[index];

        return url ? (
          <Image
            key={id}
            src={url}
            alt={name}
            width={160}
            height={160}
            unoptimized
            className="size-40 object-cover border border-back-5"
          />
        ) : (
          <span
            key={id}
            className="max-w-60 truncate text-sm px-2 py-1 border border-back-5 bg-back-3"
          >
            {name}
          </span>
        );
      })}
    </div>
  );
};

const readAssistantError = async (response: Response) => {
  let detail = "";
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      detail = payload.error;
    }
  } catch {
    detail = "";
  }

  if (/ZDR violation|Zero Data Retention/i.test(detail)) {
    return "OpenRouterのプライバシー設定（Zero Data Retention）により、利用可能な無料モデルがありません。アカウント設定に合うモデルを選ぶか、[OpenRouterのPrivacy Settings](https://openrouter.ai/settings/privacy)で制限を確認してください。";
  }

  if (
    /Provider returned error|no endpoints out of \d+ requested/i.test(detail)
  ) {
    return "OpenRouterの無料モデル提供元でエラーが発生しました。少し待って再試行してください。改善しない場合は、[OpenRouterのPrivacy Settings](https://openrouter.ai/settings/privacy)でZero Data Retentionが無料モデルを制限していないか確認してください。";
  }

  if (/empty chat completion|empty streaming response/i.test(detail)) {
    return "AIから空の応答が返されました。時間をおいて再度お試しください。";
  }

  return detail || `AIサーバーでエラーが発生しました（${response.status}）。`;
};

const AssistantMarkdown = memo(function AssistantMarkdown({
  content,
  isAnimating,
}: {
  content: string;
  isAnimating: boolean;
}) {
  const mediaPattern = /\[\[FLUINA_MEDIA:([^\]]+)\]\]/g;
  const parts: Array<
    | { type: "text"; key: string; content: string }
    | {
        type: "media";
        key: string;
        kind: "image";
        url: string;
        alt: string;
      }
    | {
        type: "media";
        key: string;
        kind: "video";
        url: string;
        alt: string;
        captionsUrl: string;
      }
  > = [];
  let cursor = 0;

  for (const match of content.matchAll(mediaPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({
        type: "text",
        key: `text-${cursor}`,
        content: content.slice(cursor, index),
      });
    }

    try {
      const payload: unknown = JSON.parse(decodeURIComponent(match[1]));
      if (
        typeof payload === "object" &&
        payload !== null &&
        "kind" in payload &&
        (payload.kind === "image" || payload.kind === "video") &&
        "url" in payload &&
        typeof payload.url === "string" &&
        /^https?:\/\//.test(payload.url) &&
        "alt" in payload &&
        typeof payload.alt === "string"
      ) {
        if (payload.kind === "image") {
          parts.push({
            type: "media",
            key: `media-${index}`,
            kind: "image",
            url: payload.url,
            alt: payload.alt,
          });
        } else if (
          "captionsUrl" in payload &&
          typeof payload.captionsUrl === "string" &&
          /^https?:\/\//.test(payload.captionsUrl)
        ) {
          parts.push({
            type: "media",
            key: `media-${index}`,
            kind: "video",
            url: payload.url,
            alt: payload.alt,
            captionsUrl: payload.captionsUrl,
          });
        } else {
          parts.push({
            type: "text",
            key: `text-${index}`,
            content: match[0],
          });
        }
      } else {
        parts.push({
          type: "text",
          key: `text-${index}`,
          content: match[0],
        });
      }
    } catch {
      parts.push({
        type: "text",
        key: `text-${index}`,
        content: match[0],
      });
    }
    cursor = index + match[0].length;
  }

  if (cursor < content.length || parts.length === 0) {
    parts.push({
      type: "text",
      key: `text-${cursor}`,
      content: content.slice(cursor),
    });
  }

  return (
    <div className="flex flex-col gap-3 max-w-none prose prose-fluina dark:prose-invert">
      {parts.map((part) =>
        part.type === "media" ? (
          part.kind === "video" ? (
            <video
              key={part.key}
              controls
              crossOrigin="anonymous"
              preload="metadata"
              aria-label={part.alt}
              className="max-h-[70vh] max-w-full border border-back-5"
            >
              <source src={part.url} type="video/mp4" />
              <track
                kind="captions"
                src={part.captionsUrl}
                srcLang="und"
                label="Visual description"
              />
            </video>
          ) : (
            <Image
              key={part.key}
              src={part.url}
              loader={({ src }) => src}
              alt={part.alt}
              width={1280}
              height={720}
              unoptimized
              className="max-h-[70vh] max-w-full object-contain border border-back-5"
            />
          )
        ) : (
          <Streamdown
            key={part.key}
            mode={isAnimating ? "streaming" : "static"}
            isAnimating={isAnimating}
            plugins={markdownPlugins}
          >
            {part.content}
          </Streamdown>
        ),
      )}
    </div>
  );
});

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [
    days > 0 ? `${days}d` : "",
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    seconds > 0 ? `${seconds}s` : "",
  ].join("");

  return parts || "0s";
};

const generateId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const formatMessageTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const time = date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return `${year}/${month}/${day}(${weekday}) ${time}`;
};

const pastePlainText = (e: React.ClipboardEvent<HTMLDivElement>) => {
  e.preventDefault();

  const text = e.clipboardData.getData("text/plain");
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  range.deleteContents();

  const textNode = document.createTextNode(text);

  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);

  e.currentTarget.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }),
  );
};

const insertTextIntoEditor = (editor: HTMLDivElement, text: string) => {
  const wasFocused = document.activeElement === editor;

  editor.focus();

  const selection = window.getSelection();

  if (!selection) return;

  let range: Range;

  if (
    !wasFocused ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !editor.contains(selection.anchorNode)
  ) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  } else {
    range = selection.getRangeAt(0);
  }

  range.deleteContents();

  const textNode = document.createTextNode(text);

  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);

  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }),
  );
};

export default function Ask() {
  const os = useOS();
  const [isMobile, setIsMobile] = useState(false);

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [value, setValue] = useState("");
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [files, setFiles] = useState<AttachedFile[]>([]);

  const [messages, setMessages] = useState<ChatArchiveRecord[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [firstMessageSequence, setFirstMessageSequence] = useState<
    number | null
  >(null);
  const loadedFirstSequenceRef = useRef<number | null>(null);
  const hasExpandedHistoryRef = useRef(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const [isInitialChatPositioned, setIsInitialChatPositioned] = useState(false);
  // 先頭に過去ログを足す描画の間だけ true にし、仮想リストにスクロール位置を維持させる
  const [isPrependingHistory, setIsPrependingHistory] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [persistentStorageGranted, setPersistentStorageGranted] = useState<
    boolean | null
  >(null);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editingRef = useRef<HTMLDivElement>(null);
  const editingInitialValueRef = useRef("");

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pendingChatScrollToBottomRef = useRef<ChatScrollBehavior | null>(null);
  const pendingCaretRef = useRef<{
    caretTop: number;
    caretRatio: number | null;
  } | null>(null);
  const singleLineRef = useRef<number>(0);
  const singleLineWidthRef = useRef<number>(0);
  const isComposingRef = useRef(false);
  const pendingLineBreakTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const hasText = value.length > 0;
  const hasInput = value.trim().length > 0;
  const hasFiles = files.length > 0;

  // 最新の会話ターンが表示領域の高さを最低限占有するよう、末尾の余白を動的に算出する
  const updateTailSpacer = useCallback((viewportOverride?: HTMLElement) => {
    const host = chatScrollRef.current;
    const viewport =
      viewportOverride ??
      host?.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
      host;
    const spacer = host?.querySelector<HTMLElement>("[data-chat-tail-spacer]");
    if (!viewport || !spacer) return;

    const lastTurn = host?.querySelector<HTMLElement>("[data-chat-last-turn]");
    if (!lastTurn) {
      spacer.style.height = "0px";
      return;
    }
    const used =
      spacer.getBoundingClientRect().top - lastTurn.getBoundingClientRect().top;
    const next = `${Math.max(Math.ceil(viewport.clientHeight - used), 0)}px`;
    if (spacer.style.height !== next) spacer.style.height = next;
  }, []);

  const scrollChatToBottom = useCallback(
    (behavior: ChatScrollBehavior, viewportOverride?: HTMLElement) => {
      const chatScrollHost = chatScrollRef.current;
      const viewport =
        viewportOverride ??
        chatScrollHost?.querySelector<HTMLElement>(
          "[data-overlayscrollbars-viewport]",
        ) ??
        chatScrollHost;
      if (!viewport) return;

      updateTailSpacer(viewport);

      const maxScrollTop = Math.max(
        viewport.scrollHeight - viewport.clientHeight,
        0,
      );
      if (behavior === "smooth") {
        viewport.scrollTo({ top: maxScrollTop, behavior });
      } else {
        viewport.scrollTop = maxScrollTop;
      }
      scrollTopRef.current = maxScrollTop;
    },
    [updateTailSpacer],
  );

  const tailObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver(() => updateTailSpacer());
    tailObserverRef.current = observer;
    return () => {
      observer.disconnect();
      tailObserverRef.current = null;
    };
  }, [updateTailSpacer]);

  useLayoutEffect(() => {
    updateTailSpacer();

    const observer = tailObserverRef.current;
    const host = chatScrollRef.current;
    if (!observer || !host) return;
    observer.disconnect();
    const viewport =
      host.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
      host;
    observer.observe(viewport);
    const lastTurn = host.querySelector<HTMLElement>("[data-chat-last-turn]");
    if (lastTurn) observer.observe(lastTurn);
  });

  const applyArchivePage = useCallback(
    (
      page: ChatArchivePage,
      scrollBehavior: ChatScrollBehavior | null = null,
    ) => {
      if (scrollBehavior) {
        pendingChatScrollToBottomRef.current = scrollBehavior;
      }
      setMessages(page.messages);
      setHasOlderMessages(page.hasOlder);
      setFirstMessageSequence(page.firstSequence);
      loadedFirstSequenceRef.current = page.firstSequence;
    },
    [],
  );

  useEffect(() => {
    let active = true;

    const initializeArchive = async () => {
      try {
        try {
          const persistent = await requestPersistentChatStorage();
          if (active) setPersistentStorageGranted(persistent);
        } catch (error) {
          console.warn("Persistent storage request failed:", error);
          if (active) setPersistentStorageGranted(false);
        }

        const page = await loadLatestChatTurns(CHAT_PAGE_TURN_LIMIT);
        if (active) {
          applyArchivePage(page, "instant");
          setArchiveReady(true);
        }
      } catch (error) {
        console.error("Chat archive initialization failed:", error);
        if (active) {
          setArchiveError(
            "端末内の会話履歴を読み込めませんでした。ブラウザーの保存設定を確認してください。",
          );
        }
      }
    };

    void initializeArchive();

    return () => {
      active = false;
    };
  }, [applyArchivePage]);

  const { elementRef: scrollRef } = useOverlayScroll<HTMLDivElement>(
    {
      axis: "y",
      onScroll: (viewport) => {
        scrollTopRef.current = viewport.scrollTop;
      },
      onInit: (el) => {
        const pending = pendingCaretRef.current;
        const caretTop = pending?.caretTop ?? 0;
        const caretRatio = pending?.caretRatio ?? null;

        pendingCaretRef.current = null;

        const restore = () => {
          const maxScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);
          const target =
            caretRatio !== null
              ? caretTop - caretRatio * el.clientHeight
              : scrollTopRef.current;
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

  const refreshVisibleArchivePage = useCallback(
    async (scrollBehavior: ChatScrollBehavior | null = null) => {
      const page = await loadLatestChatTurns(
        CHAT_PAGE_TURN_LIMIT,
        hasExpandedHistoryRef.current ? loadedFirstSequenceRef.current : null,
      );
      applyArchivePage(page, scrollBehavior);
      return page;
    },
    [applyArchivePage],
  );

  const showOlderMessages = useCallback(async () => {
    if (
      firstMessageSequence === null ||
      !hasOlderMessages ||
      isLoadingOlderMessages
    ) {
      return;
    }

    setIsLoadingOlderMessages(true);
    try {
      const olderPage = await loadOlderChatTurns(
        firstMessageSequence,
        CHAT_PAGE_TURN_LIMIT,
      );
      hasExpandedHistoryRef.current = true;
      setIsPrependingHistory(true);
      setMessages((currentMessages) => [
        ...olderPage.messages,
        ...currentMessages,
      ]);
      setHasOlderMessages(olderPage.hasOlder);
      setFirstMessageSequence(olderPage.firstSequence);
      loadedFirstSequenceRef.current = olderPage.firstSequence;
    } catch (error) {
      console.error("Older chat page load failed:", error);
      setArchiveError("過去の会話を読み込めませんでした。");
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [firstMessageSequence, hasOlderMessages, isLoadingOlderMessages]);

  useLayoutEffect(() => {
    if (isPrependingHistory) setIsPrependingHistory(false);

    const scrollBehavior = pendingChatScrollToBottomRef.current;
    if (scrollBehavior) {
      scrollChatToBottom(scrollBehavior);
      pendingChatScrollToBottomRef.current = null;
    }
  });

  useLayoutEffect(() => {
    if (!archiveReady || isInitialChatPositioned) return;

    let frame = 0;
    let stableFrames = 0;
    let previousHeight = -1;
    let previousClientHeight = -1;
    let previousViewport: HTMLElement | null = null;

    const positionInitialChat = () => {
      const chatScrollHost = chatScrollRef.current;
      const viewport =
        chatScrollHost?.querySelector<HTMLElement>(
          "[data-overlayscrollbars-viewport]",
        ) ?? chatScrollHost;
      if (!viewport) {
        frame = requestAnimationFrame(positionInitialChat);
        return;
      }

      scrollChatToBottom("instant", viewport);

      const isAtBottom =
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1;
      if (
        isAtBottom &&
        viewport === previousViewport &&
        viewport.scrollHeight === previousHeight &&
        viewport.clientHeight === previousClientHeight
      ) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        previousViewport = viewport;
        previousHeight = viewport.scrollHeight;
        previousClientHeight = viewport.clientHeight;
      }

      if (stableFrames >= 2) {
        setIsInitialChatPositioned(true);
        return;
      }

      frame = requestAnimationFrame(positionInitialChat);
    };

    frame = requestAnimationFrame(positionInitialChat);
    return () => cancelAnimationFrame(frame);
  }, [archiveReady, isInitialChatPositioned, scrollChatToBottom]);

  // 初期表示後に遅れて高さが変わっても、ユーザー操作があるまで最下部に固定する
  useEffect(() => {
    if (!isInitialChatPositioned) return;

    const host = chatScrollRef.current;
    if (!host) return;

    // overlayscrollbars が再生成されても追従できるよう、毎回 viewport を取り直す
    const stick = () => scrollChatToBottom("instant");
    const resizeObserver = new ResizeObserver(stick);
    const observeTargets = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(host);
      for (const child of host.querySelectorAll<HTMLElement>(
        "[data-overlayscrollbars-viewport], [data-chat-last-turn], [data-chat-tail-spacer]",
      )) {
        resizeObserver.observe(child);
      }
    };
    observeTargets();

    const mutationObserver = new MutationObserver(() => {
      observeTargets();
      stick();
    });
    mutationObserver.observe(host, { childList: true, subtree: true });

    // 自動スクロール以外で最下部から外れた(0 への巻き戻し等)場合も戻す
    const handleScroll = () => {
      const viewport =
        host.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
        host;
      if (
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop >
        1
      ) {
        stick();
      }
    };
    host.addEventListener("scroll", handleScroll, true);
    document.fonts?.ready.then(stick);

    let frame = 0;
    const enforce = () => {
      const viewport =
        host.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
        host;
      if (
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop >
        1
      ) {
        stick();
      }
      frame = requestAnimationFrame(enforce);
    };
    frame = requestAnimationFrame(enforce);

    const userEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    const stop = () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      host.removeEventListener("scroll", handleScroll, true);
      clearTimeout(timeoutId);
      for (const type of userEvents) {
        host.removeEventListener(type, stop, true);
      }
    };
    for (const type of userEvents) {
      host.addEventListener(type, stop, { capture: true, passive: true });
    }
    const timeoutId = setTimeout(stop, 3000);

    return stop;
  }, [isInitialChatPositioned, scrollChatToBottom]);

  //  ================================================================
  //    送信
  //  ================================================================

  const abortControllerRef = useRef<AbortController | null>(null);

  const requestAssistantReply = useCallback(
    async (promptContent: string) => {
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(
        () =>
          controller.abort(
            new DOMException("The AI response timed out.", "TimeoutError"),
          ),
        120000,
      );
      const assistantMessageId = generateId();
      const startedAt = Date.now();
      let reply = "";
      let renderTimeout: ReturnType<typeof setTimeout> | null = null;
      let assistantMessagePersisted = false;

      const flushReply = () => {
        if (renderTimeout !== null) {
          clearTimeout(renderTimeout);
          renderTimeout = null;
        }

        setStreamingMessage((current) =>
          current?.id === assistantMessageId
            ? { ...current, content: reply }
            : current,
        );
      };

      setStreamingMessage({
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: startedAt,
      });

      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

        if (!apiUrl.startsWith("http")) {
          throw new Error("CONFIG_ERROR: APIのURL設定が不正です。");
        }

        const latestPage = await loadLatestChatPage(CHAT_PAGE_MESSAGE_LIMIT);
        const latestMessage = latestPage.messages.at(-1);
        if (
          !latestMessage ||
          latestMessage.role !== "user" ||
          latestMessage.content !== promptContent
        ) {
          throw new Error(
            "会話履歴と送信内容が一致しません。再度お試しください。",
          );
        }

        let summary = await getChatArchiveSummary();
        if (latestPage.firstSequence !== null) {
          try {
            while (true) {
              const batch = await loadMessagesToSummarize(
                summary.throughSequence,
                latestPage.firstSequence,
                SUMMARY_BATCH_LIMIT,
              );
              if (batch.length === 0) break;

              const summaryResponse = await fetch(
                `${apiUrl}/api/ask/summarize`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    summary: summary.content,
                    messages: batch.map(({ role, content }) => ({
                      role,
                      content:
                        content.length > CHAT_MESSAGE_MAX_LENGTH
                          ? `${content.slice(0, CHAT_MESSAGE_MAX_LENGTH)}\n[以降省略]`
                          : content,
                    })),
                  }),
                  signal: controller.signal,
                },
              );
              if (!summaryResponse.ok) {
                throw new Error(
                  `履歴の要約に失敗しました（${summaryResponse.status}）。`,
                );
              }

              const result: unknown = await summaryResponse.json();
              if (
                typeof result !== "object" ||
                result === null ||
                !("summary" in result) ||
                typeof result.summary !== "string" ||
                !result.summary.trim()
              ) {
                throw new Error("会話履歴の要約応答が不正です。");
              }

              summary = {
                content: result.summary.slice(0, 12000),
                throughSequence:
                  batch.at(-1)?.sequence ?? summary.throughSequence,
              };
              await saveChatArchiveSummary(summary);
            }
          } catch (error) {
            if (controller.signal.aborted) throw error;

            console.warn(
              "Chat history summarization failed; continuing with recent history:",
              error,
            );
            const reason = error instanceof Error ? ` (${error.message})` : "";
            setArchiveError(
              `過去の履歴を要約できなかったため、直近の会話を使って回答します${reason}`,
            );
          }
        }

        const recentHistory = latestPage.messages
          .slice(0, -1)
          .filter(({ content }) => content.trim())
          .map(({ role, content }) => ({
            role,
            content:
              content.length > CHAT_MESSAGE_MAX_LENGTH
                ? `${content.slice(0, CHAT_MESSAGE_MAX_LENGTH)}\n[以降省略]`
                : content,
          }));

        const formData = new FormData();
        formData.append("prompt", promptContent);
        formData.append("summary", summary.content);
        formData.append("history", JSON.stringify(recentHistory));
        for (const { blob, name, type } of latestMessage.attachments ?? []) {
          formData.append("files", new File([blob], name, { type }));
        }

        const response = await fetch(`${apiUrl}/api/ask`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readAssistantError(response));
        }

        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error(
            "STREAM_ERROR: サーバーからの返答を読み込めませんでした。",
          );
        }

        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value: chunk } = await reader.read();
            const text = decoder.decode(chunk, { stream: !done });

            if (text) {
              reply += text;

              if (renderTimeout === null) {
                renderTimeout = setTimeout(() => {
                  renderTimeout = null;
                  flushReply();
                }, 50);
              }
            }

            if (done) break;
          }
        } finally {
          reader.releaseLock();
        }

        flushReply();
        if (!reply.trim()) {
          throw new Error(
            "AIから空の応答が返されました。時間をおいて再度お試しください。",
          );
        }
        await appendChatMessage({
          id: assistantMessageId,
          role: "assistant",
          content: reply,
          timestamp: Date.now(),
          duration: Date.now() - startedAt,
        });
        assistantMessagePersisted = true;
        await refreshVisibleArchivePage();
        setStreamingMessage(null);
      } catch (error: unknown) {
        const isUserCancelled =
          controller.signal.aborted &&
          controller.signal.reason === USER_CANCEL_REASON;

        if (isUserCancelled) {
          console.info("AI request was cancelled by the user.");
        } else if (controller.signal.aborted) {
          console.warn("AI request was aborted:", controller.signal.reason);
        } else {
          console.error("Submit Error:", error);
        }

        let errorMessage = "予期せぬエラーが発生しました。";

        if (controller.signal.aborted) {
          errorMessage =
            "応答を完了できませんでした。時間をおいて再度お試しください。";
        } else if (error instanceof Error) {
          if (error.name === "AbortError") {
            errorMessage = "通信が中断されました。もう一度お試しください。";
          } else if (error.name === "TimeoutError") {
            errorMessage =
              "応答に時間がかかっています。時間をおいて再度お試しください。";
          } else if (
            error.name === "TypeError" &&
            error.message.includes("fetch")
          ) {
            errorMessage =
              "サーバーに接続できませんでした。CORS設定またはサーバーの起動状態を確認してください。";
          } else {
            errorMessage = error.message;
          }
        }

        if (renderTimeout !== null) {
          clearTimeout(renderTimeout);
          renderTimeout = null;
        }

        const failedMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: reply,
          timestamp: Date.now(),
          duration: Date.now() - startedAt,
          notice: isUserCancelled
            ? { kind: "cancelled", text: CANCELLED_NOTICE_TEXT }
            : { kind: "error", text: errorMessage },
        };
        if (!assistantMessagePersisted) {
          try {
            await appendChatMessage(failedMessage);
            await refreshVisibleArchivePage();
          } catch (archiveFailure) {
            console.error("Failed to persist assistant error:", archiveFailure);
            setArchiveError("返答を端末内の履歴に保存できませんでした。");
          }
        } else {
          setArchiveError("返答は保存されましたが、画面の更新に失敗しました。");
        }
        setStreamingMessage(null);
      } finally {
        clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [refreshVisibleArchivePage],
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort(USER_CANCEL_REASON);
  }, []);

  const handleSubmit = async (e?: SyntheticEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!hasInput || isLoading || !archiveReady) return;

    const userPrompt = value.trim();
    const userMessageId = generateId();
    const newUserMessage: Message = {
      id: userMessageId,
      role: "user",
      content: userPrompt,
      attachments: files.map(({ id, file }) => ({
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        blob: file,
      })),
      timestamp: Date.now(),
    };

    try {
      await appendChatMessage(newUserMessage);
      await refreshVisibleArchivePage("smooth");
    } catch (error) {
      console.error("User message persistence failed:", error);
      setArchiveError("メッセージを端末内の履歴に保存できませんでした。");
      return;
    }

    setValue("");
    setIsAdjusted(false);
    setIsScrollable(false);
    setIsExpanded(false);
    setFiles([]);

    if (typeof window !== "undefined" && !navigator.onLine) {
      try {
        await appendChatMessage({
          id: `${userMessageId}-error`,
          role: "assistant",
          content: "",
          notice: {
            kind: "error",
            text: "ネットワークに接続されていないため、接続環境を確認してください。",
          },
          timestamp: Date.now(),
        });
        await refreshVisibleArchivePage("smooth");
      } catch (error) {
        console.error("Offline message persistence failed:", error);
        setArchiveError("オフラインの通知を履歴に保存できませんでした。");
      }
      return;
    }

    await requestAssistantReply(userPrompt);
  };

  const appendPromptAtLatest = useCallback(
    async (message: Message) => {
      if (!archiveReady || isLoading) return;

      try {
        await appendChatMessage(message);
        await refreshVisibleArchivePage("smooth");
        await requestAssistantReply(message.content);
      } catch (error) {
        console.error("Appending a prompt to chat history failed:", error);
        setArchiveError("メッセージを端末内の履歴に保存できませんでした。");
      }
    },
    [archiveReady, isLoading, refreshVisibleArchivePage, requestAssistantReply],
  );

  //  ================================================================
  //    メッセージ
  //  ================================================================

  const handleCopyMessage = useCallback(async (content: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      }
    } catch (error) {
      console.error("Copy Error:", error);
    }
  }, []);
  const handleStartEdit = useCallback(
    (msg: Message) => {
      if (isLoading) return;
      editingInitialValueRef.current = msg.content;
      setEditingMessageId(msg.id);
      setEditingValue(msg.content);
    },
    [isLoading],
  );
  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingValue("");
  }, []);

  const handleSubmitEdit = useCallback(
    async (id: string) => {
      const trimmed = editingValue.trim();

      if (!trimmed || isLoading) return;

      const index = messages.findIndex((m) => m.id === id);

      if (index === -1) return;

      const updatedMessage: Message = {
        id: generateId(),
        role: "user",
        content: trimmed,
        attachments: messages[index].attachments,
        timestamp: Date.now(),
        edited: true,
      };

      setEditingMessageId(null);
      setEditingValue("");
      await appendPromptAtLatest(updatedMessage);
    },
    [appendPromptAtLatest, editingValue, isLoading, messages],
  );

  const handleRetryMessage = useCallback(
    async (id: string) => {
      if (isLoading) return;

      const index = messages.findIndex((m) => m.id === id);
      if (index === -1) return;

      const updatedMessage: Message = {
        id: generateId(),
        role: "user",
        content: messages[index].content,
        attachments: messages[index].attachments,
        timestamp: Date.now(),
      };

      await appendPromptAtLatest(updatedMessage);
    },
    [appendPromptAtLatest, isLoading, messages],
  );

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

    if (value === "") {
      if (editorRef.current.innerText !== "") {
        editorRef.current.innerText = "";

        calcTextarea();
      }
      return;
    }

    if (
      document.activeElement !== editorRef.current &&
      editorRef.current.innerText !== value
    ) {
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
      const newAttachedFiles: AttachedFile[] = Array.from(newFiles).map(
        (file) => ({
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file,
          source,
        }),
      );
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

      return (
        e.dataTransfer.types &&
        Array.from(e.dataTransfer.types).includes("Files")
      );
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

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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

          insertTextIntoEditor(editor, text);
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
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        ((activeEl as HTMLElement)?.isContentEditable &&
          activeEl !== editorRef.current);

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

  useEffect(() => {
    if (!editingMessageId || !editingRef.current) return;

    const el = editingRef.current;

    el.textContent = editingInitialValueRef.current;
    el.focus();

    const range = document.createRange();

    range.selectNodeContents(el);
    range.collapse(false);

    const selection = window.getSelection();

    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editingMessageId]);

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
      const ImageCaptureClass = (
        window as unknown as { ImageCapture?: ImageCaptureConstructor }
      ).ImageCapture;

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

  const messageTurns = useMemo(
    () =>
      messages.reduce<Message[][]>((turns, message) => {
        const currentTurn = turns.at(-1);
        const previousMessage = currentTurn?.at(-1);

        if (
          !currentTurn ||
          (previousMessage?.role === "assistant" && message.role === "user")
        ) {
          turns.push([message]);
        } else {
          currentTurn.push(message);
        }

        return turns;
      }, []),
    [messages],
  );
  const chatKeepMounted = useMemo(() => {
    if (isExpanded || messageTurns.length === 0) return undefined;
    const indexes = [messageTurns.length - 1];
    if (editingMessageId) {
      const editingIndex = messageTurns.findIndex((turn) =>
        turn.some((msg) => msg.id === editingMessageId),
      );
      if (editingIndex >= 0) indexes.push(editingIndex);
    }
    return indexes;
  }, [isExpanded, messageTurns, editingMessageId]);
  const loadingMessage = (
    <motion.div
      key="assistant-loading"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-back-2 border border-back-5 self-start animate-pulse"
    >
      <p>Fluinaが考えています...</p>
    </motion.div>
  );

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0)" }}
            animate={{ opacity: 1, backdropFilter: "blur(1rem)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0)" }}
            transition={TRANSITION}
            className="transparency-effect fixed inset-0 p-2 bg-back-0/50 z-1000 pointer-events-none flex items-center justify-center"
          >
            <div className="animate-pulse flex flex-col gap-2 items-center justify-center size-full border-2 border-dashed border-fore-1">
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

      <div className="size-full flex flex-col p-4 items-center max-w-3xl justify-center gap-4">
        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            {messages.length === 0 && !isExpanded && (
              <motion.div
                layout="position"
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -25 }}
                transition={TRANSITION}
                className={`flex flex-col justify-center items-center gap-4 mb-8
                  ${messages.length === 0 ? "max-md:mt-auto" : "mt-auto"}
                  `}
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
                  className="text-center text-3xl text-fore-1"
                >
                  何でも訊いてみてね！
                </motion.h1>
              </motion.div>
            )}
          </AnimatePresence>

          {(archiveError || persistentStorageGranted === false) && (
            <div className="w-full space-y-1" aria-live="polite">
              {archiveError && (
                <p role="alert" className="text-sm text-red-500">
                  {archiveError}
                </p>
              )}
              {persistentStorageGranted === false && (
                <p className="text-xs text-fore-5">
                  このブラウザーは永続保存を許可していません。サイトデータの消去や容量整理で履歴が失われる可能性があります。
                </p>
              )}
            </div>
          )}

          <ScrollArea
            scrollRef={chatScrollRef}
            overlayScroll={{
              axis: "y",
              onInit: (viewport) => {
                const previousOverflowAnchor = viewport.style.overflowAnchor;
                viewport.style.overflowAnchor = "none";
                if (archiveReady) {
                  scrollChatToBottom("instant", viewport);
                }
                return () => {
                  viewport.style.overflowAnchor = previousOverflowAnchor;
                };
              },
            }}
            overlayScrollDeps={[archiveReady]}
            className="w-full"
            style={{
              visibility: isInitialChatPositioned ? "visible" : "hidden",
            }}
            virtual
            items={isExpanded ? [] : messageTurns}
            virtualConfig={{
              shift: isPrependingHistory,
              keepMounted: chatKeepMounted,
            }}
            header={
              <AnimatePresence mode="popLayout" initial={false}>
                {archiveReady && hasOlderMessages && (
                  <motion.div
                    key="older-messages-button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={TRANSITION}
                    className="flex w-full justify-center items-center p-2"
                  >
                    <Button
                      onPress={showOlderMessages}
                      isDisabled={isLoading || isLoadingOlderMessages}
                      aria-label="Load Older Messages"
                      className="w-full text-xs text-fore-5 p-2 border border-dotted border-back-5"
                    >
                      {isLoadingOlderMessages ? (
                        <output
                          aria-label="Loading Older Messages"
                          className="flex justify-center"
                        >
                          <Loader
                            size={16}
                            aria-hidden="true"
                            className="animate-spin"
                          />
                        </output>
                      ) : (
                        "◢◤ 続きを読み込む ◢◤"
                      )}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            }
            renderItem={(turn, turnIndex) => {
              const isLastTurn = turnIndex === messageTurns.length - 1;

              return (
                <motion.div
                  key={turn[0].id}
                  data-chat-last-turn={isLastTurn ? "" : undefined}
                  className={`flex flex-col gap-4 ${isLastTurn ? "" : "pb-8"}`}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {turn.map((msg) => {
                      const isEditing = editingMessageId === msg.id;
                      const isUser = msg.role === "user";
                      const isAssistant = msg.role === "assistant";

                      return (
                        <motion.div
                          key={msg.id}
                          data-chat-message-id={msg.id}
                          data-os-fade-top-anchor=""
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={TRANSITION}
                          className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`**:select-text ${isUser && "bg-back-2 px-6 py-4"}`}
                          >
                            {isEditing ? (
                              <motion.div
                                ref={editingRef}
                                onInput={(e) => {
                                  setEditingValue(
                                    e.currentTarget.innerText ?? "",
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitEdit(msg.id);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    handleCancelEdit();
                                  }
                                }}
                                onPaste={pastePlainText}
                                autoFocus
                                contentEditable
                                suppressContentEditableWarning
                                spellCheck={false}
                                aria-multiline="true"
                                id="reprompt"
                                className="animate-caret outline-none"
                              />
                            ) : isUser ? (
                              <div className="flex flex-col gap-2 items-end">
                                {msg.attachments && (
                                  <MessageAttachments
                                    attachments={msg.attachments}
                                  />
                                )}
                                <p>{msg.content}</p>
                              </div>
                            ) : (
                              msg.content && (
                                <AssistantMarkdown
                                  content={msg.content}
                                  isAnimating={
                                    isLoading && msg.id === messages.at(-1)?.id
                                  }
                                />
                              )
                            )}
                          </div>

                          {isAssistant && (msg.notice || !msg.content) && (
                            <MessageNoticeBox
                              notice={
                                msg.notice ?? {
                                  kind: "error",
                                  text: EMPTY_ASSISTANT_MESSAGE,
                                }
                              }
                            />
                          )}

                          {isUser && isEditing && (
                            <div className="flex justify-center items-center gap-2 p-2">
                              <Tooltip content="取消" placement="bottom">
                                <Button
                                  onPress={handleCancelEdit}
                                  aria-label="Cancel Edit"
                                  shape="circle"
                                  className="bg-back-2"
                                >
                                  <X />
                                </Button>
                              </Tooltip>

                              <Tooltip content="送信" placement="bottom">
                                <Button
                                  onPress={() => handleSubmitEdit(msg.id)}
                                  isDisabled={!editingValue.trim() || isLoading}
                                  aria-label="Save Edit"
                                  shape="circle"
                                  color="primary"
                                >
                                  <Check className="text-back-1_" />
                                </Button>
                              </Tooltip>
                            </div>
                          )}

                          {isUser && !isEditing && (
                            <div className="flex items-center gap-2 p-2">
                              {msg.edited && (
                                <span className="text-sm text-fore-5">
                                  編集済
                                </span>
                              )}

                              <span className="text-sm text-fore-5">
                                {formatMessageTime(msg.timestamp)}
                              </span>

                              <Tooltip content="再試行" placement="bottom">
                                <Button
                                  onPress={() => handleRetryMessage(msg.id)}
                                  isDisabled={isLoading}
                                  aria-label="Retry"
                                  shape="circle"
                                  className="size-5"
                                >
                                  <RotateCcw
                                    size={16}
                                    className="text-fore-5"
                                  />
                                </Button>
                              </Tooltip>

                              <Tooltip content="編集" placement="bottom">
                                <Button
                                  onPress={() => handleStartEdit(msg)}
                                  isDisabled={isLoading}
                                  aria-label="Edit"
                                  shape="circle"
                                  className="size-5"
                                >
                                  <Pencil size={16} className="text-fore-5" />
                                </Button>
                              </Tooltip>

                              <Tooltip content="コピー" placement="bottom">
                                <Button
                                  onPress={() => handleCopyMessage(msg.content)}
                                  aria-label="Copy"
                                  shape="circle"
                                  className="size-5"
                                >
                                  <Copy size={16} className="text-fore-5" />
                                </Button>
                              </Tooltip>
                            </div>
                          )}

                          {isAssistant && (
                            <div className="flex items-center gap-2 p-2">
                              {msg.content && (
                                <Tooltip content="コピー" placement="bottom">
                                  <Button
                                    onPress={() =>
                                      handleCopyMessage(msg.content)
                                    }
                                    aria-label="Copy"
                                    shape="circle"
                                    className="size-5"
                                  >
                                    <Copy size={16} className="text-fore-5" />
                                  </Button>
                                </Tooltip>
                              )}

                              {msg.duration !== undefined && (
                                <span className="flex items-center gap-1 text-sm text-fore-5">
                                  <Timer size={16} />
                                  {formatDuration(msg.duration)}
                                </span>
                              )}

                              <span className="text-sm text-fore-5">
                                {formatMessageTime(msg.timestamp)}
                              </span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              );
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {streamingMessage && !isExpanded && (
                <motion.div
                  key={streamingMessage.id}
                  data-os-fade-top-anchor=""
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={TRANSITION}
                  className="flex flex-col gap-2 items-start"
                >
                  {streamingMessage.content ? (
                    <AssistantMarkdown
                      content={streamingMessage.content}
                      isAnimating={isLoading}
                    />
                  ) : (
                    loadingMessage
                  )}

                  {streamingMessage.content && (
                    <div className="flex items-center gap-2 py-2">
                      <Tooltip content="コピー" placement="bottom">
                        <Button
                          onPress={() =>
                            handleCopyMessage(streamingMessage.content)
                          }
                          aria-label="Copy"
                          shape="circle"
                          className="size-5"
                        >
                          <Copy size={16} className="text-fore-5" />
                        </Button>
                      </Tooltip>

                      <span className="text-sm text-fore-5">
                        {formatMessageTime(streamingMessage.timestamp)}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              {!isExpanded &&
                !isLoading &&
                messages.at(-1)?.role === "assistant" && (
                  <motion.div
                    key="assistant-disclaimer"
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={TRANSITION}
                    className="py-2"
                  >
                    <p className="select-text text-xs text-fore-5 p-2 border border-dashed border-back-5">
                      ⚠
                      回答はAIによって書かれているため、間違いを含んでいることがあります。十分に注意した上でご利用ください。
                    </p>
                  </motion.div>
                )}
            </AnimatePresence>
            <div data-chat-tail-spacer aria-hidden="true" />
          </ScrollArea>

          <motion.form
            onSubmit={handleSubmit}
            ref={formRef}
            layout
            transition={TRANSITION}
            className={`flex-none grid gap-1 w-full items-center border border-back-5 shadow-lg bg-back-1 p-2 overflow-clip
              ${isExpanded ? "h-full" : "max-h-full"}
              ${
                hasFiles
                  ? isAdjusted || isExpanded
                    ? "grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto_1fr_auto]"
                    : hasText
                      ? "grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] grid-rows-[auto_auto]"
                      : "grid-cols-[auto_minmax(0,1fr)_auto_auto] grid-rows-[auto_auto]"
                  : isAdjusted || isExpanded
                    ? "grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_1fr_auto]"
                    : hasText
                      ? "grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
                      : "grid-cols-[auto_minmax(0,1fr)_auto_auto]"
              }
              ${messages.length === 0 ? "max-md:mt-auto" : "mt-auto"}
              `}
          >
            <motion.div
              layout="position"
              transition={TRANSITION}
              className={`${
                hasFiles
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
                    <Plus className="text-fore-1" />
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
                      <Menu.Item
                        onAction={handleTakeScreenshot}
                        icon={<Camera />}
                      >
                        スクリーンショットを撮影
                      </Menu.Item>
                    )}

                    <Menu.Separator />

                    <Menu.SubmenuTrigger>
                      <Menu.Item icon={<Folder />}>
                        プロジェクトに追加
                      </Menu.Item>
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
                  className={`flex items-center justify-center p-2 w-full col-start-1 row-start-1 ${
                    isAdjusted || isExpanded
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
                            className="group size-30 relative flex-none overflow-clip flex justify-start items-center bg-back-2 border border-back-5 focus-within:border-2 focus-within:border-fore-1"
                          >
                            <Tooltip content={file.name} placement="bottom">
                              <Button
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "Backspace" ||
                                    e.key === "Delete"
                                  ) {
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
                                      <div className="absolute left-1 right-1 bottom-1">
                                        <span className="block text-xs text-center font-light truncate w-full p-1 border border-back-5 bg-back-3">
                                          {displayBadge}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="p-1 size-full flex flex-col justify-between">
                                    <span className="line-clamp-3 p-1 break-all text-ellipsis text-sm">
                                      {fileNameWithoutExt || file.name}
                                    </span>

                                    {displayBadge ? (
                                      <span className="text-xs text-cente font-light truncate w-full p-1 border border-back-5 bg-back-3">
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
                                className="absolute top-1 right-1 border border-back-5 bg-back-3 md:opacity-0 max-md:opacity-100 group-focus-within:opacity-100 md:group-hover:opacity-100"
                              >
                                <X />
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
                  className={`row-start-1 ${
                    isAdjusted || isExpanded
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
                      <Trash2 />
                    </Button>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              layout="position"
              transition={TRANSITION}
              className={`relative w-full min-w-0 flex flex-col justify-start items-start ${isExpanded ? "h-full" : "[--os-fade-size:2.5rem]"}
              ${
                hasFiles
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
                    className="absolute inset-0 p-2 w-full pointer-events-none text-fore-9 truncate block"
                  >
                    {PLACEHOLDERS[placeholderIndex]}
                  </motion.span>
                </AnimatePresence>
              )}

              <motion.div
                ref={scrollRef}
                layout="position"
                transition={TRANSITION}
                className={`p-2 flex justify-center items-start relative w-full min-w-0 ${isExpanded && " h-full max-h-full"}`}
                style={
                  !isExpanded && singleLineRef.current > 0
                    ? { maxHeight: `${singleLineRef.current * 5 + 16}px` }
                    : undefined
                }
              >
                <motion.div
                  ref={editorRef}
                  onInput={(e) => {
                    const rawText = e.currentTarget.innerText;

                    if (rawText === "\n" || rawText === "\r\n") {
                      setValue("");
                    } else {
                      setValue(rawText);
                    }
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  onPaste={pastePlainText}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    setTimeout(() => {
                      isComposingRef.current = false;
                    }, 0);
                  }}
                  autoFocus
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  aria-multiline="true"
                  id="prompt"
                  className="block outline-none overflow-y-clip resize-none w-full min-w-0 wrap-anywhere animate-caret"
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
                  className={`${
                    hasFiles
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
                      <Delete />
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
                  className={`self-start ${
                    hasFiles
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
                          >
                            <Minimize2 />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="minimize"
                            initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                            transition={TRANSITION}
                          >
                            <Maximize2 />
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
              className={`${
                hasFiles
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
                  <Mic />
                </Button>
              </Tooltip>
            </motion.div>

            <motion.div
              layout="position"
              transition={TRANSITION}
              className={`${
                hasFiles
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
                content={isLoading ? "停止" : hasInput ? "送信" : "会話"}
                shortcut={
                  isLoading
                    ? undefined
                    : {
                        mac: ["⌘", "Shift", "Option", "S"],
                        windows: ["Ctrl", "Shift", "Alt", "S"],
                      }
                }
              >
                <Button
                  isDisabled={!isLoading && !archiveReady}
                  type={isLoading ? "button" : "submit"}
                  onPress={isLoading ? handleStop : undefined}
                  aria-label={
                    isLoading ? "Stop" : hasInput ? "Send" : "Converse"
                  }
                  shape="circle"
                  color={isLoading ? "caution" : "primary"}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {isLoading ? (
                      <motion.div
                        key="stop"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={TRANSITION}
                      >
                        <Square className="text-back-1_" fill="currentColor" />
                      </motion.div>
                    ) : hasInput ? (
                      <motion.div
                        key="send"
                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                        transition={TRANSITION}
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
