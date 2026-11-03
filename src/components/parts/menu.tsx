"use client";
import { Check, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import {
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  MenuSection as AriaMenuSection,
  type MenuSectionProps as AriaMenuSectionProps,
  MenuTrigger as AriaMenuTrigger,
  type MenuTriggerProps as AriaMenuTriggerProps,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
  Separator as AriaSeparator,
  SubmenuTrigger as AriaSubmenuTrigger,
  Header,
  OverlayTriggerStateContext,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";
import { TRANSITION } from "@/lib/motion";

const TRANSITION_LOCK_MS = () => TRANSITION.duration * 1000 + 50;

type MenuTriggerProps = AriaMenuTriggerProps;

function Trigger({ onOpenChange, ...props }: MenuTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const lockedUntilRef = useRef(0);

  const handleOpenChange = (open: boolean) => {
    const now = performance.now();
    if (open === isOpen || now < lockedUntilRef.current) return;

    lockedUntilRef.current = now + TRANSITION_LOCK_MS();
    setIsOpen(open);
    onOpenChange?.(open);
  };

  return (
    <AriaMenuTrigger
      {...props}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
    />
  );
}

function SubmenuTrigger({
  children,
}: {
  children: [ReactElement, ReactElement];
}) {
  return <AriaSubmenuTrigger>{children}</AriaSubmenuTrigger>;
}

type MenuContentProps<T extends object> = AriaMenuProps<T> &
  Pick<
    AriaPopoverProps,
    "placement" | "offset" | "crossOffset" | "className" | "triggerRef"
  > & {
    popoverClassName?: string;
    mobileSheet?: boolean;
  };

const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(MOBILE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

const DISMISS_DISTANCE = 100;
const EXPAND_DISTANCE = 40;
const DISMISS_VELOCITY = 500;

function Content<T extends object>({
  placement = "bottom start",
  offset = 8,
  crossOffset,
  triggerRef,
  className,
  popoverClassName,
  mobileSheet = true,
  ...menuProps
}: MenuContentProps<T>) {
  const state = useContext(OverlayTriggerStateContext);
  const isOpen = state?.isOpen ?? false;
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [phase, setPhase] = useState<
    "closed" | "entering" | "open" | "exiting"
  >(isOpen ? "open" : "closed");
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = useIsMobile();

  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (!isOpen) setIsExpanded(false);
    setPhase(isOpen ? "entering" : "exiting");
  }

  const isExiting = phase === "exiting";
  const isInteractive = phase === "open" && !isDragging;

  useEffect(() => {
    if (phase !== "entering" && phase !== "exiting") return;
    const timer = setTimeout(
      () => setPhase(phase === "entering" ? "open" : "closed"),
      TRANSITION_LOCK_MS(),
    );
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // フォーカスがメニュー外(bodyなど)にある場合、react-aria が拾えないためここで閉じる
      const active = document.activeElement;
      if (active && active !== document.body && active.closest("[role=menu]")) {
        return;
      }
      state?.close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, state]);

  const menu = (
    <AriaMenu
      {...menuProps}
      className={cn(
        "flex max-h-[inherit] flex-col gap-0.5 overflow-y-auto outline-none",
        !isInteractive && "pointer-events-none",
        className,
      )}
    />
  );

  if (isMobile && mobileSheet) {
    return (
      <AriaModalOverlay
        isDismissable
        isExiting={isExiting}
        className={cn(
          "fixed inset-0 z-50 flex items-end",
          !isOpen && "pointer-events-none",
        )}
      >
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: isOpen ? 1 : 0 }}
          transition={TRANSITION}
          className="pointer-events-none absolute inset-0 bg-back-0/50"
        />
        <AriaModal
          className={cn(
            "relative z-10 w-full outline-none",
            !isOpen && "pointer-events-none",
          )}
        >
          <motion.div
            initial={{ y: "100%", height: "auto" }}
            animate={{
              y: isOpen ? 0 : "100%",
              height: isExpanded && isOpen ? "calc(100dvh - 1rem)" : "auto",
            }}
            transition={TRANSITION}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={(_, { offset: dragOffset, velocity }) => {
              setTimeout(() => setIsDragging(false), 0);
              const draggedDown =
                dragOffset.y > DISMISS_DISTANCE ||
                velocity.y > DISMISS_VELOCITY;
              const draggedUp =
                dragOffset.y < -EXPAND_DISTANCE ||
                velocity.y < -DISMISS_VELOCITY;
              if (draggedUp) {
                setIsExpanded(true);
              } else if (draggedDown) {
                if (isExpanded) setIsExpanded(false);
                else state?.close();
              }
            }}
            className={cn(
              "relative flex max-h-dvh w-full flex-col rounded-t-2xl border-t border-back-5 bg-back-1 shadow-lg outline-none",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-full h-dvh bg-back-1"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Switch menu height"
              className="group flex flex-none cursor-[inherit] justify-center py-3 outline-none"
              onDoubleClick={() => setIsExpanded((prev) => !prev)}
            >
              <div
                className={cn(
                  "h-1 w-15 rounded-full all",
                  isDragging
                    ? "bg-back-4 animate-pulse"
                    : "bg-back-5 group-hover:bg-back-6 group-active:bg-back-4",
                )}
              />
            </button>

            <div
              className={cn(
                "min-h-0 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]",
                isExpanded ? "overflow-y-auto" : "overflow-y-hidden",
              )}
            >
              {menu}
            </div>
          </motion.div>
        </AriaModal>
      </AriaModalOverlay>
    );
  }

  return (
    <AriaPopover
      placement={placement}
      offset={offset}
      crossOffset={crossOffset}
      triggerRef={triggerRef}
      isExiting={isExiting}
      className={cn(
        "outline-none",
        !isOpen && "pointer-events-none",
        popoverClassName,
      )}
    >
      {() => {
        const hidden = { opacity: 0, scale: 0.9, filter: "blur(0.1rem)" };

        return (
          <motion.div
            initial={hidden}
            animate={
              isOpen ? { opacity: 1, scale: 1, filter: "blur(0)" } : hidden
            }
            transition={TRANSITION}
            style={{ transformOrigin: "bottom left" }}
            className="min-w-56 max-w-80 rounded-2xl border border-back-5 bg-back-1 p-2 shadow-lg outline-none"
          >
            {menu}
          </motion.div>
        );
      }}
    </AriaPopover>
  );
}

const menuItemVariants = tv({
  base: [
    "relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 outline-none all",
    "text-sm text-fore-1",
    "data-hovered:bg-back-3 data-focus-visible:bg-back-3",
    "data-pressed:bg-back-4",
    "data-disabled:pointer-events-none data-disabled:opacity-40",
  ],
  variants: {
    destructive: {
      true: "text-red data-hovered:bg-red/10 data-focus-visible:bg-red/10 data-pressed:bg-red/15",
      false: "",
    },
  },
  defaultVariants: {
    destructive: false,
  },
});

type MenuItemProps = AriaMenuItemProps & {
  icon?: ReactNode;
  shortcut?: string;
  hasSubmenu?: boolean;
  destructive?: boolean;
};

function Item({
  icon,
  shortcut,
  hasSubmenu,
  destructive,
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <AriaMenuItem
      {...props}
      textValue={
        props.textValue ?? (typeof children === "string" ? children : undefined)
      }
      className={(renderProps) => {
        const resolvedClassName =
          typeof className === "function" ? className(renderProps) : className;

        return menuItemVariants({ destructive, className: resolvedClassName });
      }}
    >
      {(renderProps) => (
        <>
          {icon && (
            <span className="flex size-4 items-center justify-center [&>svg]:size-4 [&>svg]:text-fore-9">
              {icon}
            </span>
          )}

          <span className="flex-1 truncate text-left">
            {typeof children === "function" ? children(renderProps) : children}
          </span>

          {renderProps.selectionMode !== "none" ? (
            renderProps.isSelected && <Check className="size-4 text-blue" />
          ) : shortcut ? (
            <span className="text-xs text-fore-9">{shortcut}</span>
          ) : hasSubmenu ? (
            <ChevronRight className="size-4 text-fore-9" />
          ) : null}
        </>
      )}
    </AriaMenuItem>
  );
}

function Separator({ className }: { className?: string }) {
  return <AriaSeparator className={cn("my-1 h-px bg-back-5", className)} />;
}

type MenuSectionProps<T extends object> = Omit<
  AriaMenuSectionProps<T>,
  "children" | "title"
> & {
  title?: string;
  children: ReactNode;
};

function SectionGroup<T extends object>({
  title,
  className,
  children,
  ...props
}: MenuSectionProps<T>) {
  return (
    <AriaMenuSection
      {...props}
      className={cn("flex flex-col gap-0.5", className)}
    >
      {title && (
        <Header className="px-2.5 pb-1 pt-2 text-xs text-fore-9">
          {title}
        </Header>
      )}
      {children}
    </AriaMenuSection>
  );
}

export const Menu = {
  Trigger,
  SubmenuTrigger,
  Content,
  Item,
  Separator,
  Section: SectionGroup,
};
