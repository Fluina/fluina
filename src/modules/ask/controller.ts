import { Elysia } from "elysia";
import { ManimRendererError } from "../../services/manim-renderer";
import {
  generateAskResponse,
  generateHistorySummary,
  OpenRouterRequestError,
  UnsupportedAttachmentError,
} from "../../services/openrouter";
import { AskSchema, MAX_ATTACHMENT_BYTES } from "./schema";

export const askController = new Elysia({ prefix: "/ask" })
  .post(
    "/",
    async ({ body, request, set }) => {
      try {
        const files = body.files ?? [];
        if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
          set.status = 413;
          return { error: "添付ファイルは1つあたり10MBまでです。" };
        }

        const response = generateAskResponse(
          body.prompt,
          body.summary,
          body.history,
          request.signal,
          files,
        );
        const iterator = response[Symbol.asyncIterator]();
        const encoder = new TextEncoder();
        const firstChunk = await iterator.next();

        if (firstChunk.done) {
          throw new Error("OpenRouter returned an empty chat completion.");
        }

        set.headers["Content-Type"] = "text/plain; charset=utf-8";
        set.headers["Cache-Control"] = "no-cache, no-transform";

        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(firstChunk.value));
          },
          async pull(controller) {
            try {
              const { done, value } = await iterator.next();

              if (done) {
                controller.close();
              } else {
                controller.enqueue(encoder.encode(value));
              }
            } catch (err) {
              console.error("OpenRouter Streaming Error:", err);
              controller.error(err);
            }
          },
          async cancel() {
            await iterator.return?.(undefined);
          },
        });
      } catch (err) {
        console.error("OpenRouter Execution Error:", err);

        set.status =
          err instanceof UnsupportedAttachmentError
            ? 415
            : err instanceof ManimRendererError
              ? err.statusCode
              : err instanceof OpenRouterRequestError
                ? err.statusCode
                : 502;
        set.headers["Content-Type"] = "application/json; charset=utf-8";

        return {
          error:
            err instanceof Error ? err.message : "Failed to generate response.",
        };
      }
    },
    {
      body: AskSchema.body,
    },
  )
  .post(
    "/summarize",
    async ({ body, request, set }) => {
      try {
        return {
          summary: await generateHistorySummary(
            body.summary ?? "",
            body.messages,
            request.signal,
          ),
        };
      } catch (err) {
        console.error("OpenRouter History Summary Error:", err);
        set.status =
          err instanceof OpenRouterRequestError ? err.statusCode : 500;
        return { error: "Failed to summarize chat history." };
      }
    },
    {
      body: AskSchema.summarizeBody,
    },
  );
