"use client";
import type { ReactNode } from "react";
import {
    Tooltip as RACTooltip,
    type TooltipProps as RACTooltipProps,
    TooltipTrigger,
} from "react-aria-components";

export interface TooltipProps extends Omit<RACTooltipProps, "children"> {
    children: ReactNode;
    content: ReactNode;
    delay?: number;
    closeDelay?: number;
}

export function Tooltip({
    children,
    content,
    placement = "bottom",
    offset = 8,
    delay = 250,
    closeDelay = 250,
    ...props
}: TooltipProps) {
    return (
        <TooltipTrigger delay={delay} closeDelay={closeDelay}>
            {children}

            <RACTooltip
                placement={placement}
                offset={offset}
                {...props}
                className={({ isEntering, isExiting }) => `
                rounded-full bg-fore-1 px-2 py-1 text-xs font-medium text-center font-sans-serif text-back-1 shadow-lg all duration-250 pointer-events-none overflow-clip
                ${isExiting
                        ? "opacity-0 scale-100"
                        : isEntering
                            ? "opacity-0 scale-100"
                            : "opacity-100 scale-100"
                    }
                `}
            >
                {content}
            </RACTooltip>
        </TooltipTrigger>
    );
}