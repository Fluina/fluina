import { Elysia } from "elysia";
import { generateAskResponse } from "../../services/gemini";
import { AskSchema } from "./schema";

export const askController = new Elysia({ prefix: "/ask" })
    .post("/", async ({ body, set }) => {
        try {
            const reply = await generateAskResponse(body.prompt);

            return { reply: reply ?? "" };
        } catch (err) {
            console.error("Gemini Execution Error:", err);

            set.status = 500;

            return { reply: "Internal Server Error. Failed to generate response." };
        }
    }, {
        body: AskSchema.body,
        response: AskSchema.response
    });