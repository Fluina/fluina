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

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;

  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    )
  ) {
    return true;
  }

  return detectOS() === "mac" && navigator.maxTouchPoints > 1;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(detectMobile());
  }, []);

  return isMobile;
}
