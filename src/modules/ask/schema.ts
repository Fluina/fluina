import { t } from "elysia";

export const AskSchema = {
    body: t.Object({
        prompt: t.String({
            minLength: 1,
            error: "Prompt cannot be Empty."
        }),
    }),
    response: t.Object({
        reply: t.String(),
    })
};