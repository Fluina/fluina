"use client";
import type { ReactNode } from "react";
import {
    Tooltip as RACTooltip,
    type TooltipProps as RACTooltipProps,
    TooltipTrigger,
} from "react-aria-components";
import { useOS } from "@/lib/os";

export type ShortcutSpec = {
    mac?: string[];
    windows: string[];
};

export interface TooltipProps extends Omit<RACTooltipProps, "children"> {
    children: ReactNode;
    content: ReactNode;
    shortcut?: ShortcutSpec;
    delay?: number;
    closeDelay?: number;
}

function getKeyRounding(index: number, total: number): string {
    if (total === 1) return "rounded-xl";
    if (index === 0) return "rounded-l-xl rounded-r-sm";
    if (index === total - 1) return "rounded-r-xl rounded-l-sm";
    return "rounded-xl";
}

export function Tooltip({
    children,
    content,
    shortcut,
    placement = "bottom",
    offset = 8,
    delay = 250,
    closeDelay = 250,
    ...props
}: TooltipProps) {
    const os = useOS();
    const resolvedKeys = shortcut
        ? os === "mac"
            ? (shortcut.mac ?? shortcut.windows)
            : shortcut.windows
        : undefined;

    return (
        <TooltipTrigger delay={delay} closeDelay={closeDelay}>
            {children}

            <RACTooltip
                placement={placement}
                offset={offset}
                {...props}
                className={({ isEntering, isExiting }) => `
                rounded-full bg-fore-1 p-1 shadow-lg all duration-250 pointer-events-none overflow-clip
                ${isExiting
                        ? "opacity-0 scale-100"
                        : isEntering
                            ? "opacity-0 scale-100"
                            : "opacity-100 scale-100"
                    }
                `}
            >
                <span className="flex justify-center items-center">
                    <span className="whitespace-nowrap text-sm px-1 font-medium text-center font-sans-serif text-back-1">{content}</span>

                    {resolvedKeys && resolvedKeys.length > 0 && (
                        <kbd className="flex justify-center items-center gap-0.5">
                            {resolvedKeys.map((key, index) => (
                                <kbd
                                    key={key}
                                    className={`${getKeyRounding(index, resolvedKeys.length)} whitespace-nowrap bg-fore-5/50 px-1 py-0.5 text-xs font-medium text-center font-sans-serif text-back-5`}
                                >
                                    {key}
                                </kbd>
                            ))}
                        </kbd >
                    )}
                </span>
            </RACTooltip>
        </TooltipTrigger>
    );
}