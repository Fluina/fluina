import { createContext, forwardRef, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import {
  Button as RACButton,
  type ButtonProps as RACButtonProps,
  Header as RACHeader,
  type HeaderProps as RACHeaderProps,
  ListBox as RACListBox,
  type ListBoxProps as RACListBoxProps,
  ListBoxItem as RACListBoxItem,
  type ListBoxItemProps as RACListBoxItemProps,
  ListBoxSection as RACListBoxSection,
  type ListBoxSectionProps as RACListBoxSectionProps,
  Popover as RACPopover,
  type PopoverProps as RACPopoverProps,
  Select as RACSelect,
  type SelectProps as RACSelectProps,
  SelectStateContext as RACSelectStateContext,
  SelectValue as RACSelectValue,
  type SelectValueProps as RACSelectValueProps,
  Separator as RACSeparator,
  type SeparatorProps as RACSeparatorProps,
  composeRenderProps,
} from "react-aria-components";
import { cn } from "@/lib/cn";
import { TRANSITION } from "@/lib/motion";

const SelectMorphContext = createContext<{ groupId: string } | null>(null);

export interface SelectProps<T extends object> extends RACSelectProps<T> { }

export const Select = forwardRef(function Select<T extends object>(
  { className, children, ...props }: SelectProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const groupId = useId();

  return (
    <RACSelect
      {...props}
      ref={ref}
      className={composeRenderProps(className, (resolvedClassName, renderProps) =>
        cn(
          "group inline-flex flex-col gap-1.5",
          renderProps.isDisabled && "cursor-not-allowed opacity-50",
          resolvedClassName,
        ),
      )}
    >
      {(renderProps) => (
        <LayoutGroup id={groupId}>
          <SelectMorphContext.Provider value={{ groupId }}>
            {typeof children === "function" ? children(renderProps) : children}
          </SelectMorphContext.Provider>
        </LayoutGroup>
      )}
    </RACSelect>
  );
}) as (<T extends object>(
  props: SelectProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement) & { displayName?: string };

Select.displayName = "Select";

export interface SelectValueProps<T extends object>
  extends RACSelectValueProps<T> { }

export const SelectValue = <T extends object>({
  className,
  children,
  ...props
}: SelectValueProps<T>) => {
  const morphContext = useContext(SelectMorphContext);
  const selectState = useContext(RACSelectStateContext);
  const selectedKey = selectState?.selectedKey ?? null;

  return (
    <motion.span
      // selectedKey が変わるたびに要素を張り替え、対応する SelectItem 側の
      // 同じ layoutId から/へ FLIP アニメーションでモーフさせる
      layoutId={
        morphContext && selectedKey != null
          ? `${morphContext.groupId}-${selectedKey}`
          : undefined
      }
      // デバッグ用: 動作確認のため一時的に1.2秒へ引き延ばしている
      // (動作確認できたら transition={TRANSITION} に戻す)
      transition={{ duration: 1.2, ease: "easeInOut" }}
      className="inline-flex"
    >
      <RACSelectValue
        {...props}
        className={composeRenderProps(className, (resolvedClassName) =>
          cn("data-placeholder:text-fore-4 whitespace-nowrap", resolvedClassName),
        )}
      >
        {children}
      </RACSelectValue>
    </motion.span>
  );
};

SelectValue.displayName = "SelectValue";

export interface SelectTriggerProps extends RACButtonProps { }

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }: SelectTriggerProps, ref) => {
    const [width, setWidth] = useState<number | "auto">("auto");
    const contentRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
      const element = contentRef.current;
      if (!element) return;

      const buttonElement = element.closest("button");

      const observer = new ResizeObserver(() => {
        if (element && buttonElement) {
          const contentWidth = element.getBoundingClientRect().width;
          const style = window.getComputedStyle(buttonElement);
          const paddingLeft = parseFloat(style.paddingLeft) || 0;
          const paddingRight = parseFloat(style.paddingRight) || 0;
          const borderLeft = parseFloat(style.borderLeftWidth) || 0;
          const borderRight = parseFloat(style.borderRightWidth) || 0;
          const totalWidth = contentWidth + paddingLeft + paddingRight + borderLeft + borderRight;
          setWidth(totalWidth);
        }
      });

      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    return (
      <motion.div
        animate={{ width }}
        transition={TRANSITION}
        className="inline-flex overflow-hidden"
      >
        <RACButton
          {...props}
          ref={ref}
          className={composeRenderProps(className, (resolvedClassName, renderProps) =>
            cn(
              "group outline-none flex items-center justify-center border border-back-5 bg-back-1 px-4 py-2 cursor-pointer w-full whitespace-nowrap",
              "data-hovered:bg-back-3 data-focus-visible:ring-2 data-focus-visible:ring-fore-1",
              renderProps.isDisabled && "cursor-not-allowed opacity-50",
              renderProps.isPressed && "bg-back-2",
              resolvedClassName,
            ),
          )}
        >
          {(renderProps) => (
            <span ref={contentRef} className="inline-flex items-center">
              {typeof children === "function" ? children(renderProps) : children}
            </span>
          )}
        </RACButton>
      </motion.div>
    );
  },
);

SelectTrigger.displayName = "SelectTrigger";

export interface SelectPopoverProps extends RACPopoverProps { }

export const SelectPopover = forwardRef<HTMLElement, SelectPopoverProps>(
  ({ className, children, ...props }: SelectPopoverProps, ref) => {
    return (
      <RACPopover
        {...props}
        ref={ref}
        className={composeRenderProps(className, (resolvedClassName, renderProps) =>
          cn(
            "z-50 min-w-(--trigger-width) border border-back-5 bg-back-1 p-2 shadow-lg",
            renderProps.isEntering && "animate-in fade-in-0 zoom-in-95",
            renderProps.isExiting && "animate-out fade-out-0 zoom-out-95",
            resolvedClassName,
          ),
        )}
      >
        {children}
      </RACPopover>
    );
  },
);

SelectPopover.displayName = "SelectPopover";

const SelectListBoxContext = createContext<{ layoutId: string } | null>(null);

export interface SelectListBoxProps<T extends object>
  extends RACListBoxProps<T> { }

export const SelectListBox = forwardRef(function SelectListBox<
  T extends object,
>(
  { className, children, ...props }: SelectListBoxProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const layoutId = useId();

  return (
    <SelectListBoxContext.Provider value={{ layoutId }}>
      <RACListBox
        {...props}
        ref={ref}
        className={composeRenderProps(className, (resolvedClassName) =>
          cn(resolvedClassName),
        )}
      >
        {children}
      </RACListBox>
    </SelectListBoxContext.Provider>
  );
}) as (<T extends object>(
  props: SelectListBoxProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement) & { displayName?: string };

SelectListBox.displayName = "SelectListBox";

export interface SelectItemProps extends RACListBoxItemProps { }

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, id, textValue, ...props }, ref) => {
    const context = useContext(SelectListBoxContext);
    const hoverLayoutId = context?.layoutId ?? "select-item-hover";

    const morphContext = useContext(SelectMorphContext);

    return (
      <RACListBoxItem
        {...props}
        id={id}
        textValue={textValue ?? (typeof children === "string" ? children : undefined)}
        ref={ref}
        className={composeRenderProps(className, (resolvedClassName) =>
          cn(
            "group relative flex cursor-pointer outline-none items-center justify-center px-4 py-2",
            resolvedClassName,
          ),
        )}
      >
        {(renderProps) => {
          const isHoveredOrFocused =
            (renderProps.isHovered || renderProps.isFocused) &&
            !renderProps.isDisabled;

          // 選択中のアイテムだけ SelectValue と同じ layoutId を持たせることで、
          // 選択操作時にこのオプションがトリガー側の表示位置までモーフする
          const valueLayoutId =
            renderProps.isSelected && morphContext && id != null
              ? `${morphContext.groupId}-${id}`
              : undefined;

          return (
            <>
              {isHoveredOrFocused && (
                <motion.div
                  layoutId={hoverLayoutId}
                  className="absolute inset-0 z-0 bg-back-3"
                  transition={TRANSITION}
                />
              )}

              <motion.span
                layoutId={valueLayoutId}
                // デバッグ用: 動作確認のため一時的に1.2秒へ引き延ばしている
                transition={{ duration: 1.2, ease: "easeInOut" }}
                className="relative z-10 flex w-full items-center"
              >
                {typeof children === "function"
                  ? children(renderProps)
                  : children}
              </motion.span>
            </>
          );
        }}
      </RACListBoxItem>
    );
  },
);

SelectItem.displayName = "SelectItem";

export interface SelectHeaderProps extends RACHeaderProps { }

export const SelectHeader = forwardRef<HTMLElement, SelectHeaderProps>(
  ({ className, ...props }: SelectHeaderProps, ref) => {
    return (
      <RACHeader
        {...props}
        ref={ref}
        className={cn(
          "px-2 py-1 text-xs text-fore-3",
          className,
        )}
      />
    );
  },
);

SelectHeader.displayName = "SelectHeader";

export interface SelectSectionProps<T extends object>
  extends RACListBoxSectionProps<T> { }

export const SelectSection = RACListBoxSection;

export interface SelectSeparatorProps extends RACSeparatorProps { }

export const SelectSeparator = forwardRef<
  HTMLDivElement,
  SelectSeparatorProps
>(({ className, ...props }: SelectSeparatorProps, ref) => {
  return (
    <RACSeparator
      {...props}
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-back-4", className)}
    />
  );
});

SelectSeparator.displayName = "SelectSeparator";