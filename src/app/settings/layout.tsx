"use client";
import {
    Bell,
    CircleUserRound,
    CreditCard,
    Hourglass,
    Info,
    Search,
    Settings,
    ShieldLock,
    SunMoon,
    ToolCase,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/parts";
import { TRANSITION } from "@/lib/motion";
import { useOverlayScroll } from "@/lib/overlayscrollbars";

const settingsItems = {
    title: "システム",
    items: [
        { id: "environment", icon: Settings, label: "環境" },
        { id: "features", icon: ToolCase, label: "機能" },
        { id: "billing", icon: CreditCard, label: "請求" },
        { id: "notifications", icon: Bell, label: "通知" },
        { id: "privacy", icon: ShieldLock, label: "プライバシー" },
        { id: "limits", icon: Hourglass, label: "制限" },
        { id: "appearance", icon: SunMoon, label: "反映" },
        { id: "about", icon: Info, label: "情報" },
    ],
} as const;

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
    const pathname = usePathname();
    const router = useRouter();
    const { elementRef: sidebarScrollRef } = useOverlayScroll<HTMLDivElement>({
        axis: "y",
    });
    const { elementRef: contentScrollRef } = useOverlayScroll<HTMLDivElement>({
        axis: "y",
    });
    const settingsNavigationRef = useRef<HTMLDivElement>(null);
    const [hoveredButton, setHoveredButton] = useState<{
        x: number;
        y: number;
        width: number;
        height: number;
        scale: number;
    } | null>(null);
    const [isNavigationHovered, setIsNavigationHovered] = useState(false);
    const selectedSetting = pathname.split("/").pop() ?? "environment";

    const updateHoveredButton = (
        isHovered: boolean,
        button: HTMLButtonElement | null,
        data: {
            width: number;
            height: number;
            hoverScale: number;
        } | null,
    ) => {
        const navigation = settingsNavigationRef.current;
        if (!navigation || !isHovered || !button || !data) {
            setIsNavigationHovered(false);
            return;
        }

        const buttonRect = button.getBoundingClientRect();
        const navigationRect = navigation.getBoundingClientRect();
        setHoveredButton({
            x: buttonRect.left - navigationRect.left,
            y: buttonRect.top - navigationRect.top,
            width: data.width,
            height: data.height,
            scale: data.hoverScale,
        });
        setIsNavigationHovered(true);
    };

    return (
        <>
            <aside className="flex w-75 h-full flex-none flex-col gap-2 border-r border-back-5 p-2">
                <form className="flex h-10 w-full items-center justify-center">
                    <div className="size-full p-2">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute text-fore-9"
                        />

                        <input
                            spellCheck={false}
                            type="search"
                            placeholder="検索"
                            aria-label="Search"
                            className="border w-full h-10 border-back-5 outline-none placeholder:text-fore-9"
                        />
                    </div>
                </form>

                <div ref={sidebarScrollRef} className="size-full p-2">
                    <div className="flex flex-col gap-4">
                        <Button className="flex h-15 w-full flex-none flex-row items-center justify-left gap-4 bg-blue p-2">
                            <div className="relative z-10 flex items-center gap-4">
                                <CircleUserRound className="text-back-1_" />

                                <span className="text-back-1_">接続 / 登録</span>
                            </div>
                        </Button>

                        <div className="flex flex-col gap-2">
                            <p className="flex items-center gap-2 text-sm text-fore-9 after:h-px after:flex-1 after:colors after:bg-back-5">
                                {settingsItems.title}
                            </p>

                            <div
                                ref={settingsNavigationRef}
                                className="relative flex flex-col gap-4"
                                onPointerLeave={() => setIsNavigationHovered(false)}
                            >
                                <motion.div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute z-0 bg-back-3"
                                    initial={false}
                                    animate={
                                        hoveredButton
                                            ? {
                                                opacity: isNavigationHovered ? 1 : 0,
                                                x: hoveredButton.x,
                                                y: hoveredButton.y,
                                                width: hoveredButton.width,
                                                height: hoveredButton.height,
                                                scale: hoveredButton.scale,
                                            }
                                            : { opacity: 0 }
                                    }
                                    transition={TRANSITION}
                                />

                                <div className="flex flex-col items-center justify-center">
                                    {settingsItems.items.map(({ id, icon: Icon, label }) => (
                                        <Button
                                            key={id}
                                            onHoverChange={updateHoveredButton}
                                            onPress={() => router.push(`/settings/${id}`)}
                                            aria-pressed={selectedSetting === id}
                                            className={`flex h-12.5 w-full flex-row items-center justify-left gap-4 p-2 ${selectedSetting === id ? "bg-back-5" : "text-fore-5"}`}
                                        >
                                            <div className="relative z-10 flex items-center gap-4">
                                                <Icon />

                                                <span>{label}</span>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <main
                ref={contentScrollRef}
                className="size-full bg-back-2 p-4"
            >
                <div>
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={TRANSITION}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </>
    );
}
