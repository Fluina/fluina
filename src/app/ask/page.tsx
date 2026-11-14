"use client";
import { createMathPlugin } from "@streamdown/math";
import {
  ArrowUp,
  AudioLines,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Delete,
  Download,
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
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useDragControls,
} from "motion/react";
import Image from "next/image";
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactNode,
  SyntheticEvent,
} from "react";
import {
  Children,
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { flushSync } from "react-dom";
import type { BundledLanguage, ThemedToken } from "shiki";
import { Streamdown } from "streamdown";
import { usePreferences } from "@/app/preferences";
import Frame_Fluina_small_dark from "@/assets/images/frames/svg/Frame_Fluina_small_dark.svg";
import Frame_Fluina_small_light from "@/assets/images/frames/svg/Frame_Fluina_small_light.svg";
import {
  MorphingDialog,
  MorphingDialogContent,
  MorphingDialogFrame,
} from "@/components/motion-primitives/morphing-dialog";
import { Button, Menu, ScrollArea, Tooltip } from "@/components/parts";
import { getButtonScales } from "@/components/parts/button";
import {
  type ArchivedAttachment,
  type ArchivedMessage,
  appendChatMessage,
  type ChatArchivePage,
  type ChatArchiveRecord,
  getChatArchiveSummary,
  getChatPurgeEpoch,
  getOldestChatSequence,
  loadLatestChatPage,
  loadLatestChatTurns,
  loadMessagesToSummarize,
  loadOlderChatTurns,
  loadStoredClockOffset,
  purgeExpiredChatTurns,
  requestPersistentChatStorage,
  saveChatArchiveSummary,
  serverNow,
  syncServerClock,
} from "@/lib/chat-archive";
import { saveCodeFile } from "@/lib/code-file";
import { getDragOpacity, THEME, TRANSITION } from "@/lib/motion";
import { useIsMobile, useOS } from "@/lib/os";
import { getScrollFadeSize, useNativeScroll } from "@/lib/scrollbar";

const PLACEHOLDERS = [
  "Fluinaに訊いてみて！",
  "/ を入力してコマンドを発動！",
  "# を入力してタグを追記！",
  "リンクを挿入！",
  "コピペで註記！",
  "ドラッグ＆ドロップでファイルを添付！",
  "今日も、おつかれ様。",
];

const CODE_DISMISS_DISTANCE = 100;
const CODE_DISMISS_VELOCITY = 500;

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
const INTERRUPTED_NOTICE_TEXT =
  "ページが再読み込みされたため、返答が中断されました。";

const CHAT_PAGE_TURN_LIMIT = 10;
const getApiUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const ARCHIVE_CHANNEL_NAME = "fluina-chat-archive";
const CHAT_PAGE_MESSAGE_LIMIT = CHAT_PAGE_TURN_LIMIT * 2;
const SUMMARY_BATCH_LIMIT = 20;
const CHAT_MESSAGE_MAX_LENGTH = 4000;
const EMPTY_ASSISTANT_MESSAGE =
  "この返答は空で保存されています。元の質問から再試行してください。";
type ChatScrollBehavior = "instant" | "smooth";
const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

const getChatScrollTarget = (
  viewport: HTMLElement,
  followContentBottom = false,
) => {
  const maxScrollTop = Math.max(
    viewport.scrollHeight - viewport.clientHeight,
    0,
  );
  if (followContentBottom) return maxScrollTop;
  const lastTurn = viewport.querySelector<HTMLElement>("[data-chat-last-turn]");
  if (!lastTurn) return maxScrollTop;

  const turnRect = lastTurn.getBoundingClientRect();
  const turnTop =
    turnRect.top - viewport.getBoundingClientRect().top + viewport.scrollTop;
  return Math.min(maxScrollTop, Math.max(Math.round(turnTop), 0));
};

const MessageNoticeBox = ({ notice }: { notice: MessageNotice }) => (
  <p
    role={notice.kind === "error" ? "alert" : "status"}
    className={`select-text text-sm p-2 border border-dashed rounded-lg ${
      notice.kind === "error"
        ? "text-red border-red"
        : "text-yellow border-yellow"
    }`}
  >
    {notice.text}
  </p>
);
const markdownPlugins = { math: mathPlugin };

const FILE_TILE_CLASS =
  "size-30 relative flex-none overflow-clip flex justify-start items-center bg-back-2 border border-back-5 rounded-2xl";

const FilePreview = ({
  name,
  type,
  url,
}: {
  name: string;
  type: string;
  url: string | null | undefined;
}) => {
  const lastDotIndex = name.lastIndexOf(".");
  const isExtensionOnly = name.startsWith(".") && lastDotIndex === 0;
  const hasExtension = lastDotIndex > 0;
  const baseName = isExtensionOnly
    ? ""
    : hasExtension
      ? name.slice(0, lastDotIndex)
      : name;
  const badge = isExtensionOnly
    ? name.slice(1).toUpperCase()
    : hasExtension
      ? name.slice(lastDotIndex + 1).toUpperCase()
      : "";

  if (url) {
    return (
      <div className="relative size-full">
        {type.startsWith("video/") ? (
          <video
            src={url}
            className="size-full object-cover"
            preload="metadata"
          >
            <track kind="captions" />
          </video>
        ) : (
          <Image
            src={url}
            alt={name}
            fill
            unoptimized
            className="size-full object-cover"
          />
        )}

        {badge && (
          <div className="absolute left-1 right-1 bottom-1">
            <span className="block text-xs text-center font-light truncate w-full p-1 border border-back-5 bg-back-3 rounded-2xl">
              {badge}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-1 size-full flex flex-col justify-between">
      <span className="line-clamp-3 p-1 break-all text-ellipsis text-sm text-left">
        {baseName || name}
      </span>

      {badge && (
        <span className="text-xs text-center font-light truncate w-full p-1 border border-back-5 bg-back-3 rounded-2xl">
          {badge}
        </span>
      )}
    </div>
  );
};

const MessageAttachments = ({
  attachments,
}: {
  attachments: NonNullable<Message["attachments"]>;
}) => {
  const urls = useMemo(
    () =>
      attachments.map(({ blob, type }) =>
        type.startsWith("image/") || type.startsWith("video/")
          ? URL.createObjectURL(blob)
          : null,
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

  const { elementRef } = useNativeScroll<HTMLDivElement>({ axis: "x" });

  return (
    <div
      ref={elementRef}
      className="flex flex-nowrap justify-start items-center gap-2 p-2 min-w-0 max-w-full"
    >
      {attachments.map(({ id, name, type }, index) => (
        <div key={id} title={name} className={FILE_TILE_CLASS}>
          <FilePreview name={name} type={type} url={urls[index]} />
        </div>
      ))}
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

const hasMathNode = (node: ReactNode, depth = 0): boolean => {
  if (Array.isArray(node)) return node.some((n) => hasMathNode(n, depth));
  if (!isValidElement<{ className?: unknown; children?: ReactNode }>(node)) {
    return false;
  }
  const { className, children } = node.props;
  const classes = Array.isArray(className) ? className.join(" ") : className;
  if (typeof classes === "string" && classes.includes("katex")) return true;
  return depth < 2 && hasMathNode(children, depth + 1);
};

const MarkdownParagraph = ({
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"p"> & { node?: unknown }) =>
  hasMathNode(children) ? (
    <ScrollArea virtual={false} className="max-w-full" scroll={{ axis: "x" }}>
      <p {...props}>{children}</p>
    </ScrollArea>
  ) : (
    <p {...props}>{children}</p>
  );

const stickyHeadersByHost = new WeakMap<HTMLElement, Set<HTMLElement>>();
const findVerticalScrollHost = (element: HTMLElement) => {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
};
const setStickyHeaderActive = (
  host: HTMLElement,
  header: HTMLElement,
  isActive: boolean,
) => {
  header.toggleAttribute("data-sticky-active", isActive);
  const activeHeaders = stickyHeadersByHost.get(host) ?? new Set<HTMLElement>();
  const wasActive = activeHeaders.has(header);
  if (isActive) activeHeaders.add(header);
  else activeHeaders.delete(header);

  if (activeHeaders.size > 0) {
    stickyHeadersByHost.set(host, activeHeaders);
    host.setAttribute("data-sticky-header-active", "");
  } else {
    stickyHeadersByHost.delete(host);
    host.removeAttribute("data-sticky-header-active");
  }

  if (wasActive !== isActive) {
    host.dispatchEvent(new Event("scrollfadeupdate"));
  }
};

const MarkdownTable = ({
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"table"> & { node?: unknown }) => {
  const { parallaxEnabled } = usePreferences();
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const stickyTableRef = useRef<HTMLTableElement>(null);
  const { elementRef } = useNativeScroll<HTMLElement>({
    axis: "x",
    scrollBehavior: parallaxEnabled ? "smooth" : "auto",
  });
  const tableHead = Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === "thead",
  );
  useLayoutEffect(() => {
    const section = elementRef.current;
    const stickyHeader = stickyHeaderRef.current;
    const stickyTable = stickyTableRef.current;
    const frame = stickyHeader?.parentElement;
    if (!section || !stickyHeader || !stickyTable || !frame) return;
    const host = findVerticalScrollHost(section);
    if (!host) return;

    let updateFrame = 0;
    const observed = new Set<Element>();
    const update = () => {
      const sourceTable = section.querySelector<HTMLTableElement>("table");
      const sourceHead =
        sourceTable?.querySelector<HTMLTableSectionElement>("thead");
      if (!sourceTable || !sourceHead) {
        stickyHeader.style.height = "0px";
        section.style.marginTop = "";
      } else {
        if (!observed.has(sourceTable)) {
          resizeObserver.observe(sourceTable);
          observed.add(sourceTable);
        }
        if (!observed.has(sourceHead)) {
          resizeObserver.observe(sourceHead);
          observed.add(sourceHead);
        }

        const headerHeight = sourceHead.getBoundingClientRect().height;
        const tableWidth = sourceTable.getBoundingClientRect().width;
        stickyHeader.style.height = `${headerHeight}px`;
        section.style.marginTop = `${-headerHeight}px`;
        stickyTable.style.width = `${tableWidth}px`;

        const sourceCells = sourceHead.querySelectorAll<HTMLElement>("th, td");
        const stickyCells = stickyTable.querySelectorAll<HTMLElement>("th, td");
        if (sourceCells.length === stickyCells.length) {
          sourceCells.forEach((cell, index) => {
            stickyCells[index].style.width =
              `${cell.getBoundingClientRect().width}px`;
          });
        }
        for (const element of stickyHeader.querySelectorAll("[id]")) {
          element.removeAttribute("id");
        }
      }

      stickyTable.style.transform = section.scrollLeft
        ? `translateX(${-section.scrollLeft}px)`
        : "";
      const viewportTop = host.getBoundingClientRect().top + host.clientTop;
      const frameBounds = frame.getBoundingClientRect();
      const headerBounds = stickyHeader.getBoundingClientRect();
      const isPinned =
        frameBounds.top < viewportTop &&
        frameBounds.bottom > viewportTop + headerBounds.height;
      frame.style.borderTopLeftRadius = isPinned ? "0px" : "";
      frame.style.borderTopRightRadius = isPinned ? "0px" : "";
      stickyHeader.style.borderTopLeftRadius = isPinned ? "0px" : "";
      stickyHeader.style.borderTopRightRadius = isPinned ? "0px" : "";
      setStickyHeaderActive(host, stickyHeader, isPinned);
    };
    const scheduleUpdate = () => {
      if (updateFrame) return;
      updateFrame = requestAnimationFrame(() => {
        updateFrame = 0;
        update();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(section, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const visualViewport = window.visualViewport;
    section.addEventListener("scroll", scheduleUpdate, { passive: true });
    host.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);
    update();

    return () => {
      section.removeEventListener("scroll", scheduleUpdate);
      host.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      cancelAnimationFrame(updateFrame);
      frame.style.borderTopLeftRadius = "";
      frame.style.borderTopRightRadius = "";
      stickyHeader.style.borderTopLeftRadius = "";
      stickyHeader.style.borderTopRightRadius = "";
      setStickyHeaderActive(host, stickyHeader, false);
    };
  }, [elementRef]);

  return (
    <div
      data-table-frame=""
      className="relative mx-0.5 rounded-2xl border border-back-5 has-[>section:focus-visible]:ring-2 has-[>section:focus-visible]:ring-fore-1 all"
    >
      {tableHead && (
        <div
          ref={stickyHeaderRef}
          aria-hidden="true"
          data-sticky-table-header=""
          className="sticky top-0 z-20 overflow-clip rounded-t-[inherit] bg-back-2 [&_table]:my-0 [&_thead]:relative [&_thead]:z-10 [&_thead]:bg-back-2 [&_thead_th]:bg-back-2 [&_thead_th]:py-2 [&_th]:px-4 [&_th]:align-middle [&_th]:whitespace-nowrap [&_td]:px-4 [&_td]:align-middle [&_td]:whitespace-nowrap"
        >
          <table
            ref={stickyTableRef}
            className={props.className}
            style={props.style}
          >
            {tableHead}
          </table>
        </div>
      )}
      <section
        ref={elementRef}
        aria-label="表"
        className="w-full rounded-[inherit] outline-none [&_table]:my-0 [&_thead]:relative [&_thead]:z-10 [&_thead]:bg-back-2 [&_thead_th]:bg-back-2 [&_thead_th]:py-2 [&_th]:px-4 [&_th]:align-middle [&_th]:whitespace-nowrap [&_td]:px-4 [&_td]:align-middle [&_td]:whitespace-nowrap"
      >
        <table {...props}>{children}</table>
      </section>
    </div>
  );
};

const MarkdownLink = ({
  node: _node,
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & { node?: unknown }) => {
  const { parallaxEnabled } = usePreferences();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [keyboardPressed, setKeyboardPressed] = useState(false);
  const isFragment = href?.startsWith("#");
  const incomplete = href === "streamdown:incomplete-link";

  useLayoutEffect(() => {
    const link = linkRef.current;
    if (!link) return;
    const updateScales = () => {
      const size = Math.max(link.offsetWidth, link.offsetHeight);
      if (!size) return;
      const scales = getButtonScales(size);
      link.style.setProperty("--button-hover-scale", String(scales.hoverScale));
      link.style.setProperty("--button-press-scale", String(scales.pressScale));
      link.style.setProperty(
        "--button-content-press-scale",
        String(scales.contentPressScale),
      );
    };
    const observer = new ResizeObserver(updateScales);
    observer.observe(link);
    updateScales();
    return () => observer.disconnect();
  }, []);

  return (
    <a
      {...props}
      ref={linkRef}
      className={`${props.className ?? ""} inline-block max-w-full wrap-anywhere leading-normal mx-2 my-1 outline-none all hover:scale-(--button-hover-scale) active:scale-(--button-press-scale) active:[&>*:not(:first-child)]:scale-(--button-content-press-scale) focus-visible:scale-(--button-hover-scale) focus-visible:ring-2 focus-visible:ring-fore-1 data-keyboard-pressed:scale-(--button-press-scale) data-keyboard-pressed:[&>*:not(:first-child)]:scale-(--button-content-press-scale)`}
      href={incomplete ? undefined : href}
      target={isFragment ? "_self" : props.target}
      data-keyboard-pressed={keyboardPressed ? "" : undefined}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.key === "Enter" && !event.defaultPrevented && !incomplete) {
          setKeyboardPressed(true);
        }
      }}
      onKeyUp={(event) => {
        props.onKeyUp?.(event);
        if (event.key === "Enter") setKeyboardPressed(false);
      }}
      onBlur={(event) => {
        props.onBlur?.(event);
        setKeyboardPressed(false);
      }}
      onClick={(event) => {
        if (!href || !isFragment) return;
        const anchor = event.currentTarget;
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          (anchor.hasAttribute("data-footnote-ref") ||
            anchor.hasAttribute("data-footnote-backref"))
        ) {
          const id = href.slice(1);
          const target = Array.from(
            anchor.closest(".prose")?.querySelectorAll<HTMLElement>("[id]") ??
              [],
          ).find((element) => element.id === id);
          if (target) {
            event.preventDefault();
            if (
              document.getElementById(id) === target &&
              location.hash !== href
            ) {
              const oldURL = location.href;
              history.pushState(null, "", href);
              window.dispatchEvent(
                new HashChangeEvent("hashchange", {
                  oldURL,
                  newURL: location.href,
                }),
              );
            }
            target.tabIndex = -1;
            target.focus({ preventScroll: true });
            target.scrollIntoView({
              block: "nearest",
              behavior: parallaxEnabled ? "smooth" : "instant",
            });
          }
        }
      }}
    >
      {children}
    </a>
  );
};

const markdownText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(markdownText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return markdownText(node.props.children);
  }
  return "";
};

const isEditableBlock = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && ["DIV", "P"].includes(node.tagName);

const getEditableInlineText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLBRElement) return "\n";
  if (isEditableBlock(node)) return getEditableBlockText(node);
  return Array.from(node.childNodes, getEditableInlineText).join("");
};

const getEditableBlockText = (block: HTMLElement): string => {
  if (
    block.childNodes.length === 1 &&
    block.firstChild instanceof HTMLBRElement
  ) {
    return "";
  }

  const parts: string[] = [];
  let inlineText = "";
  for (const child of block.childNodes) {
    if (isEditableBlock(child)) {
      if (inlineText) parts.push(inlineText);
      parts.push(getEditableBlockText(child));
      inlineText = "";
    } else {
      inlineText += getEditableInlineText(child);
    }
  }
  if (inlineText) parts.push(inlineText);
  return parts.join("\n").replace(/\n$/, "");
};

const getEditableText = (element: HTMLElement) => {
  const lines: string[] = [];
  let inlineText = "";
  const flushInlineText = () => {
    if (!inlineText) return;
    lines.push(...inlineText.split("\n"));
    inlineText = "";
  };

  for (const child of element.childNodes) {
    if (isEditableBlock(child)) {
      flushInlineText();
      lines.push(getEditableBlockText(child));
    } else {
      inlineText += getEditableInlineText(child);
    }
  }
  flushInlineText();
  return lines.join("\n");
};

const getCodeBlockKey = (language: string, code: string) =>
  JSON.stringify([language, code]);

const getCompletedCodeBlocks = (markdown: string) => {
  const completed = new Set<string>();
  const lines = markdown.split("\n");
  let fence: { character: string; length: number; language: string } | null =
    null;
  let codeLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!fence) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (!opening) continue;
      const info = opening[2].trim();
      fence = {
        character: opening[1][0],
        length: opening[1].length,
        language: info.split(/\s+/, 1)[0] ?? "",
      };
      codeLines = [];
      continue;
    }

    const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
    if (
      closing &&
      closing[1][0] === fence.character &&
      closing[1].length >= fence.length
    ) {
      const code = codeLines.length > 0 ? `${codeLines.join("\n")}\n` : "";
      if (fence.language) {
        completed.add(getCodeBlockKey(fence.language, code));
      }
      fence = null;
      codeLines = [];
      continue;
    }

    codeLines.push(line);
  }

  return completed;
};

const isBundledLanguage = (
  language: string,
  languages: Record<BundledLanguage, unknown>,
): language is BundledLanguage => Object.hasOwn(languages, language);

const getLanguageTitle = (language?: string) => {
  if (!language) return "Text";
  const normalized = language.toLowerCase();
  const formalNames: Record<string, string> = {
    c: "C",
    "c#": "C#",
    "c++": "C++",
    cs: "C#",
    cpp: "C++",
    csharp: "C#",
    css: "CSS",
    cxx: "C++",
    fsharp: "F#",
    html: "HTML",
    javascript: "JavaScript",
    js: "JavaScript",
    json: "JSON",
    md: "Markdown",
    markdown: "Markdown",
    objectivec: "Objective-C",
    ocaml: "OCaml",
    php: "PHP",
    ps1: "PowerShell",
    plaintext: "Text",
    powershell: "PowerShell",
    py: "Python",
    bash: "Bash",
    sql: "SQL",
    text: "Text",
    ts: "TypeScript",
    typescript: "TypeScript",
    xml: "XML",
    yml: "YAML",
    yaml: "YAML",
  };
  return (
    formalNames[normalized] ??
    `${language.charAt(0).toUpperCase()}${language.slice(1)}`
  );
};

type CodeLineControl = "number" | "fold" | "expand";
const EMPTY_COLLAPSED_LINES: ReadonlySet<number> = new Set();

const MarkdownCode = ({
  node: _node,
  children,
  className,
  lineNumbers = false,
  codeBlockId,
  ...props
}: ComponentPropsWithoutRef<"code"> & {
  node?: unknown;
  lineNumbers?: boolean;
  codeBlockId?: string;
}) => {
  const dialog = useContext(CodeDialogContext);
  const { parallaxEnabled } = usePreferences();
  const isAnimating = dialog?.isAnimating ?? false;
  const language = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
  const code = markdownText(children);
  const isComplete =
    !!language &&
    (dialog?.completedCodeBlocks.has(getCodeBlockKey(language, code)) ?? false);
  const canHighlight = !isAnimating || isComplete;
  const [highlighted, setHighlighted] = useState<{
    code: string;
    language: string;
    tokens: ThemedToken[][];
  } | null>(null);

  useEffect(() => {
    if (!language || !canHighlight) return;
    let active = true;
    const highlight = async () => {
      const shiki = await import("shiki");
      if (!isBundledLanguage(language, shiki.bundledLanguages)) return;
      const { tokens } = await shiki.codeToTokens(code, {
        lang: language,
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: false,
      });
      if (active) setHighlighted({ code, language, tokens });
    };
    highlight().catch((error: unknown) => {
      console.error("コードの構文ハイライトに失敗しました。", error);
    });
    return () => {
      active = false;
    };
  }, [canHighlight, code, language]);

  const visible =
    canHighlight &&
    highlighted &&
    highlighted.language === language &&
    code.startsWith(highlighted.code)
      ? highlighted
      : null;
  let lineOffset = 0;
  const lines = visible?.tokens.map((tokens) => {
    const offset = lineOffset;
    lineOffset +=
      tokens.reduce((length, token) => length + token.content.length, 0) + 1;
    return { offset, tokens };
  });
  const codeLines = code.split("\n");
  const lineNumberStyle:
    | (CSSProperties & { "--code-line-number-width": string })
    | undefined = lineNumbers
    ? { "--code-line-number-width": `${String(codeLines.length).length}ch` }
    : undefined;
  const [localCollapsedLines, setLocalCollapsedLines] = useState<Set<number>>(
    () => new Set(),
  );
  const collapsedLines =
    codeBlockId && dialog
      ? (dialog.collapsedCodeBlocks.get(codeBlockId) ?? EMPTY_COLLAPSED_LINES)
      : localCollapsedLines;
  const setCollapsedLines: React.Dispatch<React.SetStateAction<Set<number>>> = (
    update,
  ) => {
    if (!codeBlockId || !dialog) {
      setLocalCollapsedLines(update);
      return;
    }
    dialog.setCollapsedCodeBlocks((current) => {
      const currentLines = new Set(current.get(codeBlockId) ?? []);
      const nextLines =
        typeof update === "function" ? update(currentLines) : update;
      const next = new Map(current);
      if (nextLines.size === 0) next.delete(codeBlockId);
      else next.set(codeBlockId, nextLines);
      return next;
    });
  };
  const [codeControlTabStop, setCodeControlTabStop] = useState<{
    lineIndex: number;
    control: CodeLineControl;
  }>({ lineIndex: 0, control: "number" });
  const selectionAnchor = useRef<number | null>(null);
  const selectionEnd = useRef<number | null>(null);
  const selectionWasDragged = useRef(false);
  const codeRef = useRef<HTMLElement>(null);
  const lineIndents = codeLines.map(
    (line) => line.match(/^[\t ]*/)?.[0].replace(/\t/g, "    ").length ?? 0,
  );
  const foldEndByLine = new Map<number, number>();
  for (let lineIndex = 0; lineIndex < codeLines.length - 1; lineIndex += 1) {
    if (codeLines[lineIndex].trim().length === 0) continue;
    let firstChild = lineIndex + 1;
    while (
      firstChild < codeLines.length &&
      codeLines[firstChild].trim().length === 0
    ) {
      firstChild += 1;
    }
    if (
      firstChild >= codeLines.length ||
      lineIndents[firstChild] <= lineIndents[lineIndex]
    ) {
      continue;
    }
    let end = firstChild;
    while (
      end + 1 < codeLines.length &&
      (codeLines[end + 1].trim().length === 0 ||
        lineIndents[end + 1] > lineIndents[lineIndex])
    ) {
      end += 1;
    }
    foldEndByLine.set(lineIndex, end);
  }
  const visibleLineIndices: number[] = [];
  for (let lineIndex = 0; lineIndex < codeLines.length; ) {
    visibleLineIndices.push(lineIndex);
    const foldEnd = foldEndByLine.get(lineIndex);
    lineIndex =
      foldEnd !== undefined && collapsedLines.has(lineIndex)
        ? foldEnd + 1
        : lineIndex + 1;
  }
  const getCodeLineControls = (lineIndex: number): CodeLineControl[] => [
    "number",
    ...(foldEndByLine.has(lineIndex) ? ["fold" as const] : []),
    ...(collapsedLines.has(lineIndex) ? ["expand" as const] : []),
  ];
  const validTabStop =
    visibleLineIndices.includes(codeControlTabStop.lineIndex) &&
    getCodeLineControls(codeControlTabStop.lineIndex).includes(
      codeControlTabStop.control,
    )
      ? codeControlTabStop
      : { lineIndex: visibleLineIndices[0] ?? 0, control: "number" as const };
  const focusCodeControl = (lineIndex: number, control: CodeLineControl) => {
    codeRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-line-index="${lineIndex}"] [data-code-line-control="${control}"]`,
      )
      ?.focus();
  };
  const scrollCodeLineIntoView = (lineIndex: number) => {
    const row = codeRef.current?.querySelector<HTMLElement>(
      `[data-line-index="${lineIndex}"]`,
    );
    if (!row) return;
    const rowBounds = row.getBoundingClientRect();
    let parent = row.parentElement;
    while (parent && parent !== document.body) {
      const overflowY = getComputedStyle(parent).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        parent.scrollHeight > parent.clientHeight
      ) {
        const viewportBounds = parent.getBoundingClientRect();
        const viewportTop = viewportBounds.top + parent.clientTop;
        const viewportBottom = viewportTop + parent.clientHeight;
        const scrollDelta =
          rowBounds.top < viewportTop
            ? rowBounds.top - viewportTop
            : rowBounds.bottom > viewportBottom
              ? rowBounds.bottom - viewportBottom
              : 0;
        if (scrollDelta !== 0) {
          parent.scrollTo({
            top: parent.scrollTop + scrollDelta,
            behavior: parallaxEnabled ? "smooth" : "instant",
          });
        }
        return;
      }
      parent = parent.parentElement;
    }
  };
  const navigateCodeControls = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    lineIndex: number,
    control: CodeLineControl,
  ) => {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical) return;
    event.preventDefault();

    let targetLine = lineIndex;
    let targetControl: CodeLineControl | undefined;
    if (horizontal) {
      const controls = getCodeLineControls(lineIndex);
      const controlIndex = controls.indexOf(control);
      targetControl =
        controls[controlIndex + (event.key === "ArrowRight" ? 1 : -1)];
    } else {
      const rowIndex = visibleLineIndices.indexOf(lineIndex);
      const nextRowIndex = rowIndex + (event.key === "ArrowDown" ? 1 : -1);
      targetLine = visibleLineIndices[nextRowIndex] ?? lineIndex;
      const controls = getCodeLineControls(targetLine);
      targetControl = controls.includes(control) ? control : "number";
    }

    if (targetControl) focusCodeControl(targetLine, targetControl);
  };
  const selectLines = (startLine: number, endLine: number) => {
    const codeElement = codeRef.current;
    if (!codeElement) return;
    const rows = Array.from(
      codeElement.querySelectorAll<HTMLElement>(".code-line"),
    );
    const startRow = rows.find(
      (row) => Number(row.dataset.lineIndex) === startLine,
    );
    const endRow = rows.find(
      (row) => Number(row.dataset.lineIndex) === endLine,
    );
    const startContent = startRow?.querySelector(".code-line-content");
    const endContent = endRow?.querySelector(".code-line-content");
    if (!startContent || !endContent) return;
    const range = document.createRange();
    range.selectNodeContents(startContent);
    range.setEnd(endContent, endContent.childNodes.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const startSelection = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const lineNumber =
      event.target.closest<HTMLButtonElement>(".code-line-number");
    const line = lineNumber?.closest<HTMLElement>(".code-line");
    const lineIndex = Number(line?.dataset.lineIndex);
    if (!lineNumber || !Number.isInteger(lineIndex)) return;
    event.preventDefault();
    selectionAnchor.current = lineIndex;
    selectionEnd.current = lineIndex;
    selectionWasDragged.current = false;
    selectLines(lineIndex, lineIndex);
    lineNumber.setPointerCapture(event.pointerId);
  };
  const extendSelection = (event: React.PointerEvent<HTMLElement>) => {
    const anchor = selectionAnchor.current;
    if (anchor === null) return;
    const targetLine = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(".code-line");
    const line = Number(targetLine?.dataset.lineIndex);
    if (Number.isInteger(line) && targetLine) {
      if (line !== anchor) selectionWasDragged.current = true;
      selectionEnd.current = line;
      selectLines(Math.min(anchor, line), Math.max(anchor, line));
    }
  };
  const endSelection = () => {
    const anchor = selectionAnchor.current;
    const end = selectionEnd.current;
    if (anchor !== null && end !== null) {
      requestAnimationFrame(() =>
        selectLines(Math.min(anchor, end), Math.max(anchor, end)),
      );
    }
    selectionAnchor.current = null;
    selectionEnd.current = null;
  };

  return (
    <code
      {...props}
      ref={codeRef}
      className={className}
      data-code-line-numbers={lineNumbers ? "" : undefined}
      style={lineNumberStyle}
      onPointerDownCapture={startSelection}
      onPointerMove={extendSelection}
      onPointerUp={endSelection}
      onPointerCancel={endSelection}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setCodeControlTabStop({
            lineIndex: visibleLineIndices[0] ?? 0,
            control: "number",
          });
        }
      }}
    >
      {lineNumbers ? (
        <AnimatePresence initial={false}>
          {visibleLineIndices.map((lineIndex, visibleIndex) => {
            const line = codeLines[lineIndex];
            const tokens = lines?.[lineIndex]?.tokens;
            const tokenLength =
              tokens?.reduce(
                (length, token) => length + token.content.length,
                0,
              ) ?? 0;
            const foldEnd = foldEndByLine.get(lineIndex);
            const isCollapsed =
              foldEnd !== undefined && collapsedLines.has(lineIndex);
            const previousLine = visibleLineIndices[visibleIndex - 1];
            const nextLine = visibleLineIndices[visibleIndex + 1];
            const joinsPrevious =
              previousLine !== undefined &&
              foldEndByLine.has(previousLine) &&
              collapsedLines.has(previousLine);
            const joinsNext =
              nextLine !== undefined &&
              foldEndByLine.has(nextLine) &&
              collapsedLines.has(nextLine);
            const collapsedBackgroundRadius =
              joinsPrevious && joinsNext
                ? {
                    className: "rounded-t-none rounded-b-none",
                    value: "0rem 0rem 0rem 0rem",
                  }
                : joinsPrevious
                  ? {
                      className: "rounded-t-none rounded-b-2xl",
                      value: "0rem 0rem 1rem 1rem",
                    }
                  : joinsNext
                    ? {
                        className: "rounded-t-2xl rounded-b-none",
                        value: "1rem 1rem 0rem 0rem",
                      }
                    : {
                        className: "rounded-4xl",
                        value: "2rem 2rem 2rem 2rem",
                      };
            return (
              <motion.span
                key={lineIndex}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={TRANSITION}
                className="code-line isolate rounded-4xl"
                style={{
                  minHeight: 0,
                  paddingLeft: "calc(var(--code-line-number-width) + 3.5ch)",
                }}
                data-line-index={lineIndex}
                data-line-number={lineIndex + 1}
              >
                <AnimatePresence initial={false}>
                  {isCollapsed && (
                    <motion.span
                      key="collapsed-background"
                      aria-hidden="true"
                      data-code-line-background=""
                      initial={{
                        opacity: 0,
                        borderRadius: "2rem 2rem 2rem 2rem",
                      }}
                      animate={{
                        opacity: 1,
                        borderRadius: collapsedBackgroundRadius.value,
                      }}
                      exit={{
                        opacity: 0,
                        borderRadius: "2rem 2rem 2rem 2rem",
                      }}
                      transition={TRANSITION}
                      className={`pointer-events-none absolute -right-1 top-0 bottom-0 z-0 ${collapsedBackgroundRadius.className} bg-blue/50`}
                      style={{
                        left: "calc(-0.25rem - var(--code-line-number-width) + 1ch)",
                      }}
                    />
                  )}
                </AnimatePresence>
                <Button
                  ripple={false}
                  className="code-line-number absolute left-0 z-10 h-lh text-fore-5 [font-variant-numeric:tabular-nums] select-none! hover:text-fore-1"
                  style={{
                    width: "var(--code-line-number-width)",
                    justifyContent: "flex-end",
                  }}
                  shape="circle"
                  data-code-line-control="number"
                  excludeFromTabOrder={
                    validTabStop.lineIndex !== lineIndex ||
                    validTabStop.control !== "number"
                  }
                  aria-label={`行 ${lineIndex + 1} を選択`}
                  onFocus={() => {
                    setCodeControlTabStop({ lineIndex, control: "number" });
                    scrollCodeLineIntoView(lineIndex);
                  }}
                  onKeyDown={(event) =>
                    navigateCodeControls(event, lineIndex, "number")
                  }
                  onPress={(event) => {
                    if (
                      event.pointerType === "keyboard" ||
                      event.pointerType === "virtual" ||
                      !selectionWasDragged.current
                    ) {
                      requestAnimationFrame(() =>
                        selectLines(lineIndex, lineIndex),
                      );
                    }
                    selectionWasDragged.current = false;
                  }}
                >
                  {lineIndex + 1}
                </Button>
                {foldEnd !== undefined && (
                  <Button
                    className="code-line-fold absolute z-10 inline-flex h-lh w-5 text-fore-5 hover:text-fore-1"
                    style={{
                      left: "calc(var(--code-line-number-width) + 0.5ch)",
                    }}
                    shape="circle"
                    data-code-line-control="fold"
                    excludeFromTabOrder={
                      validTabStop.lineIndex !== lineIndex ||
                      validTabStop.control !== "fold"
                    }
                    aria-label={
                      isCollapsed
                        ? `行 ${lineIndex + 1} の入れ子を展開`
                        : `行 ${lineIndex + 1} の入れ子を折りたたむ`
                    }
                    aria-expanded={!isCollapsed}
                    onFocus={() => {
                      setCodeControlTabStop({ lineIndex, control: "fold" });
                      scrollCodeLineIntoView(lineIndex);
                    }}
                    onKeyDown={(event) =>
                      navigateCodeControls(event, lineIndex, "fold")
                    }
                    onPress={() =>
                      setCollapsedLines((current) => {
                        const next = new Set(current);
                        if (next.has(lineIndex)) next.delete(lineIndex);
                        else next.add(lineIndex);
                        return next;
                      })
                    }
                  >
                    <motion.span
                      animate={{ rotate: isCollapsed ? -90 : 0 }}
                      transition={TRANSITION}
                      className="inline-flex"
                    >
                      <ChevronDown size={16} />
                    </motion.span>
                  </Button>
                )}
                <span className="code-line-content relative z-10 select-text">
                  {tokens?.map((token) => (
                    <span
                      key={token.offset}
                      className="syntax-token"
                      style={token.htmlStyle}
                    >
                      {token.content}
                    </span>
                  ))}
                  {line.slice(tokenLength)}
                  {visibleIndex < visibleLineIndices.length - 1 && (
                    <span className="code-line-break">{"\n"}</span>
                  )}
                  {visibleIndex === visibleLineIndices.length - 1 &&
                    line.length === 0 && (
                      <span aria-hidden="true" className="code-line-break" />
                    )}
                </span>
                {isCollapsed && foldEnd !== undefined && (
                  <Button
                    ripple={false}
                    className="relative select-none! z-10 ml-[1ch] rounded-4xl text-fore-5 hover:text-fore-1"
                    aria-label={`${foldEnd - lineIndex}行を展開`}
                    data-code-line-control="expand"
                    excludeFromTabOrder={
                      validTabStop.lineIndex !== lineIndex ||
                      validTabStop.control !== "expand"
                    }
                    onFocus={() => {
                      setCodeControlTabStop({ lineIndex, control: "expand" });
                      scrollCodeLineIntoView(lineIndex);
                    }}
                    onKeyDown={(event) =>
                      navigateCodeControls(event, lineIndex, "expand")
                    }
                    onPress={() => {
                      setCollapsedLines((current) => {
                        const next = new Set(current);
                        next.delete(lineIndex);
                        return next;
                      });
                      requestAnimationFrame(() =>
                        focusCodeControl(lineIndex, "fold"),
                      );
                    }}
                  >
                    … {foldEnd - lineIndex}行
                  </Button>
                )}
              </motion.span>
            );
          })}
        </AnimatePresence>
      ) : visible ? (
        <>
          {lines?.map((line, lineIndex) => (
            <Fragment key={line.offset}>
              {lineIndex > 0 && "\n"}
              {line.tokens.map((token) => (
                <span
                  key={token.offset}
                  className="syntax-token"
                  style={token.htmlStyle}
                >
                  {token.content}
                </span>
              ))}
            </Fragment>
          ))}
          {code.slice(visible.code.length)}
        </>
      ) : (
        children
      )}
    </code>
  );
};

type ExpandedCode = {
  id: string;
  root: HTMLElement;
  index: number;
  code: string;
  language?: string;
  origin: {
    left: number;
    top: number;
    width: number;
    height: number;
    scrollLeft: number;
    scrollTop: number;
  };
};

const CodeDialogContext = createContext<{
  expanded: ExpandedCode | null;
  setExpanded: React.Dispatch<React.SetStateAction<ExpandedCode | null>>;
  collapsedCodeBlocks: ReadonlyMap<string, ReadonlySet<number>>;
  setCollapsedCodeBlocks: React.Dispatch<
    React.SetStateAction<Map<string, Set<number>>>
  >;
  completedCodeBlocks: ReadonlySet<string>;
  isAnimating: boolean;
  isClosing: boolean;
} | null>(null);

const CodeControls = ({
  code,
  language,
  fullscreen,
  toggle,
  dragHandle,
  dragControls,
  motionId,
}: {
  code: string;
  language?: string;
  fullscreen: boolean;
  toggle: () => void;
  dragHandle?: boolean;
  dragControls?: ReturnType<typeof useDragControls>;
  motionId?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isSticky, setIsSticky] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setError("");
      setCopied(true);
    } catch (copyError) {
      console.error("コードのコピーに失敗しました。", copyError);
      setError("コードをコピーできませんでした。");
    }
  };
  const save = async () => {
    try {
      await saveCodeFile(code, language);
      setError("");
    } catch (saveError) {
      console.error("コードの保存に失敗しました。", saveError);
      setError("コードを保存できませんでした。");
    }
  };

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (fullscreen) return;
    const header = headerRef.current;
    const frame = header?.closest<HTMLElement>("[data-code-frame]");
    const surface = frame?.firstElementChild;
    if (!header || !frame || !(surface instanceof HTMLElement)) return;

    let updateFrame = 0;
    let activeHost: HTMLElement | null = null;
    const update = () => {
      const host = findVerticalScrollHost(header);
      if (!host) return;
      if (activeHost && activeHost !== host) {
        setStickyHeaderActive(activeHost, header, false);
      }
      activeHost = host;

      const viewportTop = host.getBoundingClientRect().top + host.clientTop;
      const frameBounds = frame.getBoundingClientRect();
      const headerBounds = header.getBoundingClientRect();
      const isPinned =
        frameBounds.top < viewportTop &&
        frameBounds.bottom > viewportTop + headerBounds.height;
      surface.style.borderTopLeftRadius = isPinned ? "0px" : "";
      surface.style.borderTopRightRadius = isPinned ? "0px" : "";
      setIsSticky(isPinned);
      setStickyHeaderActive(host, header, isPinned);
    };
    const scheduleUpdate = () => {
      if (updateFrame) return;
      updateFrame = requestAnimationFrame(() => {
        updateFrame = 0;
        update();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(frame);
    resizeObserver.observe(header);
    const visualViewport = window.visualViewport;
    document.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);
    update();
    scheduleUpdate();

    return () => {
      document.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      cancelAnimationFrame(updateFrame);
      surface.style.borderTopLeftRadius = "";
      surface.style.borderTopRightRadius = "";
      if (activeHost) setStickyHeaderActive(activeHost, header, false);
    };
  }, [fullscreen]);

  return (
    <>
      <motion.div
        ref={headerRef}
        layout={Boolean(motionId)}
        layoutId={motionId ? `${motionId}-header` : undefined}
        data-code-header=""
        style={{
          borderTopLeftRadius: fullscreen || isSticky ? 0 : 16,
          borderTopRightRadius: fullscreen || isSticky ? 0 : 16,
        }}
        className={`flex items-center justify-between gap-2 border-b border-back-5 px-2 py-1 bg-back-2 ${fullscreen ? "" : "sticky top-0 z-20"} ${dragHandle ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={(event) => {
          if (!dragHandle) return;
          if (
            event.target instanceof Element &&
            event.target.closest("button")
          ) {
            event.stopPropagation();
            return;
          }
          dragControls?.start(event.nativeEvent);
        }}
      >
        <span className="truncate font-mono select-none! text-sm px-2">
          {getLanguageTitle(language)}
        </span>
        <motion.div
          layout="position"
          layoutId={motionId}
          className="flex shrink-0 items-center gap-1"
        >
          <Tooltip content={copied ? "完了" : "コピー"} placement="bottom">
            <Button
              aria-label="Copy code"
              shape="circle"
              className="size-7.5"
              onPress={() => void copy()}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    transition={TRANSITION}
                  >
                    <Check size={16} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    transition={TRANSITION}
                  >
                    <Copy size={16} />
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </Tooltip>
          <Tooltip content="保存" placement="bottom">
            <Button
              aria-label="Save code"
              shape="circle"
              className="size-7.5"
              onPress={() => void save()}
            >
              <Download size={16} />
            </Button>
          </Tooltip>
          <Tooltip content={fullscreen ? "縮小" : "拡大"} placement="bottom">
            <Button
              aria-label={fullscreen ? "Close expanded code" : "Expand code"}
              shape="circle"
              className="size-7.5"
              onPress={toggle}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {fullscreen ? (
                  <motion.span
                    key="minimize"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    transition={TRANSITION}
                  >
                    <Minimize2 size={16} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="maximize"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    transition={TRANSITION}
                  >
                    <Maximize2 size={16} />
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </Tooltip>
        </motion.div>
      </motion.div>
      {error && (
        <p role="alert" className="px-4 text-sm text-red">
          {error}
        </p>
      )}
    </>
  );
};

const MarkdownPre = ({
  node: _node,
  children,
  ...props
}: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) => {
  const { parallaxEnabled } = usePreferences();
  const dialog = useContext(CodeDialogContext);
  if (!dialog) throw new Error("Code dialog provider is missing");
  const layoutId = useId();
  const sharedLayoutEnabled =
    parallaxEnabled && !dialog.isClosing && !dialog.isAnimating;
  const frameRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(-1);
  const isExpanded =
    dialog.expanded?.root === frameRef.current?.closest(".prose") &&
    dialog.expanded?.index === index &&
    index >= 0;
  const { elementRef: codeScrollRef } = useNativeScroll<HTMLPreElement>(
    {
      axis: "x",
      scrollBehavior: parallaxEnabled ? "smooth" : "auto",
      enableEdgeFade: !isExpanded,
    },
    [isExpanded],
  );
  const [isHorizontallyScrollable, setIsHorizontallyScrollable] =
    useState(false);
  useLayoutEffect(() => {
    const pre = codeScrollRef.current;
    if (!pre) return;

    const updateOverflow = () => {
      setIsHorizontallyScrollable(pre.scrollWidth > pre.clientWidth + 1);
    };
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(pre);
    const mutationObserver = new MutationObserver(updateOverflow);
    mutationObserver.observe(pre, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    updateOverflow();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [codeScrollRef.current]);
  const codeElement = isValidElement<{
    className?: string;
    children?: ReactNode;
    lineNumbers?: boolean;
    codeBlockId?: string;
  }>(children)
    ? children
    : null;
  const language = codeElement?.props.className?.match(
    /(?:^|\s)language-([^\s]+)/,
  )?.[1];
  const code = markdownText(codeElement?.props.children ?? children);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const root = frame?.closest<HTMLElement>(".prose");
    if (!frame || !root) return;
    const currentIndex = Array.from(
      root.querySelectorAll("[data-code-frame]"),
    ).indexOf(frame);
    setIndex(currentIndex);
    if (
      dialog?.expanded?.root === root &&
      dialog.expanded.index === currentIndex
    ) {
      dialog.setExpanded((current) =>
        current && (current.code !== code || current.language !== language)
          ? { ...current, code, language }
          : current,
      );
    }
  }, [code, language, dialog]);

  useLayoutEffect(() => {
    if (isExpanded) return;
    const surface = frameRef.current?.firstElementChild;
    if (surface instanceof HTMLElement) {
      surface.style.removeProperty("opacity");
    }
  }, [isExpanded]);

  const open = () => {
    const frame = frameRef.current;
    const root = frame?.closest<HTMLElement>(".prose");
    if (!frame || !root) return;
    const currentIndex = Array.from(
      root.querySelectorAll("[data-code-frame]"),
    ).indexOf(frame);
    const bounds = frame.getBoundingClientRect();
    const sourceCode = frame.querySelector("pre");
    dialog.setExpanded({
      id: layoutId,
      root,
      index: currentIndex,
      code,
      language,
      origin: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        scrollLeft: sourceCode?.scrollLeft ?? 0,
        scrollTop: sourceCode?.scrollTop ?? 0,
      },
    });
  };

  return (
    <section ref={frameRef} aria-label="コードブロック" data-code-frame="">
      <MorphingDialogFrame
        id={isExpanded && dialog.expanded ? dialog.expanded.id : layoutId}
        enabled={sharedLayoutEnabled}
        className={`overflow-visible mx-0.5 rounded-2xl border border-back-5 has-[pre:focus-visible]:ring-2 has-[pre:focus-visible]:ring-fore-1 ${isExpanded ? "pointer-events-none opacity-0" : ""}`}
      >
        <div className="overflow-clip rounded-b-2xl">
          <CodeControls
            code={code}
            language={language}
            fullscreen={false}
            toggle={open}
            motionId={
              sharedLayoutEnabled
                ? `code-controls-${isExpanded && dialog.expanded ? dialog.expanded.id : layoutId}`
                : undefined
            }
          />
          <motion.div
            layoutId={
              sharedLayoutEnabled ? `code-content-${layoutId}` : undefined
            }
            data-code-content=""
            className="relative min-w-0 max-w-full overflow-hidden rounded-b-2xl"
          >
            <pre
              {...props}
              tabIndex={
                isHorizontallyScrollable && !isExpanded
                  ? (props.tabIndex ?? 0)
                  : undefined
              }
              ref={codeScrollRef}
              className={`${props.className ?? ""} my-0! outline-none [--scroll-fade-size:2.5rem]`}
            >
              {codeElement
                ? cloneElement(codeElement, {
                    lineNumbers: true,
                    codeBlockId: layoutId,
                  })
                : children}
            </pre>
          </motion.div>
        </div>
      </MorphingDialogFrame>
    </section>
  );
};

const CodeDialogProvider = ({
  children,
  completedCodeBlocks,
  isAnimating,
}: {
  children: ReactNode;
  completedCodeBlocks: ReadonlySet<string>;
  isAnimating: boolean;
}) => {
  const { parallaxEnabled } = usePreferences();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<ExpandedCode | null>(null);
  const [collapsedCodeBlocks, setCollapsedCodeBlocks] = useState<
    Map<string, Set<number>>
  >(() => new Map());
  const [isClosing, setIsClosing] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(0.5);
  const dragControls = useDragControls();
  const expandedSurfaceRef = useRef<HTMLDivElement>(null);
  const { elementRef: expandedCodeRef } = useNativeScroll<HTMLPreElement>(
    { axis: "both" },
    [expanded?.id],
  );
  const [closingTarget, setClosingTarget] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    startWidth: number;
    startHeight: number;
    borderRadius: string;
    surfaceStartTranslate: string;
    surfaceEndTranslate: string;
    sourceStartTransform: string;
    startTransform: string;
  } | null>(null);
  const expandedScrollLeft = expanded?.origin.scrollLeft;
  const expandedScrollTop = expanded?.origin.scrollTop;
  useLayoutEffect(() => {
    const expandedCode = expandedCodeRef.current;
    if (
      !expandedCode ||
      expandedScrollLeft === undefined ||
      expandedScrollTop === undefined
    ) {
      return;
    }
    expandedCode.scrollLeft = expandedScrollLeft;
    expandedCode.scrollTop = expandedScrollTop;
  }, [expandedCodeRef, expandedScrollLeft, expandedScrollTop]);
  const expandedCodeId = expanded?.id;
  useEffect(() => {
    if (!expandedCodeId) return;
    document.body.dataset.codeDialogOpen = "";
    setBackdropOpacity(0.5);
    return () => {
      delete document.body.dataset.codeDialogOpen;
    };
  }, [expandedCodeId]);
  const finishClose = useCallback(() => {
    if (!expanded) return;
    const selected = expanded;
    const scrollLeft =
      expandedCodeRef.current?.scrollLeft ?? selected.origin.scrollLeft;
    const scrollTop =
      expandedCodeRef.current?.scrollTop ?? selected.origin.scrollTop;
    setExpanded(null);
    setIsClosing(false);
    setClosingTarget(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const originFrame =
          selected.root.querySelectorAll<HTMLElement>("[data-code-frame]")[
            selected.index
          ];
        const originCode = originFrame?.querySelector("pre");
        if (originCode) {
          originCode.scrollLeft = scrollLeft;
          originCode.scrollTop = scrollTop;
        }
        selected?.root
          .querySelectorAll("[data-code-frame]")
          [selected.index]?.querySelector<HTMLButtonElement>(
            'button[aria-label="Expand code"]',
          )
          ?.focus({ preventScroll: true });
      });
    });
  }, [expanded, expandedCodeRef]);
  const finishCloseRef = useRef(finishClose);
  finishCloseRef.current = finishClose;
  const expandedId = expanded?.id;
  const expandedRoot = expanded?.root;
  const expandedIndex = expanded?.index;
  useLayoutEffect(() => {
    if (
      !expandedId ||
      !expandedRoot ||
      expandedIndex === undefined ||
      isClosing ||
      !parallaxEnabled
    ) {
      return;
    }
    const dialog = document.querySelector<HTMLElement>(
      '[aria-label="Fullscreen Code View"] .prose-fluina',
    );
    const originFrame =
      expandedRoot.querySelectorAll<HTMLElement>("[data-code-frame]")[
        expandedIndex
      ];
    const originSurface = originFrame?.firstElementChild;
    if (!dialog || !(originSurface instanceof HTMLElement)) {
      console.error("Could not measure the code block for its open animation.");
      return;
    }

    const options: KeyframeAnimationOptions = {
      duration: THEME.duration * 500,
      easing: "ease-out",
    };
    const progressElement = document.createElement("span");
    progressElement.setAttribute("aria-hidden", "true");
    progressElement.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0";
    document.body.append(progressElement);
    const progressAnimation = progressElement.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      options,
    );
    originSurface.style.opacity = "1";
    dialog.style.opacity = "0";
    let syncFrame = 0;
    const syncCrossfade = () => {
      const progress = Number.parseFloat(
        getComputedStyle(progressElement).opacity,
      );
      originSurface.style.opacity = `${1 - progress}`;
      dialog.style.opacity = `${progress}`;
      if (progressAnimation.playState !== "finished") {
        syncFrame = requestAnimationFrame(syncCrossfade);
      }
    };
    syncFrame = requestAnimationFrame(syncCrossfade);
    const animation = dialog.animate(
      [
        { borderRadius: getComputedStyle(originSurface).borderRadius },
        { borderRadius: "0px" },
      ],
      options,
    );
    let completed = false;
    let finishedAnimations = 0;
    const finishWhenBothAnimationsEnd = () => {
      finishedAnimations += 1;
      if (finishedAnimations !== 2) return;
      completed = true;
      cancelAnimationFrame(syncFrame);
      animation.commitStyles();
      progressAnimation.commitStyles();
      progressElement.remove();
      originSurface.style.removeProperty("opacity");
      dialog.style.removeProperty("opacity");
    };
    animation.onfinish = finishWhenBothAnimationsEnd;
    progressAnimation.onfinish = () => {
      syncCrossfade();
      finishWhenBothAnimationsEnd();
    };
    return () => {
      if (!completed) {
        animation.cancel();
        progressAnimation.cancel();
        cancelAnimationFrame(syncFrame);
        progressElement.remove();
        originSurface.style.removeProperty("opacity");
        dialog.style.removeProperty("opacity");
      }
    };
  }, [expandedId, expandedRoot, expandedIndex, isClosing, parallaxEnabled]);
  const close = useCallback(() => {
    if (!expanded || isClosing) return;
    if (!parallaxEnabled) {
      finishClose();
      return;
    }
    const dialog = document.querySelector<HTMLElement>(
      '[aria-label="Fullscreen Code View"] .prose-fluina',
    );
    if (!dialog) {
      console.error(
        "Could not measure the code block for its close animation.",
      );
      finishClose();
      return;
    }

    const originFrame =
      expanded.root.querySelectorAll<HTMLElement>("[data-code-frame]")[
        expanded.index
      ];
    if (!originFrame) {
      console.error("Could not find the original code frame to close to.");
      finishClose();
      return;
    }
    const startTransform = getComputedStyle(dialog).transform;
    const expandedSurface = expandedSurfaceRef.current;
    const surfaceTransform = expandedSurface
      ? getComputedStyle(expandedSurface).transform
      : "none";
    const bounds = dialog.getBoundingClientRect();
    const surfaceBounds = expandedSurface?.getBoundingClientRect() ?? bounds;
    const inlineTransform = dialog.style.getPropertyValue("transform");
    const inlineTransformPriority =
      dialog.style.getPropertyPriority("transform");
    dialog.style.setProperty("transform", "none", "important");
    const layoutBounds = dialog.getBoundingClientRect();
    if (inlineTransform) {
      dialog.style.setProperty(
        "transform",
        inlineTransform,
        inlineTransformPriority,
      );
    } else {
      dialog.style.removeProperty("transform");
    }
    const originSurface = originFrame.firstElementChild;
    const originCode = originFrame.querySelector("pre");
    if (!(originSurface instanceof HTMLElement)) {
      console.error("Could not find the original code surface to close to.");
      finishClose();
      return;
    }
    const expandedCode = expandedCodeRef.current;
    if (originCode && expandedCode) {
      originCode.scrollLeft = expandedCode.scrollLeft;
      originCode.scrollTop = expandedCode.scrollTop;
    }
    const originBounds = originFrame.getBoundingClientRect();
    const x = originBounds.left - layoutBounds.left;
    const y = originBounds.top - layoutBounds.top;
    const surfaceMatrix =
      surfaceTransform === "none"
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(surfaceTransform);
    const surfaceOffsetX = surfaceBounds.left - bounds.left - surfaceMatrix.m41;
    const surfaceOffsetY = surfaceBounds.top - bounds.top - surfaceMatrix.m42;
    const sourceScaleX = bounds.width / originBounds.width;
    const sourceScaleY = bounds.height / originBounds.height;
    setClosingTarget({
      x,
      y,
      width: originBounds.width,
      height: originBounds.height,
      startWidth: layoutBounds.width,
      startHeight: layoutBounds.height,
      borderRadius: getComputedStyle(originSurface).borderRadius,
      surfaceStartTranslate: `${surfaceMatrix.m41}px ${surfaceMatrix.m42}px`,
      surfaceEndTranslate: `${-surfaceOffsetX}px ${-surfaceOffsetY}px`,
      sourceStartTransform: `translate(${bounds.left - originBounds.left}px, ${bounds.top - originBounds.top}px) scale(${sourceScaleX}, ${sourceScaleY})`,
      startTransform,
    });
    setIsClosing(true);
  }, [expanded, expandedCodeRef, finishClose, isClosing, parallaxEnabled]);

  useLayoutEffect(() => {
    if (!isClosing || !closingTarget) return;
    const dialog = document.querySelector<HTMLElement>(
      '[aria-label="Fullscreen Code View"] .prose-fluina',
    );
    const originFrame =
      expandedRoot?.querySelectorAll<HTMLElement>("[data-code-frame]")[
        expandedIndex ?? -1
      ];
    const originSurface = originFrame?.firstElementChild;
    const expandedSurface = expandedSurfaceRef.current;
    if (!dialog || !(originSurface instanceof HTMLElement)) {
      console.error("Could not find the code dialog for its close animation.");
      flushSync(() => finishCloseRef.current());
      return;
    }

    const duration = THEME.duration * 500;
    const easing = "ease-out";
    const options: KeyframeAnimationOptions = { duration, easing };
    const surfaceInlineTransform =
      expandedSurface?.style.getPropertyValue("transform") ?? "";
    const surfaceInlineTransformPriority =
      expandedSurface?.style.getPropertyPriority("transform") ?? "";
    expandedSurface?.style.setProperty("transform", "none", "important");
    const progressElement = document.createElement("span");
    progressElement.setAttribute("aria-hidden", "true");
    progressElement.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0";
    document.body.append(progressElement);
    const progressAnimation = progressElement.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      options,
    );
    originSurface.style.opacity = "0";
    dialog.style.opacity = "1";
    let syncFrame = 0;
    const syncCrossfade = () => {
      const progress = Number.parseFloat(
        getComputedStyle(progressElement).opacity,
      );
      originSurface.style.opacity = `${progress}`;
      dialog.style.opacity = `${1 - progress}`;
      if (progressAnimation.playState !== "finished") {
        syncFrame = requestAnimationFrame(syncCrossfade);
      }
    };
    syncFrame = requestAnimationFrame(syncCrossfade);
    let completed = false;
    let finishedAnimations = 0;
    let surfaceAnimation: Animation | undefined;
    let sourceAnimation: Animation | undefined;
    const finishWhenBothAnimationsEnd = () => {
      finishedAnimations += 1;
      if (finishedAnimations !== (surfaceAnimation ? 4 : 3)) return;
      completed = true;
      animation.commitStyles();
      surfaceAnimation?.commitStyles();
      progressAnimation.commitStyles();
      sourceAnimation?.cancel();
      cancelAnimationFrame(syncFrame);
      progressElement.remove();
      if (expandedSurface) {
        const surfaceBounds = expandedSurface.getBoundingClientRect();
        const targetBounds = originSurface.getBoundingClientRect();
        const dialogTransform = new DOMMatrixReadOnly(
          getComputedStyle(dialog).transform,
        );
        dialog.style.setProperty(
          "transform",
          `translate(${dialogTransform.m41 + targetBounds.left - surfaceBounds.left}px, ${dialogTransform.m42 + targetBounds.top - surfaceBounds.top}px)`,
          "important",
        );
      }
      originSurface.style.opacity = "1";
      dialog.style.opacity = "0";
      flushSync(() => finishCloseRef.current());
    };
    const animation = dialog.animate(
      [
        {
          transform: closingTarget.startTransform,
          width: `${closingTarget.startWidth}px`,
          height: `${closingTarget.startHeight}px`,
          borderRadius: getComputedStyle(dialog).borderRadius,
          overflow: "hidden",
        },
        {
          transform: `translate(${closingTarget.x}px, ${closingTarget.y}px)`,
          width: `${closingTarget.width}px`,
          height: `${closingTarget.height}px`,
          borderRadius: closingTarget.borderRadius,
          overflow: "hidden",
        },
      ],
      options,
    );
    if (expandedSurface) {
      surfaceAnimation = expandedSurface.animate(
        [
          { translate: closingTarget.surfaceStartTranslate },
          { translate: closingTarget.surfaceEndTranslate },
        ],
        options,
      );
      surfaceAnimation.onfinish = finishWhenBothAnimationsEnd;
    }
    sourceAnimation = originSurface.animate(
      [
        {
          transform: closingTarget.sourceStartTransform,
          transformOrigin: "top left",
        },
        {
          transform: "translate(0px, 0px) scale(1, 1)",
          transformOrigin: "top left",
        },
      ],
      options,
    );
    sourceAnimation.onfinish = finishWhenBothAnimationsEnd;
    animation.onfinish = finishWhenBothAnimationsEnd;
    progressAnimation.onfinish = () => {
      syncCrossfade();
      finishWhenBothAnimationsEnd();
    };

    return () => {
      if (!completed) {
        animation.cancel();
        surfaceAnimation?.cancel();
        sourceAnimation?.cancel();
        progressAnimation.cancel();
        cancelAnimationFrame(syncFrame);
        progressElement.remove();
        if (expandedSurface) {
          if (surfaceInlineTransform) {
            expandedSurface.style.setProperty(
              "transform",
              surfaceInlineTransform,
              surfaceInlineTransformPriority,
            );
          } else {
            expandedSurface.style.removeProperty("transform");
          }
        }
        originSurface.style.removeProperty("opacity");
        dialog.style.removeProperty("opacity");
      }
    };
  }, [closingTarget, expandedRoot, expandedIndex, isClosing]);
  return (
    <MorphingDialog
      transition={{ duration: THEME.duration * 0.5, ease: THEME.ease }}
    >
      <CodeDialogContext.Provider
        value={{
          expanded,
          setExpanded,
          collapsedCodeBlocks,
          setCollapsedCodeBlocks,
          completedCodeBlocks,
          isAnimating,
          isClosing,
        }}
      >
        {children}
        <ModalOverlay
          isOpen={expanded !== null}
          isDismissable
          onOpenChange={(open) => {
            if (!open) close();
          }}
          className="code-dialog-overlay fixed inset-0 z-50"
          data-closing={isClosing ? "" : undefined}
        >
          <div
            aria-hidden="true"
            className="code-dialog-backdrop pointer-events-none absolute inset-0 z-0"
            style={
              {
                "--code-dialog-backdrop-alpha": `${backdropOpacity * 100}%`,
              } as CSSProperties
            }
          />
          <Modal className="relative z-10 size-full outline-none">
            <Dialog
              aria-label="Fullscreen Code View"
              className="size-full outline-none"
            >
              {expanded && (
                <MorphingDialogContent
                  id={expanded.id}
                  enabled={parallaxEnabled && !isClosing && !isAnimating}
                  managed
                  className="prose prose-fluina flex size-full max-w-none flex-col overflow-visible rounded-none border border-back-5 bg-transparent"
                >
                  <motion.div
                    ref={expandedSurfaceRef}
                    drag={isMobile && !isClosing ? "y" : false}
                    dragMomentum={false}
                    animate={isClosing ? { y: 0 } : undefined}
                    transition={isClosing ? { duration: 0 } : undefined}
                    dragControls={dragControls}
                    dragListener={false}
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0.05, bottom: 0.8 }}
                    onDrag={(_, { offset }) => {
                      setBackdropOpacity(
                        getDragOpacity(offset.y, window.innerHeight),
                      );
                    }}
                    onDragEnd={(_, { offset, velocity }) => {
                      if (
                        offset.y > CODE_DISMISS_DISTANCE ||
                        velocity.y > CODE_DISMISS_VELOCITY
                      ) {
                        setBackdropOpacity(0);
                        close();
                      } else setBackdropOpacity(0.5);
                    }}
                    className="flex min-h-0 min-w-0 flex-1 flex-col"
                  >
                    <CodeControls
                      code={expanded.code}
                      language={expanded.language}
                      fullscreen
                      toggle={close}
                      dragHandle={isMobile && !isClosing}
                      dragControls={
                        isMobile && !isClosing ? dragControls : undefined
                      }
                      motionId={
                        parallaxEnabled && !isClosing && !isAnimating
                          ? `code-controls-${expanded.id}`
                          : undefined
                      }
                    />
                    <motion.div
                      layoutId={
                        parallaxEnabled && !isClosing && !isAnimating
                          ? `code-content-${expanded.id}`
                          : undefined
                      }
                      data-code-content=""
                      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-back-1"
                    >
                      <pre
                        ref={expandedCodeRef}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="my-0! min-h-0 flex-1 select-text bg-back-1 pb-[env(safe-area-inset-bottom,1rem)] [--scroll-fade-size:2.5rem] **:select-text"
                      >
                        <MarkdownCode
                          lineNumbers
                          codeBlockId={expanded.id}
                          className={
                            expanded.language
                              ? `language-${expanded.language}`
                              : undefined
                          }
                        >
                          {expanded.code}
                        </MarkdownCode>
                      </pre>
                    </motion.div>
                  </motion.div>
                </MorphingDialogContent>
              )}
            </Dialog>
          </Modal>
        </ModalOverlay>
      </CodeDialogContext.Provider>
    </MorphingDialog>
  );
};

const markdownComponents = {
  p: MarkdownParagraph,
  a: MarkdownLink,
  img: "img",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  ul: "ul",
  ol: "ol",
  li: "li",
  blockquote: "blockquote",
  hr: "hr",
  strong: "strong",
  sup: "sup",
  sub: "sub",
  pre: MarkdownPre,
  code: MarkdownCode,
  table: MarkdownTable,
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
} as const;
const MEDIA_PREFIX = "[[FLUINA_MEDIA:";
const REVEAL_INTERVAL_MS = 50;
const REVEAL_GRAPHEMES_PER_TICK = 6;
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

function advanceReply(content: string, position: number, isStreaming: boolean) {
  let next = position;
  let remaining = REVEAL_GRAPHEMES_PER_TICK;
  while (next < content.length && remaining > 0) {
    const tail = content.slice(next);
    if (tail.startsWith(MEDIA_PREFIX)) {
      const end = content.indexOf("]]", next + MEDIA_PREFIX.length);
      if (end === -1 && isStreaming) break;
      if (end !== -1) {
        if (remaining < REVEAL_GRAPHEMES_PER_TICK) break;
        next = end + 2;
        break;
      }
    } else if (isStreaming && MEDIA_PREFIX.startsWith(tail)) {
      break;
    }

    const segment = graphemeSegmenter.segment(tail)[Symbol.iterator]().next();
    if (segment.done) break;
    next += segment.value.segment.length;
    remaining -= 1;
  }
  return next;
}

const ChatMarkdown = memo(function ChatMarkdown({
  messageId,
  content,
  isAnimating,
  animateNewContent,
  motionEnabled,
  revealPosition,
  onRevealComplete,
}: {
  messageId: string;
  content: string;
  isAnimating: boolean;
  animateNewContent: boolean;
  motionEnabled: boolean;
  revealPosition: { current: Map<string, number> };
  onRevealComplete: (id: string) => void;
}) {
  const [revealedLength, setRevealedLength] = useState(() =>
    animateNewContent && motionEnabled
      ? (revealPosition.current.get(messageId) ?? 0)
      : content.length,
  );
  const [revealComplete, setRevealComplete] = useState(!animateNewContent);
  const positionRef = useRef(revealedLength);
  const latestContent = useRef(content);
  const latestIsAnimating = useRef(isAnimating);
  latestContent.current = content;
  latestIsAnimating.current = isAnimating;

  useEffect(() => {
    if (!animateNewContent || motionEnabled) return;
    revealPosition.current.set(messageId, content.length);
    positionRef.current = content.length;
    setRevealedLength(content.length);
  }, [
    animateNewContent,
    content.length,
    messageId,
    motionEnabled,
    revealPosition,
  ]);

  useEffect(() => {
    if (!animateNewContent || !motionEnabled || revealComplete) return;
    const timer = setInterval(() => {
      const next = advanceReply(
        latestContent.current,
        positionRef.current,
        latestIsAnimating.current,
      );
      if (next === positionRef.current) return;
      positionRef.current = next;
      revealPosition.current.set(messageId, next);
      setRevealedLength(next);
    }, REVEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [
    animateNewContent,
    messageId,
    motionEnabled,
    revealComplete,
    revealPosition,
  ]);

  useEffect(() => {
    if (
      !animateNewContent ||
      revealComplete ||
      isAnimating ||
      (motionEnabled && revealedLength < content.length)
    ) {
      return;
    }
    const timer = setTimeout(
      () => {
        setRevealComplete(true);
        onRevealComplete(messageId);
      },
      motionEnabled ? 100 : 0,
    );
    return () => clearTimeout(timer);
  }, [
    animateNewContent,
    content.length,
    isAnimating,
    messageId,
    motionEnabled,
    onRevealComplete,
    revealComplete,
    revealedLength,
  ]);

  const visibleContent =
    animateNewContent && motionEnabled
      ? content.slice(0, revealedLength)
      : content;
  const isRevealing = animateNewContent && !revealComplete;
  const completedCodeBlocks = useMemo(
    () => getCompletedCodeBlocks(content),
    [content],
  );
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

  for (const match of visibleContent.matchAll(mediaPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({
        type: "text",
        key: `text-${cursor}`,
        content: visibleContent.slice(cursor, index),
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

  if (cursor < visibleContent.length || parts.length === 0) {
    parts.push({
      type: "text",
      key: `text-${cursor}`,
      content: visibleContent.slice(cursor),
    });
  }

  return (
    <CodeDialogProvider
      completedCodeBlocks={completedCodeBlocks}
      isAnimating={isAnimating || isRevealing}
    >
      <div className="flex flex-col gap-3 min-w-0 w-full max-w-full prose prose-fluina">
        {parts.map((part) =>
          part.type === "media" ? (
            part.kind === "video" ? (
              <video
                key={part.key}
                controls
                crossOrigin="anonymous"
                preload="metadata"
                aria-label={part.alt}
                style={
                  motionEnabled && isRevealing
                    ? {
                        animation: `sd-fadeIn ${REVEAL_INTERVAL_MS}ms linear both`,
                      }
                    : undefined
                }
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
                style={
                  motionEnabled && isRevealing
                    ? {
                        animation: `sd-fadeIn ${REVEAL_INTERVAL_MS}ms linear both`,
                      }
                    : undefined
                }
                className="max-h-[70vh] max-w-full object-contain border border-back-5"
              />
            )
          ) : (
            <Streamdown
              key={part.key}
              animated={
                motionEnabled && isRevealing
                  ? {
                      animation: "fadeIn",
                      duration: REVEAL_INTERVAL_MS,
                      easing: "linear",
                      sep: "word",
                      stagger: REVEAL_INTERVAL_MS / REVEAL_GRAPHEMES_PER_TICK,
                      maxBacklogMs: REVEAL_INTERVAL_MS,
                    }
                  : false
              }
              mode={isAnimating || isRevealing ? "streaming" : "static"}
              isAnimating={isAnimating || isRevealing}
              plugins={markdownPlugins}
              components={markdownComponents}
            >
              {part.content}
            </Streamdown>
          ),
        )}
      </div>
    </CodeDialogProvider>
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

const PAGE_LOAD_EXTRA_DELAY_MS = 250;

export default function Ask() {
  const os = useOS();
  const isMobile = useIsMobile();
  const { parallaxEnabled } = usePreferences();

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
  const [archiveReady, setArchiveReady] = useState(false);
  const [isInitialChatPositioned, setIsInitialChatPositioned] = useState(false);
  const [isPrependingHistory, setIsPrependingHistory] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(
    null,
  );
  const [revealingMessageId, setRevealingMessageId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editingRef = useRef<HTMLDivElement>(null);
  const editingInitialValueRef = useRef("");

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const nativeSmoothScrollCleanupRef = useRef<(() => void) | null>(null);
  const pendingLatestTurnScrollRef = useRef<ChatScrollBehavior | null>(null);
  const shouldStickToLatestTurnRef = useRef(true);
  const assistantReplyActiveRef = useRef(false);
  const assistantReplyOverflowedRef = useRef(false);
  const assistantUserScrollStartRef = useRef<number | null>(null);
  const streamedMessageIdsRef = useRef(new Set<string>());
  const revealPositionRef = useRef(new Map<string, number>());
  const finishRevealingMessage = useCallback((id: string) => {
    setRevealingMessageId((current) => (current === id ? null : current));
  }, []);
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

  const collapseComposer = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const toggleComposerExpanded = useCallback(() => {
    setIsExpanded((expanded) => !expanded);
  }, []);

  const hasText = value.trim().length > 0;
  const hasFiles = files.length > 0;
  const hasInput = hasText || hasFiles;

  const updateTailSpacer = useCallback((viewportOverride?: HTMLElement) => {
    const host = chatScrollRef.current;
    const viewport = viewportOverride ?? host;
    const spacer = host?.querySelector<HTMLElement>("[data-chat-tail-spacer]");
    if (!viewport || !spacer) return;

    const lastTurn = host?.querySelector<HTMLElement>("[data-chat-last-turn]");
    if (!lastTurn) {
      spacer.style.height = "0px";
      return;
    }
    const isInFlow = (el: Element) =>
      getComputedStyle(el).position !== "absolute";
    let used = 0;
    let el = spacer.previousElementSibling;
    for (; el && !el.contains(lastTurn); el = el.previousElementSibling) {
      if (isInFlow(el)) used += el.getBoundingClientRect().height;
    }
    if (el) {
      used += Math.max(
        el.getBoundingClientRect().bottom -
          lastTurn.getBoundingClientRect().top,
        0,
      );
    } else {
      used += lastTurn.getBoundingClientRect().height;
    }
    const next = `${Math.max(Math.ceil(viewport.clientHeight - used), 0)}px`;
    if (spacer.style.height !== next) spacer.style.height = next;
  }, []);

  const scrollToLatestTurn = useCallback(
    (behavior: ChatScrollBehavior, viewportOverride?: HTMLElement) => {
      const chatScrollHost = chatScrollRef.current;
      const viewport = viewportOverride ?? chatScrollHost;
      if (!viewport) return;

      nativeSmoothScrollCleanupRef.current?.();

      if (behavior === "smooth") {
        let frame = 0;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          cancelAnimationFrame(frame);
          clearTimeout(timeout);
          viewport.removeEventListener("scrollend", onScrollEnd);
          nativeSmoothScrollCleanupRef.current = null;
          updateTailSpacer(viewport);
          if (shouldStickToLatestTurnRef.current) {
            const finalTarget = getChatScrollTarget(
              viewport,
              assistantReplyActiveRef.current,
            );
            if (Math.abs(finalTarget - viewport.scrollTop) > 1) {
              viewport.scrollTo({ top: finalTarget, behavior: "instant" });
            }
          }
          scrollTopRef.current = viewport.scrollTop;
        };
        const onScrollEnd = () => finish();
        nativeSmoothScrollCleanupRef.current = finish;

        const waitStartedAt = performance.now();
        let stableFrames = 0;
        let previousSignature = "";
        const start = () => {
          updateTailSpacer(viewport);
          const lastTurn = viewport.querySelector<HTMLElement>(
            "[data-chat-last-turn]",
          );
          const signature = `${lastTurn?.offsetHeight ?? 0}/${viewport.scrollHeight}/${Math.round(getChatScrollTarget(viewport, assistantReplyActiveRef.current))}`;
          stableFrames = signature === previousSignature ? stableFrames + 1 : 0;
          previousSignature = signature;
          if (stableFrames < 2 && performance.now() - waitStartedAt < 500) {
            frame = requestAnimationFrame(start);
            return;
          }
          updateTailSpacer(viewport);
          const target = getChatScrollTarget(
            viewport,
            assistantReplyActiveRef.current,
          );
          if (Math.abs(target - viewport.scrollTop) <= 1) {
            finish();
            return;
          }
          viewport.addEventListener("scrollend", onScrollEnd, { once: true });
          timeout = setTimeout(finish, 1500);
          viewport.scrollTo({ top: target, behavior: "smooth" });
        };
        frame = requestAnimationFrame(start);
        return;
      }

      updateTailSpacer(viewport);
      const target = getChatScrollTarget(
        viewport,
        assistantReplyActiveRef.current,
      );
      viewport.scrollTo({ top: target, behavior: "instant" });
      scrollTopRef.current = target;
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
    const viewport = host;
    observer.observe(viewport);
    const lastTurn = host.querySelector<HTMLElement>("[data-chat-last-turn]");
    if (lastTurn) observer.observe(lastTurn);

    const spacer = host.querySelector<HTMLElement>("[data-chat-tail-spacer]");
    const siblings = spacer?.parentElement;
    if (siblings) {
      for (const child of siblings.children) {
        if (child !== spacer) observer.observe(child);
      }
    }
  });

  useEffect(() => {
    const spacer = chatScrollRef.current?.querySelector<HTMLElement>(
      "[data-chat-tail-spacer]",
    );
    const siblings = spacer?.parentElement;
    if (!siblings) return;
    const mutationObserver = new MutationObserver(() => updateTailSpacer());
    mutationObserver.observe(siblings, { childList: true });
    return () => mutationObserver.disconnect();
  }, [updateTailSpacer]);

  const applyArchivePage = useCallback(
    (
      page: ChatArchivePage,
      scrollBehavior: ChatScrollBehavior | null = null,
    ) => {
      if (scrollBehavior) {
        shouldStickToLatestTurnRef.current = true;
        pendingLatestTurnScrollRef.current = scrollBehavior;
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
        const offsetLoaded = loadStoredClockOffset().catch((error) => {
          console.warn("Stored clock offset load failed:", error);
        });
        void fetch(`${getApiUrl()}/api/ask/time`, { cache: "no-store" }).catch(
          () => undefined,
        );
        void offsetLoaded
          .then(() => syncServerClock(getApiUrl()))
          .then(() => purgeExpiredChatTurns())
          .catch((error) => {
            console.warn("Server clock sync failed:", error);
          });

        try {
          await requestPersistentChatStorage();
        } catch (error) {
          console.warn("Persistent storage request failed:", error);
        }

        await offsetLoaded;

        try {
          await purgeExpiredChatTurns();
        } catch (error) {
          console.warn("Expired chat purge failed:", error);
        }

        let page = await loadLatestChatTurns(CHAT_PAGE_TURN_LIMIT);
        const lastMessage = page.messages.at(-1);
        if (lastMessage?.role === "user") {
          try {
            await appendChatMessage({
              id: `${lastMessage.id}-interrupted`,
              role: "assistant",
              content: "",
              notice: { kind: "error", text: INTERRUPTED_NOTICE_TEXT },
              timestamp: serverNow(),
            });
          } catch (error) {
            console.warn("Interrupted notice was not saved:", error);
          }
          page = await loadLatestChatTurns(CHAT_PAGE_TURN_LIMIT);
        }
        if (active) {
          applyArchivePage(page, "instant");
          setArchiveReady(true);
        }
      } catch (error) {
        console.error("Chat archive initialization failed:", error);
      }
    };

    void initializeArchive();

    return () => {
      active = false;
    };
  }, [applyArchivePage]);

  const { elementRef: scrollRef } = useNativeScroll<HTMLDivElement>(
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

  const archiveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const runArchiveTask = useCallback(<T,>(task: () => Promise<T>) => {
    const result = archiveQueueRef.current.then(task, task);
    archiveQueueRef.current = result.catch(() => undefined);
    return result;
  }, []);

  const refreshVisibleArchivePage = useCallback(
    (scrollBehavior: ChatScrollBehavior | null = null) =>
      runArchiveTask(async () => {
        const page = await loadLatestChatTurns(
          CHAT_PAGE_TURN_LIMIT,
          loadedFirstSequenceRef.current,
        );
        applyArchivePage(page, scrollBehavior);
        return page;
      }),
    [applyArchivePage, runArchiveTask],
  );

  const appendQueuedMessage = useCallback(
    (message: ArchivedMessage) =>
      runArchiveTask(() => appendChatMessage(message)),
    [runArchiveTask],
  );

  useEffect(() => {
    if (!archiveReady) return;

    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(ARCHIVE_CHANNEL_NAME);

    const reflectDeletion = async (deleted: Set<number>) => {
      setIsPrependingHistory(true);
      setMessages((current) =>
        current.filter((message) => !deleted.has(message.sequence)),
      );

      const oldest = await getOldestChatSequence();
      const currentFirst = loadedFirstSequenceRef.current;
      const first =
        currentFirst !== null && !deleted.has(currentFirst)
          ? currentFirst
          : oldest;
      loadedFirstSequenceRef.current = first;
      setFirstMessageSequence(first);
      setHasOlderMessages(oldest !== null && first !== null && oldest < first);
    };

    const purge = async () => {
      try {
        await syncServerClock(getApiUrl());
      } catch (error) {
        console.warn("Server clock sync before chat purge failed:", error);
      }

      return runArchiveTask(async () => {
        try {
          const sequences = await purgeExpiredChatTurns();
          if (sequences.length === 0) return;

          await reflectDeletion(new Set(sequences));
          channel?.postMessage({ type: "purged", sequences });
        } catch (error) {
          console.warn("Expired chat purge failed:", error);
        }
      });
    };

    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (
          typeof data !== "object" ||
          data === null ||
          !("type" in data) ||
          data.type !== "purged" ||
          !("sequences" in data) ||
          !Array.isArray(data.sequences)
        ) {
          return;
        }
        const sequences = new Set(
          data.sequences.filter(
            (value): value is number => typeof value === "number",
          ),
        );
        void runArchiveTask(async () => {
          try {
            await reflectDeletion(sequences);
          } catch (error) {
            console.warn("Purge sync failed:", error);
          }
        });
      };
    }

    const interval = setInterval(() => void purge(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void purge();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [archiveReady, runArchiveTask]);

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
      await runArchiveTask(async () => {
        const beforeSequence = loadedFirstSequenceRef.current;
        if (beforeSequence === null) return;

        const olderPage = await loadOlderChatTurns(
          beforeSequence,
          CHAT_PAGE_TURN_LIMIT,
        );
        setIsPrependingHistory(true);
        setMessages((currentMessages) => [
          ...olderPage.messages,
          ...currentMessages,
        ]);
        setHasOlderMessages(olderPage.hasOlder);
        setFirstMessageSequence(olderPage.firstSequence);
        loadedFirstSequenceRef.current = olderPage.firstSequence;
      });
    } catch (error) {
      console.error("Older chat page load failed:", error);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    firstMessageSequence,
    hasOlderMessages,
    isLoadingOlderMessages,
    runArchiveTask,
  ]);

  useLayoutEffect(() => {
    if (isPrependingHistory) setIsPrependingHistory(false);

    const scrollBehavior = pendingLatestTurnScrollRef.current;
    if (scrollBehavior) {
      pendingLatestTurnScrollRef.current = null;
      scrollToLatestTurn(scrollBehavior);
    }
  });

  useLayoutEffect(() => {
    if (!archiveReady || isInitialChatPositioned) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (messages.length === 0) {
      timeout = setTimeout(
        () => setIsInitialChatPositioned(true),
        PAGE_LOAD_EXTRA_DELAY_MS,
      );
      return () => clearTimeout(timeout);
    }

    let frame = 0;
    let stableFrames = 0;
    let previousLayout = "";
    let previousViewport: HTMLElement | null = null;
    const latestMessageRole = messages.at(-1)?.role;
    const expectsDisclaimer = !isLoading && latestMessageRole === "assistant";

    const positionInitialChat = () => {
      const chatScrollHost = chatScrollRef.current;
      const viewport = chatScrollHost;
      if (!viewport) {
        frame = requestAnimationFrame(positionInitialChat);
        return;
      }

      const layoutReady = getComputedStyle(
        document.documentElement,
      ).getPropertyValue("--fluina-layout-ready");
      if (layoutReady.trim() !== "1") {
        frame = requestAnimationFrame(positionInitialChat);
        return;
      }

      const lastTurn = viewport.querySelector<HTMLElement>(
        "[data-chat-last-turn]",
      );
      const disclaimer = viewport.querySelector<HTMLElement>(
        "[data-chat-disclaimer]",
      );
      if (
        viewport.clientHeight === 0 ||
        (messages.length > 0 && !lastTurn) ||
        (expectsDisclaimer && !disclaimer)
      ) {
        frame = requestAnimationFrame(positionInitialChat);
        return;
      }

      scrollToLatestTurn("instant", viewport);

      const isAtBottom =
        Math.abs(getChatScrollTarget(viewport) - viewport.scrollTop) <= 1;
      const layout = [
        viewport.clientHeight,
        viewport.scrollHeight,
        lastTurn?.getBoundingClientRect().height ?? 0,
        disclaimer?.getBoundingClientRect().height ?? 0,
        viewport.querySelector<HTMLElement>("[data-chat-tail-spacer]")?.style
          .height ?? "",
      ].join("/");
      if (
        isAtBottom &&
        viewport === previousViewport &&
        layout === previousLayout
      ) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        previousViewport = viewport;
        previousLayout = layout;
      }

      if (stableFrames >= 2) {
        timeout = setTimeout(
          () => setIsInitialChatPositioned(true),
          PAGE_LOAD_EXTRA_DELAY_MS,
        );
        return;
      }

      frame = requestAnimationFrame(positionInitialChat);
    };

    frame = requestAnimationFrame(positionInitialChat);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [
    archiveReady,
    isInitialChatPositioned,
    isLoading,
    messages,
    scrollToLatestTurn,
  ]);

  useEffect(() => {
    const host = chatScrollRef.current;
    if (!host) return;

    let isTabNavigation = false;
    let clearTabNavigationFrame = 0;
    let horizontalScrollOffsets = new Map<HTMLElement, number>();
    const getVisibleTabStops = () => {
      const hostBounds = host.getBoundingClientRect();
      const viewportTop = hostBounds.top + host.clientTop;
      const viewportBottom = viewportTop + host.clientHeight;
      const viewportLeft = hostBounds.left + host.clientLeft;
      const viewportRight = viewportLeft + host.clientWidth;
      return Array.from(
        host.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [tabindex]",
        ),
      ).filter((element) => {
        if (
          element.tabIndex < 0 ||
          element.hasAttribute("disabled") ||
          element.getAttribute("aria-disabled") === "true" ||
          element.closest('[inert], [aria-hidden="true"]') ||
          element.getClientRects().length === 0
        ) {
          return false;
        }

        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility !== "visible") {
          return false;
        }

        const bounds = element.getBoundingClientRect();
        return (
          bounds.bottom > viewportTop &&
          bounds.top < viewportBottom &&
          bounds.right > viewportLeft &&
          bounds.left < viewportRight
        );
      });
    };
    const centerFocusedItem = (target: HTMLElement) => {
      const targetBounds = target.getBoundingClientRect();
      const hostBounds = host.getBoundingClientRect();
      const viewportTop = hostBounds.top + host.clientTop;
      const viewportCenter = viewportTop + host.clientHeight / 2;
      const targetCenter = (targetBounds.top + targetBounds.bottom) / 2;
      const maxScrollTop = Math.max(host.scrollHeight - host.clientHeight, 0);
      const scrollTop = Math.min(
        maxScrollTop,
        Math.max(0, host.scrollTop + targetCenter - viewportCenter),
      );
      host.scrollTo({
        top: scrollTop,
        behavior: parallaxEnabled ? "smooth" : "instant",
      });
    };
    const stopFollowingOnTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      shouldStickToLatestTurnRef.current = false;
      assistantUserScrollStartRef.current = null;
      horizontalScrollOffsets = new Map(
        Array.from(host.querySelectorAll<HTMLElement>("pre")).map((pre) => [
          pre,
          pre.scrollLeft,
        ]),
      );
      isTabNavigation = true;
      cancelAnimationFrame(clearTabNavigationFrame);
      clearTabNavigationFrame = requestAnimationFrame(() => {
        isTabNavigation = false;
        horizontalScrollOffsets.clear();
      });

      const activeElement = document.activeElement;
      if (
        activeElement !== document.body &&
        activeElement !== document.documentElement
      ) {
        return;
      }

      const visibleTabStops = getVisibleTabStops();
      const target = event.shiftKey
        ? visibleTabStops[visibleTabStops.length - 1]
        : visibleTabStops[0];
      if (!target) return;

      event.preventDefault();
      target.focus({ preventScroll: true });
    };
    const scrollFocusedItemIntoView = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !host.contains(target)) return;

      shouldStickToLatestTurnRef.current = false;
      assistantUserScrollStartRef.current = null;

      if (isTabNavigation) {
        const codeBlock = target.closest<HTMLElement>("pre");
        const horizontalScrollLeft = codeBlock
          ? horizontalScrollOffsets.get(codeBlock)
          : undefined;
        requestAnimationFrame(() => {
          if (codeBlock?.isConnected && horizontalScrollLeft !== undefined) {
            codeBlock.scrollLeft = horizontalScrollLeft;
          }
          if (document.activeElement === target && host.contains(target)) {
            centerFocusedItem(target);
          }
        });
        return;
      }

      const targetBounds = target.getBoundingClientRect();
      const hostBounds = host.getBoundingClientRect();
      const viewportTop = hostBounds.top + host.clientTop;
      const viewportBottom = viewportTop + host.clientHeight;
      const scrollDelta =
        targetBounds.top < viewportTop
          ? targetBounds.top - viewportTop
          : targetBounds.bottom > viewportBottom
            ? targetBounds.bottom - viewportBottom
            : 0;
      if (scrollDelta === 0) return;

      host.scrollTo({
        top: host.scrollTop + scrollDelta,
        behavior: parallaxEnabled ? "smooth" : "instant",
      });
    };

    window.addEventListener("keydown", stopFollowingOnTab, true);
    host.addEventListener("focusin", scrollFocusedItemIntoView);
    return () => {
      window.removeEventListener("keydown", stopFollowingOnTab, true);
      host.removeEventListener("focusin", scrollFocusedItemIntoView);
      cancelAnimationFrame(clearTabNavigationFrame);
    };
  }, [parallaxEnabled]);

  useEffect(() => {
    if (!isInitialChatPositioned) return;

    const host = chatScrollRef.current;
    if (!host) return;

    let userScrollIntentTimeout: ReturnType<typeof setTimeout> | null = null;
    let previousScrollTop = host.scrollTop;
    const clearUserScrollIntent = () => {
      assistantUserScrollStartRef.current = null;
      if (userScrollIntentTimeout !== null) {
        clearTimeout(userScrollIntentTimeout);
        userScrollIntentTimeout = null;
      }
    };
    const syncReplyOverflow = () => {
      const spacer = host.querySelector<HTMLElement>("[data-chat-tail-spacer]");
      if (!spacer) return;
      updateTailSpacer(host);
      if (
        assistantReplyActiveRef.current &&
        !assistantReplyOverflowedRef.current &&
        (Number.parseFloat(spacer.style.height) || 0) <= 1
      ) {
        assistantReplyOverflowedRef.current = true;
        shouldStickToLatestTurnRef.current = false;
      }
    };
    const stick = () => {
      updateTailSpacer(host);
      syncReplyOverflow();
      if (
        shouldStickToLatestTurnRef.current &&
        !nativeSmoothScrollCleanupRef.current
      ) {
        clearUserScrollIntent();
        scrollToLatestTurn("instant", host);
      }
    };
    const resizeObserver = new ResizeObserver(stick);
    const virtualSizeObserver = new MutationObserver(() => {
      updateTailSpacer();
      stick();
    });
    const observeTargets = () => {
      resizeObserver.disconnect();
      virtualSizeObserver.disconnect();
      resizeObserver.observe(host);
      for (const child of host.querySelectorAll<HTMLElement>(
        "[data-chat-last-turn], [data-chat-tail-spacer]",
      )) {
        resizeObserver.observe(child);
      }
      const lastTurn = host.querySelector<HTMLElement>("[data-chat-last-turn]");
      const spacer = host.querySelector<HTMLElement>("[data-chat-tail-spacer]");
      let container = spacer?.previousElementSibling;
      while (container && lastTurn && !container.contains(lastTurn)) {
        container = container.previousElementSibling;
      }
      if (lastTurn && container) {
        resizeObserver.observe(container);
        virtualSizeObserver.observe(container, {
          attributes: true,
          attributeFilter: ["style"],
        });
      }
    };
    observeTargets();

    const mutationObserver = new MutationObserver(() => {
      observeTargets();
      stick();
    });
    mutationObserver.observe(host, { childList: true, subtree: true });

    const handleScroll = () => {
      const viewport = host;
      const currentScrollTop = viewport.scrollTop;
      const didScrollDown = currentScrollTop > previousScrollTop + 1;
      if (assistantReplyActiveRef.current) {
        syncReplyOverflow();
      }
      const didUserScroll =
        assistantUserScrollStartRef.current !== null &&
        Math.abs(currentScrollTop - previousScrollTop) > 1;
      if (didUserScroll) {
        clearUserScrollIntent();
        if (!assistantReplyActiveRef.current) {
          shouldStickToLatestTurnRef.current = false;
        } else if (!assistantReplyOverflowedRef.current) {
          shouldStickToLatestTurnRef.current = false;
        } else if (assistantReplyOverflowedRef.current) {
          const maxScrollTop = Math.max(
            viewport.scrollHeight - viewport.clientHeight,
            0,
          );
          shouldStickToLatestTurnRef.current =
            didScrollDown &&
            maxScrollTop - currentScrollTop <= getScrollFadeSize(viewport);
        }
      }
      previousScrollTop = currentScrollTop;
      const target = getChatScrollTarget(
        viewport,
        assistantReplyActiveRef.current,
      );
      if (
        shouldStickToLatestTurnRef.current &&
        !nativeSmoothScrollCleanupRef.current &&
        Math.abs(target - viewport.scrollTop) > 1
      ) {
        stick();
      }
    };
    host.addEventListener("scroll", handleScroll, true);
    const userEvents = [
      "wheel",
      "touchstart",
      "touchmove",
      "pointerdown",
      "pointermove",
      "keydown",
    ] as const;
    const markUserScrollIntent = (event: Event) => {
      if (
        event instanceof PointerEvent &&
        event.type === "pointermove" &&
        event.buttons === 0
      ) {
        return;
      }
      if (
        event instanceof KeyboardEvent &&
        ![
          "ArrowDown",
          "ArrowUp",
          "End",
          "Home",
          "PageDown",
          "PageUp",
          " ",
        ].includes(event.key)
      ) {
        return;
      }
      const maxScrollTop = Math.max(host.scrollHeight - host.clientHeight, 0);
      const isScrollDownIntent =
        (event instanceof WheelEvent && event.deltaY > 0) ||
        (event instanceof KeyboardEvent &&
          ["ArrowDown", "End", "PageDown", " "].includes(event.key));
      const isScrollUpIntent =
        (event instanceof WheelEvent && event.deltaY < 0) ||
        (event instanceof KeyboardEvent &&
          ["ArrowUp", "Home", "PageUp"].includes(event.key));
      if (
        assistantReplyActiveRef.current &&
        assistantReplyOverflowedRef.current
      ) {
        if (isScrollUpIntent) {
          shouldStickToLatestTurnRef.current = false;
        } else if (
          isScrollDownIntent &&
          maxScrollTop - host.scrollTop <= getScrollFadeSize(host)
        ) {
          shouldStickToLatestTurnRef.current = true;
          clearUserScrollIntent();
          stick();
          return;
        }
      }
      assistantUserScrollStartRef.current = host.scrollTop;
      if (userScrollIntentTimeout !== null) {
        clearTimeout(userScrollIntentTimeout);
      }
      userScrollIntentTimeout = setTimeout(() => {
        assistantUserScrollStartRef.current = null;
        userScrollIntentTimeout = null;
      }, 250);
    };
    for (const type of userEvents) {
      host.addEventListener(type, markUserScrollIntent, {
        capture: true,
        passive: true,
      });
    }

    return () => {
      resizeObserver.disconnect();
      virtualSizeObserver.disconnect();
      mutationObserver.disconnect();
      host.removeEventListener("scroll", handleScroll, true);
      for (const type of userEvents) {
        host.removeEventListener(type, markUserScrollIntent, true);
      }
      if (userScrollIntentTimeout !== null) {
        clearTimeout(userScrollIntentTimeout);
      }
    };
  }, [isInitialChatPositioned, scrollToLatestTurn, updateTailSpacer]);

  //  ================================================================
  //    送信
  //  ================================================================

  const abortControllerRef = useRef<AbortController | null>(null);
  const submissionInProgressRef = useRef(false);

  const requestAssistantReply = useCallback(
    async (promptContent: string) => {
      assistantReplyActiveRef.current = true;
      assistantReplyOverflowedRef.current = false;
      assistantUserScrollStartRef.current = null;
      shouldStickToLatestTurnRef.current = false;
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
      streamedMessageIdsRef.current.add(assistantMessageId);
      setRevealingMessageId(assistantMessageId);
      const startedAt = serverNow();
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

        let summaryEpoch = await getChatPurgeEpoch();
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

              const nextSummary = {
                content: result.summary.slice(0, 12000),
                throughSequence:
                  batch.at(-1)?.sequence ?? summary.throughSequence,
              };
              if (await saveChatArchiveSummary(nextSummary, summaryEpoch)) {
                summary = nextSummary;
              } else {
                summaryEpoch = await getChatPurgeEpoch();
                summary = await getChatArchiveSummary();
              }
            }
          } catch (error) {
            if (controller.signal.aborted) throw error;

            console.warn(
              "Chat history summarization failed; continuing with recent history:",
              error,
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

        const attachments = latestMessage.attachments ?? [];
        const uploadedAttachments: {
          id: string;
          name: string;
          type: string;
        }[] = [];

        if (attachments.length > 0) {
          const uploadResponse = await fetch(`${apiUrl}/api/ask/uploads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: attachments.map(({ name, type }) => ({ name, type })),
            }),
            signal: controller.signal,
          });

          if (!uploadResponse.ok) {
            throw new Error(await readAssistantError(uploadResponse));
          }

          const { uploads } = (await uploadResponse.json()) as {
            uploads: {
              id: string;
              uploadUrl: string;
              contentType: string;
            }[];
          };

          for (const [index, attachment] of attachments.entries()) {
            const upload = uploads[index];
            if (!upload) {
              throw new Error("添付ファイルのアップロード先が不正です。");
            }

            const uploadResult = await fetch(upload.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": upload.contentType },
              body: attachment.blob,
              signal: controller.signal,
            });
            if (!uploadResult.ok) {
              throw new Error(
                "添付ファイルをR2にアップロードできませんでした。",
              );
            }

            uploadedAttachments.push({
              id: upload.id,
              name: attachment.name,
              type: upload.contentType,
            });
          }
        }

        const response = await fetch(`${apiUrl}/api/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptContent,
            summary: summary.content,
            history: recentHistory,
            files: uploadedAttachments,
          }),
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
        await appendQueuedMessage({
          id: assistantMessageId,
          role: "assistant",
          content: reply,
          timestamp: serverNow(),
          duration: serverNow() - startedAt,
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
          timestamp: serverNow(),
          duration: serverNow() - startedAt,
          notice: isUserCancelled
            ? { kind: "cancelled", text: CANCELLED_NOTICE_TEXT }
            : { kind: "error", text: errorMessage },
        };
        if (!assistantMessagePersisted) {
          const persistFailedMessage = async () => {
            try {
              await appendQueuedMessage(failedMessage);
              await refreshVisibleArchivePage();
            } catch (archiveFailure) {
              console.error(
                "Failed to persist assistant error:",
                archiveFailure,
              );
              finishRevealingMessage(assistantMessageId);
            }
          };

          if (isUserCancelled) {
            void persistFailedMessage();
          } else {
            await persistFailedMessage();
          }
        }
        if (!reply.trim()) finishRevealingMessage(assistantMessageId);
        setStreamingMessage(null);
      } finally {
        clearTimeout(timeoutId);
        assistantReplyActiveRef.current = false;
        assistantReplyOverflowedRef.current = false;
        assistantUserScrollStartRef.current = null;
        shouldStickToLatestTurnRef.current = false;
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [appendQueuedMessage, finishRevealingMessage, refreshVisibleArchivePage],
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort(USER_CANCEL_REASON);
  }, []);

  const handleSubmit = async (e?: SyntheticEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const userPrompt = (
      editorRef.current ? getEditableText(editorRef.current) : value
    ).trim();
    if (
      (!userPrompt && files.length === 0) ||
      isLoading ||
      submissionInProgressRef.current ||
      !archiveReady
    ) {
      return;
    }

    submissionInProgressRef.current = true;
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
      timestamp: serverNow(),
    };

    try {
      try {
        await appendQueuedMessage(newUserMessage);
        await refreshVisibleArchivePage("smooth");
      } catch (error) {
        console.error("User message persistence failed:", error);
        return;
      }

      setValue("");
      if (editorRef.current) editorRef.current.innerText = "";
      if (isMobile) editorRef.current?.blur();
      setIsAdjusted(false);
      setIsScrollable(false);
      collapseComposer();
      setFiles([]);

      if (typeof window !== "undefined" && !navigator.onLine) {
        try {
          await appendQueuedMessage({
            id: `${userMessageId}-error`,
            role: "assistant",
            content: "",
            notice: {
              kind: "error",
              text: "ネットワークに接続されていないため、接続環境を確認してください。",
            },
            timestamp: serverNow(),
          });
          await refreshVisibleArchivePage("smooth");
        } catch (error) {
          console.error("Offline message persistence failed:", error);
        }
        return;
      }

      await requestAssistantReply(userPrompt);
    } finally {
      submissionInProgressRef.current = false;
    }
  };

  const appendPromptAtLatest = useCallback(
    async (message: Message) => {
      if (!archiveReady || isLoading || submissionInProgressRef.current) {
        return;
      }

      submissionInProgressRef.current = true;
      try {
        await appendQueuedMessage(message);
        await refreshVisibleArchivePage("smooth");
        await requestAssistantReply(message.content);
      } catch (error) {
        console.error("Appending a prompt to chat history failed:", error);
      } finally {
        submissionInProgressRef.current = false;
      }
    },
    [
      appendQueuedMessage,
      archiveReady,
      isLoading,
      refreshVisibleArchivePage,
      requestAssistantReply,
    ],
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
        timestamp: serverNow(),
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
        timestamp: serverNow(),
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
    const scrollContainer = scrollRef.current;

    if (!editor) return;
    const currentScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const isAtBottom = scrollContainer
      ? scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight <
        18
      : false;

    if (singleLineRef.current === 0) {
      const measurement = editor.cloneNode(false) as HTMLDivElement;
      measurement.removeAttribute("id");
      measurement.setAttribute("aria-hidden", "true");
      measurement.contentEditable = "false";
      measurement.textContent = "A";
      measurement.style.position = "absolute";
      measurement.style.left = "-10000px";
      measurement.style.top = "0";
      measurement.style.visibility = "hidden";
      measurement.style.height = "auto";
      measurement.style.maxHeight = "none";
      measurement.style.width = `${editor.getBoundingClientRect().width}px`;
      editor.after(measurement);
      singleLineRef.current = measurement.scrollHeight;
      measurement.remove();
    }

    if (!isAdjusted) {
      singleLineWidthRef.current = editor.getBoundingClientRect().width;
    }

    const editorWidth = editor.getBoundingClientRect().width;
    const measurement = editor.cloneNode(true) as HTMLDivElement;
    measurement.removeAttribute("id");
    measurement.setAttribute("aria-hidden", "true");
    measurement.contentEditable = "false";
    measurement.style.position = "absolute";
    measurement.style.left = "-10000px";
    measurement.style.top = "0";
    measurement.style.visibility = "hidden";
    measurement.style.height = "auto";
    measurement.style.maxHeight = "none";
    measurement.style.width = `${
      isAdjusted && singleLineWidthRef.current > 0
        ? singleLineWidthRef.current
        : editorWidth
    }px`;
    editor.after(measurement);

    const checkHeight = measurement.scrollHeight;
    measurement.style.width = `${editorWidth}px`;
    const nextHeight = Math.max(
      singleLineRef.current,
      measurement.scrollHeight,
    );
    measurement.remove();

    const nextIsAdjusted = checkHeight > singleLineRef.current;

    if (nextIsAdjusted !== isAdjusted) {
      setIsAdjusted(nextIsAdjusted);
    }
    editor.style.height = `${nextHeight}px`;

    const MAX_LINES = 5;
    const maxScrollHeight = singleLineRef.current * MAX_LINES;
    const nextIsScrollable = nextHeight >= maxScrollHeight;

    if (nextIsScrollable !== isScrollable) {
      setIsScrollable(nextIsScrollable);
    }

    if (!nextIsScrollable && isExpanded) {
      collapseComposer();
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
  }, [collapseComposer, isAdjusted, isScrollable, isExpanded, scrollRef]);

  useLayoutEffect(() => {
    if (value === undefined) return;

    calcTextarea();
  }, [value, calcTextarea]);

  useEffect(() => {
    if (!editorRef.current) return;

    if (value === "") {
      if (
        document.activeElement !== editorRef.current &&
        editorRef.current.innerText !== ""
      ) {
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

    const viewportEl = scrollRef.current;

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

  const { elementRef: filesScrollRef } = useNativeScroll<HTMLDivElement>(
    {
      axis: "x",
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
  //    キーボードショートカット
  //  ================================================================

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.nativeEvent.isComposing ||
      isComposingRef.current ||
      e.keyCode === 229
    )
      return;

    if (e.key === "Enter" && !hasInput) {
      e.preventDefault();
      return;
    }

    if (isMobile) return;

    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
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
          if (editorRef.current) editorRef.current.innerText = "";
          collapseComposer();

          editorRef.current?.focus();

          return;
        }

        if (e.code === "Space") {
          e.preventDefault();
          if (isScrollable || isExpanded) {
            captureCaretPosition();
            toggleComposerExpanded();
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
    toggleComposerExpanded,
    collapseComposer,
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
    collapseComposer();

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
        if (!currentTurn || message.role === "user") {
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
  const visibleStreamingMessage =
    streamingMessage &&
    !messages.some((message) => message.id === streamingMessage.id)
      ? streamingMessage
      : null;
  const loadingMessage = (
    <motion.div
      key="assistant-responding"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={TRANSITION}
      className="p-4 cursor-wait"
    >
      <output aria-label="Responding to the message">
        <Loader aria-hidden="true" className="animate-spin" />
      </output>
    </motion.div>
  );

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        {isDragOver && (
          <motion.div
            key="drag-over"
            initial={{ opacity: 0, backdropFilter: "blur(0)" }}
            animate={{ opacity: 1, backdropFilter: "blur(1rem)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0)" }}
            transition={TRANSITION}
            className="transparency-effect fixed inset-0 p-2 bg-back-0/50 z-1000 pointer-events-none flex items-center justify-center"
          >
            <div className="animate-pulse flex flex-col gap-2 items-center justify-center size-full border-2 border-dashed border-fore-1 rounded-4xl">
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

      <AnimatePresence initial={false}>
        {!isInitialChatPositioned && (
          <motion.output
            key="chat-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="fixed inset-0 flex items-center justify-center cursor-wait"
            aria-label="Loading Chat"
          >
            <Loader aria-hidden="true" className="animate-spin" />
          </motion.output>
        )}
      </AnimatePresence>

      <motion.div
        key="chat-container"
        initial={false}
        animate={{ opacity: isInitialChatPositioned ? 1 : 0 }}
        transition={TRANSITION}
        style={{
          visibility: isInitialChatPositioned ? "visible" : "hidden",
        }}
        className="size-full flex flex-col p-4 items-center max-w-3xl justify-center gap-4"
      >
        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            {messages.length === 0 && !isExpanded && (
              <motion.div
                key="chat-title"
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
                  key="chat-title-image"
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
                  key="chat-title-text"
                  layout="position"
                  transition={TRANSITION}
                  className="text-center text-3xl text-fore-1"
                >
                  何でも訊いてみてね！
                </motion.h1>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            key="chat-area"
            animate={{ opacity: isExpanded ? 0 : 1 }}
            transition={TRANSITION}
            className={`size-full min-h-0 ${messages.length === 0 && !isExpanded ? "hidden" : ""}`}
            aria-hidden={isExpanded || (messages.length === 0 && !isExpanded)}
            inert={isExpanded || (messages.length === 0 && !isExpanded)}
          >
            <ScrollArea
              scrollRef={chatScrollRef}
              scroll={{
                axis: "y",
                scrollBehavior: parallaxEnabled ? "smooth" : "auto",
                onEdgeClick: (edge) => {
                  if (edge !== "bottom" || !assistantReplyActiveRef.current) {
                    return false;
                  }
                  shouldStickToLatestTurnRef.current = true;
                  assistantUserScrollStartRef.current = null;
                  scrollToLatestTurn("smooth");
                  return true;
                },
                onInit: (viewport) => {
                  const previousOverflowAnchor = viewport.style.overflowAnchor;
                  viewport.style.overflowAnchor = "none";
                  if (archiveReady) {
                    scrollToLatestTurn("instant", viewport);
                  }
                  return () => {
                    viewport.style.overflowAnchor = previousOverflowAnchor;
                  };
                },
              }}
              scrollDeps={[archiveReady]}
              className={`size-full ${
                isLoading
                  ? visibleStreamingMessage?.content
                    ? "cursor-progress"
                    : "cursor-wait"
                  : ""
              } ${isExpanded ? "pointer-events-none" : ""}`}
              style={{
                visibility: isInitialChatPositioned ? "visible" : "hidden",
              }}
              virtual
              items={messageTurns}
              virtualConfig={{
                bufferSize: 4000,
                itemSize: 400,
                shift: isPrependingHistory,
                keepMounted: chatKeepMounted,
              }}
              header={
                <AnimatePresence mode="popLayout" initial={false}>
                  {archiveReady && hasOlderMessages && (
                    <motion.div
                      key="load-older-messages"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={TRANSITION}
                      className="flex w-full justify-center items-center p-2"
                    >
                      <Button
                        onPress={showOlderMessages}
                        isDisabled={isLoadingOlderMessages}
                        aria-label="Load Older Messages"
                        className="w-full text-xs text-fore-5 p-2 border border-dotted border-back-5 rounded-4xl"
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
                          "続きを読み込む"
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
                    transition={TRANSITION}
                    data-chat-last-turn={isLastTurn ? "" : undefined}
                    className={`flex flex-col gap-4 ${isLastTurn ? "" : "pb-8"}`}
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      {(isLastTurn && visibleStreamingMessage
                        ? [...turn, visibleStreamingMessage]
                        : turn
                      ).map((msg) => {
                        const isEditing = editingMessageId === msg.id;
                        const isUser = msg.role === "user";
                        const isAssistant = msg.role === "assistant";
                        const isStreaming =
                          msg.id === visibleStreamingMessage?.id;

                        return (
                          <motion.div
                            key={msg.id}
                            data-chat-message-id={msg.id}
                            data-scroll-fade-top-anchor=""
                            initial={
                              !isStreaming &&
                              streamedMessageIdsRef.current.has(msg.id)
                                ? false
                                : { opacity: 0 }
                            }
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={TRANSITION}
                            className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
                          >
                            {isUser &&
                              !isEditing &&
                              !!msg.attachments?.length && (
                                <MessageAttachments
                                  attachments={msg.attachments}
                                />
                              )}

                            {(isEditing || !isUser || msg.content.trim()) && (
                              <div
                                className={`**:select-text min-w-0 max-w-full ${isUser ? "bg-back-2 px-6 py-4 rounded-4xl rounded-tr-none" : "w-full"}`}
                              >
                                {isEditing ? (
                                  <motion.div
                                    ref={editingRef}
                                    onInput={(e) => {
                                      setEditingValue(
                                        getEditableText(e.currentTarget),
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
                                    className="outline-none whitespace-pre-wrap"
                                  />
                                ) : msg.content ? (
                                  <ChatMarkdown
                                    messageId={msg.id}
                                    content={msg.content}
                                    isAnimating={
                                      isAssistant &&
                                      msg.id === streamingMessage?.id
                                    }
                                    animateNewContent={
                                      isAssistant &&
                                      streamedMessageIdsRef.current.has(msg.id)
                                    }
                                    motionEnabled={
                                      isAssistant && parallaxEnabled
                                    }
                                    revealPosition={revealPositionRef}
                                    onRevealComplete={finishRevealingMessage}
                                  />
                                ) : isStreaming ? (
                                  loadingMessage
                                ) : null}
                              </div>
                            )}

                            {isAssistant &&
                              !isStreaming &&
                              (msg.notice || !msg.content) && (
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
                                    isDisabled={
                                      !editingValue.trim() || isLoading
                                    }
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
                              </div>
                            )}

                            {isAssistant && (!isStreaming || msg.content) && (
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
                {!isLoading &&
                  !revealingMessageId &&
                  messages.at(-1)?.role === "assistant" && (
                    <motion.div
                      key="assistant-disclaimer"
                      data-chat-disclaimer=""
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={TRANSITION}
                      className="py-2"
                    >
                      <p className="select-text text-xs text-fore-5 p-2 border border-dashed border-back-5 rounded-lg">
                        ⚠
                        回答はAIによって書かれているため、間違いを含んでいることがあります。十分に注意した上でご利用ください。
                      </p>
                      <p className="select-text text-xs text-yellow p-2 border border-dashed border-yellow rounded-lg mt-2">
                        現在アカウントに未接続であるため、試用版が適用されています。そのため、チャットに対して大幅な制限が発生しています。アカウントに接続すると無料版が適用され、制限が緩和されます。
                      </p>
                    </motion.div>
                  )}
              </AnimatePresence>
              <div data-chat-tail-spacer aria-hidden="true" />
            </ScrollArea>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            ref={formRef}
            key="form-area"
            layout
            transition={TRANSITION}
            className={`flex-none grid gap-1 w-full items-center border border-back-5 shadow-lg bg-back-1 p-2 overflow-clip rounded-4xl
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

                  <Menu.Content
                    triggerRef={formRef}
                    placement="top start"
                    offset={8}
                  >
                    {isMobile ? (
                      <Menu.Section className="grid grid-cols-2 gap-2">
                        <Menu.Item
                          icon={<Paperclip />}
                          className="h-20 flex flex-col justify-center items-center"
                          onAction={() => fileInputRef.current?.click()}
                        >
                          ファイル
                        </Menu.Item>
                        <Menu.Item
                          icon={<Camera />}
                          className="h-20 flex flex-col justify-center items-center"
                          onAction={() => cameraInputRef.current?.click()}
                        >
                          カメラ
                        </Menu.Item>
                      </Menu.Section>
                    ) : (
                      <>
                        <Menu.Item
                          icon={<Paperclip />}
                          shortcut="Ctrl+Shift+Alt+U"
                          onAction={() => fileInputRef.current?.click()}
                        >
                          ファイルを添付
                        </Menu.Item>
                        <Menu.Item
                          onAction={handleTakeScreenshot}
                          icon={<Camera />}
                        >
                          スクリーンショットを撮影
                        </Menu.Item>
                      </>
                    )}

                    <Menu.Separator />

                    <Menu.SubmenuTrigger>
                      <Menu.Item icon={<Folder />}>
                        プロジェクトに追加
                      </Menu.Item>
                      <Menu.Content mobileSheet={false}>
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
            <input
              onChange={handleFileInputChange}
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
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
                        return (
                          <motion.div
                            key={id}
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={TRANSITION}
                            className={`group ${FILE_TILE_CLASS} focus-within:border-2 focus-within:border-fore-1`}
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
                                <FilePreview
                                  name={file.name}
                                  type={file.type}
                                  url={filePreviewUrls[fileIndex]}
                                />
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
              className={`relative w-full min-w-0 flex flex-col justify-start items-start ${isExpanded ? "h-full" : "[--scroll-fade-size:2.5rem]"}
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
                    const rawText = getEditableText(e.currentTarget);
                    setValue(rawText.trim() ? rawText : "");
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
                  className="block outline-none overflow-y-clip resize-none w-full min-w-0 wrap-anywhere whitespace-pre-wrap"
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
                        toggleComposerExpanded();
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
      </motion.div>
    </>
  );
}
