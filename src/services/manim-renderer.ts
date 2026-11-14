import { Value } from "typebox/value";
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
  Value.Check(VisualSceneSchema, value) &&
  !(
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "image" &&
    "duration" in value &&
    value.duration !== undefined
  );

const ALLOWED_LATEX_COMMANDS = new Set(
  "alpha angle approx beta cdot circ cos delta div frac gamma ge infty int le left ln log lambda mu neq omega pi pm right sigma sin sqrt sum tan theta times".split(
    " ",
  ),
);
const ALLOWED_EXPRESSION_NAMES = new Set([
  "x",
  "pi",
  "sqrt",
  "abs",
  "sin",
  "cos",
  "tan",
  "ln",
  "log",
  "exp",
]);
const ITEM_KEYS: Record<string, string[]> = {
  axes: ["type"],
  plot: ["type", "expression", "color"],
  point: ["type", "x", "y", "label", "color"],
  segment: ["type", "from", "to", "color"],
  circle: ["type", "x", "y", "radius", "color"],
  formula: ["type", "latex", "color"],
  steps: ["type", "latex", "color"],
};
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SAFE_LATEX_CHARACTERS = /^[A-Za-z0-9\s{}_^=+\-*/().,\\|<>]+$/;

const clamp = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : value;

const isSupportedFormula = (latex: unknown) =>
  typeof latex === "string" &&
  (latex.match(/\\([A-Za-z]+)/g) ?? []).every((command) =>
    ALLOWED_LATEX_COMMANDS.has(command.slice(1)),
  );

const isSupportedExpression = (expression: unknown) => {
  if (typeof expression !== "string" || expression.length === 0) return false;
  const tokenPattern =
    /\s*(?:(?:\d+(?:\.\d*)?|\.\d+)|([A-Za-z]+)|([()+\-*/^]))/gy;
  const tokens: string[] = [];
  let position = 0;
  while (position < expression.length) {
    if (!expression.slice(position).trim()) break;
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(expression);
    if (!match) return false;
    const token = match[0].trim();
    if (/^[A-Za-z]+$/.test(token) && !ALLOWED_EXPRESSION_NAMES.has(token)) {
      return false;
    }
    tokens.push(token);
    position = tokenPattern.lastIndex;
  }

  let index = 0;
  const peek = () => tokens[index];
  const parsePrimary = (): boolean => {
    const token = peek();
    if (!token) return false;
    if (token === "(") {
      index++;
      if (!parseExpression() || peek() !== ")") return false;
      index++;
      return true;
    }
    if (
      /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) ||
      token === "x" ||
      token === "pi"
    ) {
      index++;
      return true;
    }
    if (
      ["sqrt", "abs", "sin", "cos", "tan", "ln", "log", "exp"].includes(token)
    ) {
      index++;
      if (peek() !== "(") return false;
      index++;
      if (!parseExpression() || peek() !== ")") return false;
      index++;
      return true;
    }
    return false;
  };
  const parsePower = (): boolean => {
    if (!parsePrimary()) return false;
    if (peek() !== "^") return true;
    index++;
    return parseUnary();
  };
  const parseUnary = (): boolean => {
    if (peek() === "+" || peek() === "-") {
      index++;
      return parseUnary();
    }
    return parsePower();
  };
  const parseTerm = (): boolean => {
    if (!parseUnary()) return false;
    while (peek() === "*" || peek() === "/") {
      index++;
      if (!parseUnary()) return false;
    }
    return true;
  };
  const parseExpression = (): boolean => {
    if (!parseTerm()) return false;
    while (peek() === "+" || peek() === "-") {
      index++;
      if (!parseTerm()) return false;
    }
    return true;
  };
  return tokens.length > 0 && parseExpression() && index === tokens.length;
};

// AIの出力のうち、許可されていないプロパティや値を取り除いて仕様に合わせる
export const normalizeVisualScene = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null) return raw;
  const scene = raw as Record<string, unknown>;
  if (!Array.isArray(scene.items)) return raw;

  const view =
    typeof scene.view === "object" && scene.view !== null
      ? (scene.view as Record<string, unknown>)
      : undefined;
  if (view) {
    const { xMin, xMax } = view;
    if (
      typeof xMin !== "number" ||
      !Number.isFinite(xMin) ||
      typeof xMax !== "number" ||
      !Number.isFinite(xMax) ||
      xMin >= xMax ||
      xMax - xMin < 0.5 ||
      xMax - xMin > 40
    ) {
      return raw;
    }
  } else if (scene.view !== undefined && scene.view !== null) {
    return raw;
  }

  const items = scene.items.flatMap((item): unknown[] => {
    if (typeof item !== "object" || item === null) return [];
    const source = item as Record<string, unknown>;
    const allowedKeys = ITEM_KEYS[String(source.type)];
    if (!allowedKeys) return [raw];

    if (source.type === "plot" && !isSupportedExpression(source.expression)) {
      return [];
    }

    const normalized: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (source[key] !== undefined && source[key] !== null) {
        normalized[key] = source[key];
      }
    }
    if (
      typeof normalized.color === "string" &&
      !HEX_COLOR.test(normalized.color)
    ) {
      delete normalized.color;
    }
    if (typeof normalized.label === "string") {
      normalized.label = normalized.label.slice(0, 200);
    }
    if (source.type === "plot" && typeof normalized.expression === "string") {
      normalized.expression = normalized.expression.slice(0, 200);
      if (!isSupportedExpression(normalized.expression)) return [];
    }
    if (source.type === "formula" && typeof normalized.latex === "string") {
      const formula = normalized.latex.slice(0, 200);
      normalized.latex = formula;
      if (
        !SAFE_LATEX_CHARACTERS.test(formula) ||
        !isSupportedFormula(formula)
      ) {
        return [];
      }
    }
    if (source.type === "steps" && Array.isArray(normalized.latex)) {
      const formulas = normalized.latex
        .filter((step): step is string => typeof step === "string")
        .slice(0, 6)
        .map((step) => step.slice(0, 200));
      normalized.latex = formulas;
      if (
        formulas.some(
          (step) =>
            !SAFE_LATEX_CHARACTERS.test(step) || !isSupportedFormula(step),
        )
      ) {
        return [];
      }
    }
    return [JSON.parse(JSON.stringify(normalized))];
  });

  if (items.some((item) => item === raw)) return raw;

  return {
    kind: scene.kind,
    title:
      typeof scene.title === "string" ? scene.title.slice(0, 120) : scene.title,
    ...(view
      ? {
          view: {
            xMin: view.xMin,
            xMax: view.xMax,
          },
        }
      : {}),
    ...(typeof scene.duration === "number" && Number.isFinite(scene.duration)
      ? { duration: clamp(scene.duration, 2, 20) }
      : {}),
    items: items.slice(0, 20),
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
    if (response.status === 422) {
      throw new ManimRendererError(
        "レンダラーが現在のシーン形式を受け付けません。レンダラーを最新コードで再デプロイしてください。",
        422,
      );
    }
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
