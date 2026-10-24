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

const ALLOWED_LATEX_COMMANDS = new Set(
  "alpha angle approx beta cdot circ cos delta div frac gamma ge infty int le left ln log lambda mu neq omega pi pm right sigma sin sqrt sum tan theta times".split(
    " ",
  ),
);
const ELEMENT_KEYS: Record<string, string[]> = {
  text: ["type", "text", "x", "y", "scale", "color", "animation"],
  formula: ["type", "latex", "x", "y", "scale", "color", "animation"],
  circle: ["type", "x", "y", "radius", "color", "animation"],
  rectangle: ["type", "x", "y", "width", "height", "color", "animation"],
  line: ["type", "points", "color", "animation"],
  graph: ["type", "points", "color", "animation"],
};
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const ANIMATIONS = new Set(["create", "fade_in", "write"]);

const clamp = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : value;

const isSupportedFormula = (latex: unknown) =>
  typeof latex === "string" &&
  (latex.match(/\\([A-Za-z]+)/g) ?? []).every((command) =>
    ALLOWED_LATEX_COMMANDS.has(command.slice(1)),
  );

// AIの出力のうち、許可されていないプロパティや値を取り除いて仕様に合わせる
export const normalizeVisualScene = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null) return raw;
  const scene = raw as Record<string, unknown>;
  if (!Array.isArray(scene.elements)) return raw;

  const elements = scene.elements.flatMap((item): unknown[] => {
    if (typeof item !== "object" || item === null) return [];
    const source = item as Record<string, unknown>;
    const allowedKeys = ELEMENT_KEYS[String(source.type)];
    if (!allowedKeys) return [];
    if (source.type === "formula" && !isSupportedFormula(source.latex)) {
      return [];
    }

    const element: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (source[key] !== undefined) element[key] = source[key];
    }
    if (typeof element.color === "string" && !HEX_COLOR.test(element.color)) {
      element.color = undefined;
    }
    if (
      typeof element.animation === "string" &&
      !ANIMATIONS.has(element.animation)
    ) {
      element.animation = undefined;
    }
    for (const key of ["x", "y"]) {
      element[key] = clamp(element[key], -7, 7);
    }
    if ("scale" in element) element.scale = clamp(element.scale, 0.25, 2);
    if (Array.isArray(element.points)) {
      element.points = element.points.map((point) =>
        Array.isArray(point)
          ? point.map((coordinate) => clamp(coordinate, -7, 7))
          : point,
      );
    }
    return [JSON.parse(JSON.stringify(element))];
  });

  return {
    kind: scene.kind,
    title:
      typeof scene.title === "string" ? scene.title.slice(0, 120) : scene.title,
    ...(typeof scene.duration === "number"
      ? { duration: clamp(scene.duration, 2, 20) }
      : {}),
    elements: elements.slice(0, 40),
  };
};

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
