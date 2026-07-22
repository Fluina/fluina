"use client";
import { useEffect, useState } from "react";

export type OS = "windows" | "mac";

interface NavigatorUAData {
    platform: string;
}

interface NavigatorWithUAData extends Navigator {
    userAgentData?: NavigatorUAData;
}

function detectOS(): OS {
    if (typeof navigator === "undefined") return "windows";

    const platform =
        (navigator as NavigatorWithUAData).userAgentData?.platform ??
        navigator.platform ??
        navigator.userAgent;

    return /mac|iphone|ipad/i.test(platform) ? "mac" : "windows";
}

export function useOS(): OS {
    const [os, setOS] = useState<OS>("windows");

    useEffect(() => {
        setOS(detectOS());
    }, []);

    return os;
}