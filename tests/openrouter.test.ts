import { afterEach, expect, spyOn, test } from "bun:test";

process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";
process.env.MANIM_RENDERER_URL ??= "https://renderer.example.test";
process.env.MANIM_RENDERER_TOKEN ??= "test-renderer-token-123";

const { generateAskResponse, generateHistorySummary } = await import(
  "../src/services/openrouter"
);
const { renderVisualScene } = await import("../src/services/manim-renderer");
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
    Object.assign(
      async (
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
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
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

test("renders a requested visual and appends an embeddable media marker", async () => {
  const encoder = new TextEncoder();
  const scene = {
    kind: "image",
    title: "単位円",
    elements: [
      {
        type: "circle",
        x: 0,
        y: 0,
        radius: 2,
        color: "#4DA3FF",
      },
    ],
  };
  const bytes = encoder.encode(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "単位円を示します。" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: `\n\`\`\`fluina-visual\n${JSON.stringify(scene)}\n\`\`\`` } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""),
  );
  const requests: Array<{
    url: string;
    body?: string;
    authorization?: string;
  }> = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        input: URL | RequestInfo,
        init?: RequestInit | BunFetchRequestInit,
      ) => {
        const url = String(input);
        requests.push({
          url,
          body: typeof init?.body === "string" ? init.body : undefined,
          authorization:
            new Headers(init?.headers).get("Authorization") ?? undefined,
        });
        if (url.startsWith("https://renderer.example.test/")) {
          return Response.json({
            kind: "image",
            url: "https://renderer.example.test/media/visual.png",
            alt: "単位円",
          });
        }
        return new Response(bytes, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const chunks: string[] = [];
  for await (const chunk of generateAskResponse("単位円を図で説明して")) {
    chunks.push(chunk);
  }

  const response = chunks.join("");
  expect(response.startsWith("単位円を示します。")).toBe(true);
  expect(response).toContain("[[FLUINA_MEDIA:");
  expect(response).not.toContain("fluina-visual");
  expect(requests).toHaveLength(2);
  expect(requests[1]?.url).toBe("https://renderer.example.test/render");
  expect(requests[1]?.authorization).toBe("Bearer test-renderer-token-123");
  expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual(scene);
});

test("returns a captions URL for rendered videos", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        return Response.json({
          kind: "video",
          url: "https://renderer.example.test/media/visual.mp4",
          captions_url: "https://renderer.example.test/media/visual.vtt",
          alt: "円の展開",
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  await expect(
    renderVisualScene({
      kind: "video",
      title: "円の展開",
      duration: 5,
      elements: [
        {
          type: "circle",
          x: 0,
          y: 0,
          radius: 2,
        },
      ],
    }),
  ).resolves.toEqual({
    kind: "video",
    url: "https://renderer.example.test/media/visual.mp4",
    captionsUrl: "https://renderer.example.test/media/visual.vtt",
    alt: "円の展開",
  });
});

test("rejects a completed stream that contains no assistant text", async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\ndata: [DONE]\n\n`,
  );
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        return new Response(bytes, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
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
    Object.assign(
      async () => {
        return Response.json(
          { error: { message: "ZDR violation: no eligible free providers" } },
          { status: 404 },
        );
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
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
    Object.assign(
      async (
        _input: URL | RequestInfo,
        init?: RequestInit | BunFetchRequestInit,
      ) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          choices: [{ message: { content: "会話の要約" } }],
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
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
    Object.assign(
      async () => {
        return Response.json(
          { error: { message: "Rate limit exceeded" } },
          { status: 429 },
        );
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
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
    Object.assign(
      async () => {
        return Response.json(
          { error: { message: "Rate limit exceeded" } },
          { status: 429 },
        );
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
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
