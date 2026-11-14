import { t } from "elysia";

const attachmentInput = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  type: t.String({ maxLength: 255 }),
});

const attachmentReference = t.Object({
  id: t.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
  }),
  name: t.String({ minLength: 1, maxLength: 255 }),
  type: t.String({ maxLength: 255 }),
});

const color = t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" }));
const coordinate = t.Number();
const latex = t.String({ minLength: 1, maxLength: 200 });

const visualItem = t.Union([
  t.Object({ type: t.Literal("axes") }),
  t.Object({
    type: t.Literal("plot"),
    expression: t.String({ minLength: 1, maxLength: 200 }),
    color,
  }),
  t.Object({
    type: t.Literal("point"),
    x: coordinate,
    y: coordinate,
    label: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
    color,
  }),
  t.Object({
    type: t.Literal("segment"),
    from: t.Tuple([coordinate, coordinate]),
    to: t.Tuple([coordinate, coordinate]),
    color,
  }),
  t.Object({
    type: t.Literal("circle"),
    x: coordinate,
    y: coordinate,
    radius: t.Number({ exclusiveMinimum: 0 }),
    color,
  }),
  t.Object({
    type: t.Literal("formula"),
    latex,
    color,
  }),
  t.Object({
    type: t.Literal("steps"),
    latex: t.Array(latex, { minItems: 2, maxItems: 6 }),
    color,
  }),
]);

export const VisualSceneSchema = t.Object({
  kind: t.Union([t.Literal("image"), t.Literal("video")]),
  title: t.String({ minLength: 1, maxLength: 120 }),
  view: t.Optional(
    t.Object({
      xMin: coordinate,
      xMax: coordinate,
    }),
  ),
  duration: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
  items: t.Array(visualItem, { minItems: 1, maxItems: 20 }),
});

export type VisualItem =
  | { type: "axes" }
  | { type: "plot"; expression: string; color?: string }
  | {
      type: "point";
      x: number;
      y: number;
      label?: string;
      color?: string;
    }
  | {
      type: "segment";
      from: [number, number];
      to: [number, number];
      color?: string;
    }
  | { type: "circle"; x: number; y: number; radius: number; color?: string }
  | { type: "formula"; latex: string; color?: string }
  | { type: "steps"; latex: string[]; color?: string };

export type VisualScene = {
  kind: "image" | "video";
  title: string;
  view?: { xMin: number; xMax: number };
  duration?: number;
  items: VisualItem[];
};

const historyMessage = t.Object({
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String({ maxLength: 4000 }),
});

export const AskSchema = {
  uploadBody: t.Object({
    files: t.Array(attachmentInput),
  }),
  body: t.Object({
    prompt: t.String(),
    summary: t.Optional(t.String({ maxLength: 12000 })),
    history: t.Optional(t.Array(historyMessage, { maxItems: 20 })),
    files: t.Optional(t.Array(attachmentReference)),
  }),
  summarizeBody: t.Object({
    summary: t.Optional(t.String({ maxLength: 12000 })),
    messages: t.Array(historyMessage, { minItems: 1, maxItems: 20 }),
  }),
};
