import { Value } from "@sinclair/typebox/value";
import { env } from "../config/env";
import { type VisualScene, VisualSceneSchema } from "../modules/ask/schema";

export class ManimRendererError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "ManimRendererError";
  }
}

type RenderedMedia = {
  kind: "image" | "video";
  url: string;
  alt: string;
  captionsUrl?: string;
};

export const isVisualScene = (value: unknown): value is VisualScene =>
  Value.Check(VisualSceneSchema, value);

export const renderVisualScene = async (
  scene: VisualScene,
  signal?: AbortSignal,
): Promise<RenderedMedia> => {
  if (!env.MANIM_RENDERER_URL || !env.MANIM_RENDERER_TOKEN) {
    throw new ManimRendererError(
      "ビジュアル生成はまだ設定されていません。MANIM_RENDERER_URL と MANIM_RENDERER_TOKEN を設定してください。",
      503,
    );
  }

  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(120_000);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    response = await fetch(
      `${env.MANIM_RENDERER_URL.replace(/\/+$/, "")}/render`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.MANIM_RENDERER_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(scene),
        signal: requestSignal,
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error("Manim renderer request failed:", error);
    throw new ManimRendererError(
      "ビジュアルをレンダリングできませんでした。時間をおいて再試行してください。",
      502,
    );
  }

  if (!response.ok) {
    console.error(`Manim renderer returned HTTP ${response.status}.`);
    throw new ManimRendererError(
      "ビジュアルのレンダリングに失敗しました。時間をおいて再試行してください。",
      response.status >= 500 ? 502 : response.status,
    );
  }

  const payload: unknown = await response.json().catch((error: unknown) => {
    console.error("Manim renderer returned invalid JSON:", error);
    throw new ManimRendererError("レンダラーの応答形式が不正です。");
  });
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("kind" in payload) ||
    payload.kind !== scene.kind ||
    !("url" in payload) ||
    typeof payload.url !== "string" ||
    !("alt" in payload) ||
    typeof payload.alt !== "string" ||
    !/^https?:\/\//.test(payload.url) ||
    (scene.kind === "video" &&
      (!("captions_url" in payload) ||
        typeof payload.captions_url !== "string" ||
        !/^https?:\/\//.test(payload.captions_url)))
  ) {
    throw new ManimRendererError("レンダラーの応答形式が不正です。");
  }

  return {
    kind: scene.kind,
    url: payload.url,
    alt: payload.alt,
    ...(scene.kind === "video" &&
    "captions_url" in payload &&
    typeof payload.captions_url === "string"
      ? { captionsUrl: payload.captions_url }
      : {}),
  };
};
