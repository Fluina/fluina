import { Elysia } from "elysia";
import { generateAskResponse } from "../../services/gemini";
import { AskSchema } from "./schema";

export const askController = new Elysia({ prefix: "/ask" }).post(
  "/",
  async ({ body, set }) => {
    try {
      const response = generateAskResponse(body.prompt);
      const iterator = response[Symbol.asyncIterator]();
      const encoder = new TextEncoder();

      set.headers["Content-Type"] = "text/plain; charset=utf-8";
      set.headers["Cache-Control"] = "no-cache, no-transform";

      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await iterator.next();

            if (done) {
              controller.close();
            } else {
              controller.enqueue(encoder.encode(value));
            }
          } catch (err) {
            console.error("Gemini Streaming Error:", err);
            controller.error(err);
          }
        },
        async cancel() {
          await iterator.return?.(undefined);
        },
      });
    } catch (err) {
      console.error("Gemini Execution Error:", err);

      set.status = 500;

      return "Internal Server Error. Failed to generate response.";
    }
  },
  {
    body: AskSchema.body,
  },
);
