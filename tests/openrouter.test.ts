import { afterEach, expect, spyOn, test } from "bun:test";

process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";

const { generateAskResponse, generateHistorySummary } = await import(
  "../src/services/openrouter"
);
const { askController } = await import("../src/modules/ask/controller");
let restoreFetch = () => {};
let restoreConsole = () => {};

afterEach(() => {
  restoreFetch();
  restoreFetch = () => {};
  restoreConsole();
  restoreConsole = () => {};
});

test("streams OpenRouter chat completion deltas", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const encoder = new TextEncoder();
  const streamText = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "こんにちは" } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: "！" } }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  const bytes = encoder.encode(streamText);

  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async (
      _input: URL | RequestInfo,
      init?: RequestInit | BunFetchRequestInit,
    ) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, 17));
            controller.enqueue(bytes.slice(17));
            controller.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }, { preconnect: globalThis.fetch.preconnect }),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const chunks: string[] = [];
  for await (const chunk of generateAskResponse("挨拶", "要約", [
    { role: "assistant", content: "こんにちは" },
  ])) {
    chunks.push(chunk);
  }

  expect(chunks.join("")).toBe("こんにちは！");
  expect(requestBody?.model).toBe("openrouter/free");
  expect(requestBody?.stream).toBe(true);
  const messages = requestBody?.messages as
    | { role: string; content: string }[]
    | undefined;
  expect(messages?.[0]?.content).toContain("要約");
  expect(messages?.slice(1)).toEqual([
    { role: "assistant", content: "こんにちは" },
    { role: "user", content: "挨拶" },
  ]);
});

test("rejects a completed stream that contains no assistant text", async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\ndata: [DONE]\n\n`,
  );
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => {
      return new Response(bytes, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }, { preconnect: globalThis.fetch.preconnect }),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  await expect(
    (async () => {
      for await (const _chunk of generateAskResponse("質問")) {
        // Consume the stream to observe its terminal error.
      }
    })(),
  ).rejects.toThrow("empty chat completion");
});

test("returns provider failures before opening the chat response stream", async () => {
  const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
  restoreConsole = () => consoleSpy.mockRestore();
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => {
      return Response.json(
        { error: { message: "ZDR violation: no eligible free providers" } },
        { status: 404 },
      );
    }, { preconnect: globalThis.fetch.preconnect }),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const response = await askController.handle(
    new Request("http://localhost/ask/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "質問" }),
    }),
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error:
      "OpenRouter request failed (404): ZDR violation: no eligible free providers",
  });
});

test("generates a history summary with a non-streaming completion", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async (
      _input: URL | RequestInfo,
      init?: RequestInit | BunFetchRequestInit,
    ) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: "会話の要約" } }],
      });
    }, { preconnect: globalThis.fetch.preconnect }),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  await expect(
    generateHistorySummary("", [{ role: "user", content: "質問" }]),
  ).resolves.toBe("会話の要約");
  expect(requestBody).toMatchObject({
    model: "openrouter/free",
    stream: false,
  });
});

test("preserves OpenRouter status codes when a request fails", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => {
      return Response.json(
        { error: { message: "Rate limit exceeded" } },
        { status: 429 },
      );
    }, { preconnect: globalThis.fetch.preconnect }),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const error = await generateHistorySummary("", [
    { role: "user", content: "質問" },
  ]).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ statusCode: 429 });
});

test("returns the OpenRouter status from the history summary endpoint", async () => {
  const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
  restoreConsole = () => consoleSpy.mockRestore();
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => {
      return Response.json(
        { error: { message: "Rate limit exceeded" } },
        { status: 429 },
      );
    }, { preconnect: globalThis.fetch.preconnect }),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const response = await askController.handle(
    new Request("http://localhost/ask/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "質問" }],
      }),
    }),
  );

  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({
    error: "Failed to summarize chat history.",
  });
});
