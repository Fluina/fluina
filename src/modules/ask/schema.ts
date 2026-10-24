import { t } from "elysia";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const coordinate = t.Number({ minimum: -7, maximum: 7 });
const sceneColor = t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" }));

const point = t.Tuple([coordinate, coordinate]);
const animation = t.Optional(
  t.Union([t.Literal("create"), t.Literal("fade_in"), t.Literal("write")]),
);

const visualElement = t.Union([
  t.Object({
    type: t.Literal("text"),
    text: t.String({ minLength: 1, maxLength: 200 }),
    x: coordinate,
    y: coordinate,
    scale: t.Optional(t.Number({ minimum: 0.25, maximum: 2 })),
    color: sceneColor,
    animation,
  }),
  t.Object({
    type: t.Literal("formula"),
    latex: t.String({ minLength: 1, maxLength: 200 }),
    x: coordinate,
    y: coordinate,
    scale: t.Optional(t.Number({ minimum: 0.25, maximum: 2 })),
    color: sceneColor,
    animation,
  }),
  t.Object({
    type: t.Literal("circle"),
    x: coordinate,
    y: coordinate,
    radius: t.Number({ minimum: 0.05, maximum: 3 }),
    color: sceneColor,
    animation,
  }),
  t.Object({
    type: t.Literal("rectangle"),
    x: coordinate,
    y: coordinate,
    width: t.Number({ minimum: 0.05, maximum: 10 }),
    height: t.Number({ minimum: 0.05, maximum: 10 }),
    color: sceneColor,
    animation,
  }),
  t.Object({
    type: t.Union([t.Literal("line"), t.Literal("graph")]),
    points: t.Array(point, { minItems: 2, maxItems: 500 }),
    color: sceneColor,
    animation,
  }),
]);

export const VisualSceneSchema = t.Object({
  kind: t.Union([t.Literal("image"), t.Literal("video")]),
  title: t.String({ minLength: 1, maxLength: 120 }),
  duration: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
  elements: t.Array(visualElement, { minItems: 1, maxItems: 40 }),
});

export type VisualScene = {
  kind: "image" | "video";
  title: string;
  duration?: number;
  elements: Array<
    | {
        type: "text";
        text: string;
        x: number;
        y: number;
        scale?: number;
        color?: string;
        animation?: "create" | "fade_in" | "write";
      }
    | {
        type: "formula";
        latex: string;
        x: number;
        y: number;
        scale?: number;
        color?: string;
        animation?: "create" | "fade_in" | "write";
      }
    | {
        type: "circle";
        x: number;
        y: number;
        radius: number;
        color?: string;
        animation?: "create" | "fade_in" | "write";
      }
    | {
        type: "rectangle";
        x: number;
        y: number;
        width: number;
        height: number;
        color?: string;
        animation?: "create" | "fade_in" | "write";
      }
    | {
        type: "line" | "graph";
        points: [number, number][];
        color?: string;
        animation?: "create" | "fade_in" | "write";
      }
  >;
};

const historyMessage = t.Object({
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String({ maxLength: 4000 }),
});

export const AskSchema = {
  body: t.Object({
    prompt: t.String({
      minLength: 1,
      error: "Prompt cannot be Empty.",
    }),
    summary: t.Optional(t.String({ maxLength: 12000 })),
    history: t.Optional(t.ArrayString(historyMessage, { maxItems: 20 })),
    files: t.Optional(t.Files({ maxItems: MAX_ATTACHMENTS })),
  }),
  summarizeBody: t.Object({
    summary: t.Optional(t.String({ maxLength: 12000 })),
    messages: t.Array(historyMessage, { minItems: 1, maxItems: 20 }),
  }),
};
