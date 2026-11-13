import { Elysia } from "elysia";
import { ManimRendererError } from "../../services/manim-renderer";
import {
  generateAskResponse,
  generateHistorySummary,
  OpenRouterRequestError,
  UnsupportedAttachmentError,
} from "../../services/openrouter";
import {
  createAttachmentUploads,
  R2StorageConfigurationError,
} from "../../services/r2-storage";
import { AskSchema } from "./schema";

const KEEPALIVE_INTERVAL_MS = 5_000;

export const askController = new Elysia({ prefix: "/ask" })
  .get("/time", ({ set }) => {
    set.headers["Cache-Control"] = "no-store";
    return { now: Date.now() };
  })
  .post(
    "/uploads",
    {
      body: AskSchema.uploadBody,
    },
    async ({ body, set }) => {
      try {
        set.headers["Cache-Control"] = "no-store";
        return { uploads: await createAttachmentUploads(body.files) };
      } catch (error) {
        console.error("R2 Attachment Upload Signing Error:", error);
        set.status = error instanceof R2StorageConfigurationError ? 503 : 502;
        return {
          error: "添付ファイルのアップロードを準備できませんでした。",
        };
      }
    },
  )
  .post(
    "/",
    {
      body: AskSchema.body,
    },
    async ({ body, request, set }) => {
      try {
        const files = body.files ?? [];
        if (!body.prompt.trim() && files.length === 0) {
          set.status = 400;
          set.headers["Content-Type"] = "application/json; charset=utf-8";
          return { error: "質問または添付ファイルを指定してください。" };
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

        let pending: Promise<IteratorResult<string>> | null = null;
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(firstChunk.value));
          },
          async pull(controller) {
            try {
              pending ??= iterator.next();
              const result = await Promise.race([
                pending,
                new Promise<null>((resolve) =>
                  setTimeout(() => resolve(null), KEEPALIVE_INTERVAL_MS),
                ),
              ]);

              // 長いレンダリング待ちで接続が切れないよう、ゼロ幅スペースを送る
              if (result === null) {
                controller.enqueue(encoder.encode("\u200B"));
                return;
              }
              pending = null;
              const { done, value } = result;

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
  )
  .post(
    "/summarize",
    {
      body: AskSchema.summarizeBody,
    },
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
  );
