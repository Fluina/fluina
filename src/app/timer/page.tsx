"use client";

import {
    Check,
    ChevronRight,
    Flag,
    Pause,
    Play,
    RotateCcw,
    Shield,
    Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/parts";

const PRESETS = [5, 15, 25, 50];

type TimerMode = "ready" | "focus" | "overtime" | "resting";

const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

export default function Timer() {
    const [selectedMinutes, setSelectedMinutes] = useState(25);
    const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
    const [overtimeSeconds, setOvertimeSeconds] = useState(0);
    const [restSeconds, setRestSeconds] = useState(0);
    const [mode, setMode] = useState<TimerMode>("ready");
    const [isRunning, setIsRunning] = useState(false);

    const totalSeconds = selectedMinutes * 60;
    const workedSeconds =
        mode === "overtime"
            ? totalSeconds + overtimeSeconds
            : totalSeconds - remainingSeconds;
    const checkpointSeconds = Math.max(60, Math.ceil(totalSeconds / 3));
    const checkpointsReached = Math.min(
        3,
        Math.floor(workedSeconds / checkpointSeconds),
    );
    const routeProgress = Math.min(100, (workedSeconds / totalSeconds) * 100);
    const displaySeconds = mode === "resting" ? restSeconds : remainingSeconds;
    const progress = useMemo(
        () => {
            if (mode === "overtime") return 1;
            if (mode === "resting") return restSeconds > 0 ? restSeconds / (restSeconds + workedSeconds / 5) : 0;
            return totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
        },
        [mode, remainingSeconds, restSeconds, totalSeconds, workedSeconds],
    );

    useEffect(() => {
        if (!isRunning) return;

        const intervalId = window.setInterval(() => {
            if (mode === "focus") {
                setRemainingSeconds((current) => {
                    if (current <= 1) {
                        setMode("overtime");
                        return 0;
                    }

                    return current - 1;
                });
            } else if (mode === "overtime") {
                setOvertimeSeconds((current) => current + 1);
            } else if (mode === "resting") {
                setRestSeconds((current) => {
                    if (current <= 1) {
                        setIsRunning(false);
                        setMode("ready");
                        return 0;
                    }

                    return current - 1;
                });
            }
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [isRunning, mode]);

    const choosePreset = (minutes: number) => {
        setSelectedMinutes(minutes);
        setRemainingSeconds(minutes * 60);
        setOvertimeSeconds(0);
        setRestSeconds(0);
        setMode("ready");
        setIsRunning(false);
    };

    const reset = () => {
        setRemainingSeconds(totalSeconds);
        setOvertimeSeconds(0);
        setRestSeconds(0);
        setMode("ready");
        setIsRunning(false);
    };

    const startRest = () => {
        const nextRestSeconds = Math.max(60, Math.ceil(workedSeconds / 5));
        setRestSeconds(nextRestSeconds);
        setMode("resting");
        setIsRunning(true);
    };

    const toggleTimer = () => {
        if (mode === "ready") {
            setMode("focus");
            setIsRunning(true);
        } else {
            setIsRunning((current) => !current);
        }
    };

    const milestoneSeconds = Math.max(900, Math.ceil(workedSeconds / 900) * 900);
    const milestoneRemaining = Math.max(milestoneSeconds - workedSeconds, 0);

    const statusLabel =
        mode === "overtime"
            ? "超過中"
            : mode === "resting"
                ? "休憩中"
                : isRunning
                    ? "集中中"
                    : mode === "ready"
                        ? "準備中"
                        : "一時停止";

    const timerLabel =
        mode === "overtime"
            ? `+${formatTime(overtimeSeconds)}`
            : formatTime(displaySeconds);

    const missionLabel =
        mode === "resting"
            ? "回復キャンプ"
            : mode === "overtime"
                ? "ボーナス区間"
                : checkpointsReached === 3
                    ? "最終地点"
                    : `ルート ${checkpointsReached + 1} / 3`;

    return (
        <section className="w-full max-w-xl px-4 py-8 sm:px-8">
            <header className="mb-12 flex items-end justify-between border-b border-back-4 pb-4">
                <div>
                    <p className="mb-2 text-xs tracking-[0.24em] text-fore-6 uppercase">
                        Focus session
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight">Timer</h1>
                </div>
                <span className="text-sm text-fore-6">
                    {statusLabel}
                </span>
            </header>

            <div className="flex flex-col items-center">
                <div className="mb-6 flex w-full max-w-sm items-center justify-between text-xs text-fore-6">
                    <span className="flex items-center gap-2 tracking-[0.16em] uppercase">
                        <Shield size={14} />
                        Focus run
                    </span>
                    <span className="flex items-center gap-1">
                        <Sparkles size={13} />
                        {checkpointsReached} / 3 checkpoints
                    </span>
                </div>

                <div
                    className="relative flex size-64 items-center justify-center rounded-full p-2 sm:size-72"
                    style={{
                        background: `conic-gradient(${mode === "overtime" ? "var(--color-orange)" : "var(--color-blue)"} ${progress * 360}deg, var(--back-3) 0deg)`,
                    }}
                >
                    <div className="flex size-full flex-col items-center justify-center rounded-full bg-back-1">
                        <span className="mb-2 text-xs tracking-[0.2em] text-fore-6 uppercase">
                            {mode === "overtime" ? "Overtime" : mode === "resting" ? "Rest" : "Remaining"}
                        </span>
                        <time
                            className="tabular-nums text-6xl leading-none tracking-[-0.06em] text-fore-1  sm:text-7xl"
                            dateTime={`PT${displaySeconds}S`}
                        >
                            {timerLabel}
                        </time>
                    </div>
                </div>

                <div className="mt-10 flex items-center gap-4">
                    {mode === "overtime" ? (
                        <Button
                            aria-label="休憩を始める"
                            className="h-14 rounded-full bg-orange px-7 text-fore-1"
                            onPress={startRest}
                        >
                            <Check size={18} />
                            ここで区切る
                        </Button>
                    ) : (
                        <Button
                            aria-label={isRunning ? "一時停止" : "開始"}
                            className="size-14 rounded-full bg-fore-1 text-back-1"
                            onPress={toggleTimer}
                            shape="circle"
                        >
                            {isRunning ? <Pause size={20} /> : <Play className="ml-0.5" size={20} />}
                        </Button>
                    )}
                    <Button
                        aria-label="リセット"
                        className="text-fore-5 hover:text-fore-1"
                        onPress={reset}
                        shape="circle"
                    >
                        <RotateCcw size={18} />
                    </Button>
                </div>

                <p className="mt-5 text-center text-sm text-fore-6">
                    {mode === "overtime"
                        ? "区切りがついたら、休憩へ移りましょう"
                        : mode === "resting"
                            ? `実作業 ${Math.ceil(workedSeconds / 60)}分に合わせた休憩です`
                            : milestoneRemaining === 0
                                ? "中間地点です。続けても、休憩に入っても大丈夫です"
                                : `次の中間地点まで ${formatTime(milestoneRemaining)}`}
                </p>
            </div>

            <div className="mt-10 border-y border-back-4 py-5">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs tracking-[0.2em] text-fore-6 uppercase">
                            Current mission
                        </p>
                        <p className="mt-1 text-lg font-semibold">{missionLabel}</p>
                    </div>
                    <Flag className="text-blue" size={20} />
                </div>

                <div className="relative flex items-center justify-between">
                    <div className="absolute top-1/2 right-3 left-3 h-px -translate-y-1/2 bg-back-4" />
                    <div
                        className="absolute top-1/2 left-3 h-px -translate-y-1/2 bg-blue transition-all duration-500"
                        style={{
                            width: routeProgress === 0 ? "0%" : `calc(${routeProgress}% - 24px)`,
                        }}
                    />
                    {["出発", "中継地", "補給", "到着"].map((checkpoint, index) => {
                        const reached = index <= checkpointsReached;

                        return (
                            <div className="relative z-10 flex flex-col items-center gap-2" key={checkpoint}>
                                <div
                                    className={`flex size-6 items-center justify-center rounded-full border ${reached
                                        ? "border-blue bg-blue text-fore-1"
                                        : "border-back-5 bg-back-1 text-fore-6"
                                        }`}
                                >
                                    {reached ? <Check size={13} /> : <span className="text-[10px]">{index}</span>}
                                </div>
                                <span className={`text-[11px] ${reached ? "text-fore-1" : "text-fore-6"}`}>
                                    {checkpoint}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <p className="mt-4 flex items-center justify-center gap-1 text-xs text-fore-6">
                    {mode === "overtime" ? "ルート完了。ここからは追加報酬区間" : "時間ではなく、区間をひとつずつ進みます"}
                    <ChevronRight size={13} />
                </p>
            </div>

            <div className="mt-14 border-t border-back-4 pt-5">
                <p className="mb-4 text-xs tracking-[0.2em] text-fore-6 uppercase">
                    Duration
                </p>
                <div className="grid grid-cols-4 gap-2">
                    {PRESETS.map((minutes) => (
                        <Button
                            aria-label={`${minutes}分に設定`}
                            className={`h-11 rounded-md border text-sm ${selectedMinutes === minutes
                                ? "border-fore-1 bg-fore-1 text-back-1"
                                : "border-back-4 text-fore-5 hover:border-fore-1 hover:text-fore-1"
                                }`}
                            key={minutes}
                            onPress={() => choosePreset(minutes)}
                        >
                            {minutes} min
                        </Button>
                    ))}
                </div>
            </div>
        </section>
    );
}
