"use client";
import { Check, ChevronRight } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
    Menu as AriaMenu,
    MenuItem as AriaMenuItem,
    MenuSection as AriaMenuSection,
    MenuTrigger as AriaMenuTrigger,
    Popover as AriaPopover,
    Separator as AriaSeparator,
    SubmenuTrigger as AriaSubmenuTrigger,
    Header,
    type MenuItemProps as AriaMenuItemProps,
    type MenuProps as AriaMenuProps,
    type MenuSectionProps as AriaMenuSectionProps,
    type MenuTriggerProps as AriaMenuTriggerProps,
    type PopoverProps as AriaPopoverProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";

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
    Pick<AriaPopoverProps, "placement" | "offset" | "crossOffset" | "className"> & {
        popoverClassName?: string;
    };

function Content<T extends object>({
    placement = "bottom start",
    offset = 8,
    crossOffset,
    className,
    popoverClassName,
    ...menuProps
}: MenuContentProps<T>) {
    return (
        <AriaPopover
            placement={placement}
            offset={offset}
            crossOffset={crossOffset}
            className={cn(
                "min-w-56 max-w-80 rounded-2xl border border-back-5 bg-back-2 p-1.5 shadow-lg outline-none all",
                "data-[placement=top]:origin-bottom data-[placement=bottom]:origin-top",
                "data-entering:opacity-0 data-entering:scale-95",
                "data-exiting:opacity-0 data-exiting:scale-95",
                popoverClassName,
            )}
        >
            <AriaMenu
                {...menuProps}
                className={cn(
                    "flex max-h-[inherit] flex-col gap-0.5 overflow-y-auto outline-none",
                    className,
                )}
            />
        </AriaPopover>
    );
}

const menuItemVariants = tv({
    base: [
        "relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 outline-none all",
        "text-sm font-sans-serif font-medium text-fore-1",
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
                        <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4 [&>svg]:text-fore-9">
                            {icon}
                        </span>
                    )}

                    <span className="flex-1 truncate text-left">
                        {typeof children === "function" ? children(renderProps) : children}
                    </span>

                    {renderProps.selectionMode !== "none" ? (
                        renderProps.isSelected && (
                            <Check className="size-4 shrink-0 text-blue" />
                        )
                    ) : shortcut ? (
                        <span className="shrink-0 text-xs font-sans-serif text-fore-9">
                            {shortcut}
                        </span>
                    ) : hasSubmenu ? (
                        <ChevronRight className="size-4 shrink-0 text-fore-9" />
                    ) : null}
                </>
            )}
        </AriaMenuItem>
    );
}

function Separator({ className }: { className?: string }) {
    return (
        <AriaSeparator className={cn("my-1 h-px shrink-0 bg-back-5", className)} />
    );
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
                <Header className="px-2.5 pb-1 pt-2 text-xs font-sans-serif font-medium text-fore-9">
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