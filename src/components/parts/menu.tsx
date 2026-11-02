"use client";
import { Check, ChevronRight } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import {
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
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

type MenuTriggerProps = AriaMenuTriggerProps;

function Trigger(props: MenuTriggerProps) {
  return <AriaMenuTrigger {...props} />;
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
  const [exitDone, setExitDone] = useState(true);
  const isMobile = useIsMobile();
  const dragControls = useDragControls();

  useEffect(() => {
    if (isOpen) setExitDone(false);
  }, [isOpen]);

  const menu = (
    <AriaMenu
      {...menuProps}
      className={cn(
        "flex max-h-[inherit] flex-col gap-0.5 overflow-y-auto outline-none",
        className,
      )}
    />
  );

  if (isMobile && mobileSheet) {
    return (
      <AriaModalOverlay
        isDismissable
        isExiting={!isOpen && !exitDone}
        className={cn(
          "fixed inset-0 z-50 flex items-end all",
          isOpen ? "bg-back-0/50" : "bg-transparent",
        )}
      >
        <AriaModal className="w-full outline-none">
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: isOpen ? 0 : "100%" }}
            transition={TRANSITION}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragEnd={(_, { offset: dragOffset, velocity }) => {
              if (
                dragOffset.y > DISMISS_DISTANCE ||
                velocity.y > DISMISS_VELOCITY
              ) {
                state?.close();
              }
            }}
            onAnimationComplete={() => {
              if (!isOpen) setExitDone(true);
            }}
            className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl border-t border-back-5 bg-back-1 shadow-lg outline-none"
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex flex-none cursor-grab touch-none justify-center py-3"
            >
              <div className="h-1 w-15 rounded-full bg-back-5" />
            </div>

            <div className="min-h-0 overflow-y-auto px-2 pb-2">{menu}</div>
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
      isExiting={!isOpen && !exitDone}
      className={cn("outline-none", popoverClassName)}
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
            onAnimationComplete={() => {
              if (!isOpen) setExitDone(true);
            }}
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
