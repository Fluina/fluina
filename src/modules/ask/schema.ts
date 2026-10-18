import { t } from "elysia";

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
    history: t.Optional(t.Array(historyMessage, { maxItems: 20 })),
  }),
  summarizeBody: t.Object({
    summary: t.Optional(t.String({ maxLength: 12000 })),
    messages: t.Array(historyMessage, { minItems: 1, maxItems: 20 }),
  }),
};
