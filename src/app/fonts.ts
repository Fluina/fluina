import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";

export const notoSans = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-noto-sans",
});

export const notoSerif = Noto_Serif_JP({
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-noto-serif",
});
