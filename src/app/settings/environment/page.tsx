"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import {
  Select,
  SelectItem,
  SelectListBox,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@/components/parts";
import { usePreferences } from "@/app/preferences";

export default function EnvironmentPage() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const { transparency, setTransparency, parallax, setParallax, font, setFont } =
    usePreferences();
  const storedTheme =
    typeof window === "undefined" ? null : localStorage.getItem("theme");
  const selectedTheme = isMounted
    ? (theme ?? "system")
    : (storedTheme ?? theme ?? "system");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between gap-4 p-4">
        <span className="flex flex-col items-left justify-center gap-1">
          <span className="text-lg">テーマ</span>

          <span className="text-sm text-fore-9">
            デバイスに紐付き、アプリのテーマを変更する。
          </span>
        </span>

        <Select
          aria-label="テーマ"
          value={selectedTheme}
          onChange={(key: Key | null) => {
            if (key) setTheme(key as string);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopover>
            <SelectListBox>
              <SelectItem id="system">システム</SelectItem>
              <SelectItem id="light">ライト</SelectItem>
              <SelectItem id="dark">ダーク</SelectItem>
            </SelectListBox>
          </SelectPopover>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 p-4">
        <span className="flex flex-col items-left justify-center gap-1">
          <span className="text-lg">透明効果</span>

          <span className="text-sm text-fore-9">
            デバイスに紐付き、アプリの透明効果を変更する。
          </span>
        </span>

        <Select
          aria-label="透明効果"
          value={transparency}
          onChange={(key: Key | null) => {
            if (key) setTransparency(key as typeof transparency);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopover>
            <SelectListBox>
              <SelectItem id="system">システム</SelectItem>
              <SelectItem id="on">有効</SelectItem>
              <SelectItem id="off">無効</SelectItem>
            </SelectListBox>
          </SelectPopover>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 p-4">
        <span className="flex flex-col items-left justify-center gap-1">
          <span className="text-lg">視差効果</span>

          <span className="text-sm text-fore-9">
            デバイスに紐付き、アプリの視差効果を変更する。
          </span>
        </span>

        <Select
          aria-label="視差効果"
          value={parallax}
          onChange={(key: Key | null) => {
            if (key) setParallax(key as typeof parallax);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopover>
            <SelectListBox>
              <SelectItem id="system">システム</SelectItem>
              <SelectItem id="on">有効</SelectItem>
              <SelectItem id="off">無効</SelectItem>
            </SelectListBox>
          </SelectPopover>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 p-4">
        <span className="flex flex-col items-left justify-center gap-1">
          <span className="text-lg">フォント</span>

          <span className="text-sm text-fore-9">
            デバイスに紐付き、アプリのフォントを変更する。
          </span>
        </span>

        <Select
          aria-label="フォント"
          value={font}
          onChange={(key: Key | null) => {
            if (key) setFont(key as typeof font);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopover>
            <SelectListBox>
              <SelectItem id="default">既定</SelectItem>
              <SelectItem id="serif">明朝</SelectItem>
              <SelectItem id="sans-serif">ゴシック</SelectItem>
              <SelectItem id="monospace">等幅</SelectItem>
              <SelectItem id="rounded">丸ゴシック</SelectItem>
            </SelectListBox>
          </SelectPopover>
        </Select>
      </div>
    </section>
  );
}