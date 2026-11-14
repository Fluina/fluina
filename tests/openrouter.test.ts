import { afterEach, expect, spyOn, test } from "bun:test";
import { S3Client } from "@aws-sdk/client-s3";

process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";
process.env.MANIM_RENDERER_URL ??= "https://renderer.example.test";
process.env.MANIM_RENDERER_TOKEN ??= "test-renderer-token-123";
process.env.R2_ACCOUNT_ID ??= "test-r2-account";
process.env.R2_ACCESS_KEY_ID ??= "test-r2-access-key";
process.env.R2_SECRET_ACCESS_KEY ??= "test-r2-secret-key";
process.env.R2_UPLOAD_BUCKET ??= "test-private-uploads";

const { generateAskResponse, generateHistorySummary } = await import(
  "../src/services/openrouter"
);
const { isVisualScene, normalizeVisualScene, renderVisualScene } = await import(
  "../src/services/manim-renderer"
);
const { app } = await import("../src/app");
const { askController } = await import("../src/modules/ask/controller");
let restoreFetch = () => {};
let restoreConsole = () => {};
let restoreR2 = () => {};

afterEach(() => {
  restoreFetch();
  restoreFetch = () => {};
  restoreConsole();
  restoreConsole = () => {};
  restoreR2();
  restoreR2 = () => {};
});

test("composes the Elysia v2 API under the API prefix", async () => {
  const response = await app.handle(
    new Request("http://localhost/api/ask/time"),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ now: expect.any(Number) });
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

test("signs direct uploads to the private R2 attachment bucket", async () => {
  const response = await askController.handle(
    new Request("http://localhost/ask/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: Array.from({ length: 6 }, (_, index) => ({
          name: `photo-${index}.png`,
          type: "image/png",
        })),
      }),
    }),
  );

  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    uploads: { id: string; uploadUrl: string; contentType: string }[];
  };
  expect(payload.uploads).toHaveLength(6);
  const upload = payload.uploads[0];
  if (!upload) throw new Error("Missing signed upload.");
  expect(upload.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(upload.contentType).toBe("image/png");
  expect(new URL(upload.uploadUrl).pathname).toContain(`/uploads/${upload.id}`);
  expect(new URL(upload.uploadUrl).searchParams.get("X-Amz-Expires")).toBe(
    "900",
  );
});

test("sends signed R2 URLs for image and PDF attachments to OpenRouter", async () => {
  const deleteSpy = spyOn(S3Client.prototype, "send").mockImplementation(
    async () => ({}) as never,
  );
  restoreR2 = () => deleteSpy.mockRestore();
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "確認しました" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""),
  );
  let requestBody: Record<string, unknown> | undefined;
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        _input: URL | RequestInfo,
        init?: RequestInit | BunFetchRequestInit,
      ) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(bytes, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const files = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "photo.png",
      type: "image/png",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "document.pdf",
      type: "application/pdf",
    },
  ];
  for await (const _chunk of generateAskResponse(
    "添付を確認して",
    "",
    [],
    undefined,
    files,
  )) {
    // Consume the stream to verify the outgoing request.
  }

  const messages = requestBody?.messages as
    | { role: string; content: string | Record<string, unknown>[] }[]
    | undefined;
  const content = messages?.at(-1)?.content as Record<string, unknown>[];
  expect(content[1]).toMatchObject({ type: "image_url" });
  expect(
    new URL((content[1]?.image_url as { url: string }).url).searchParams.get(
      "X-Amz-Expires",
    ),
  ).toBe("86400");
  expect(content[2]).toMatchObject({
    type: "file",
    file: { filename: "document.pdf" },
  });
  expect(
    (content[2]?.file as { file_data: string }).file_data.includes(
      "X-Amz-Expires=86400",
    ),
  ).toBe(true);
  expect(deleteSpy).toHaveBeenCalledTimes(2);
  expect(
    deleteSpy.mock.calls.map(([command]) => command.constructor.name),
  ).toEqual(["DeleteObjectCommand", "DeleteObjectCommand"]);
});

test("sends attachment-only requests without adding an empty text part", async () => {
  const deleteSpy = spyOn(S3Client.prototype, "send").mockImplementation(
    async () => ({}) as never,
  );
  restoreR2 = () => deleteSpy.mockRestore();
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "画像を確認しました。" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""),
  );
  let requestBody: Record<string, unknown> | undefined;
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        _input: URL | RequestInfo,
        init?: RequestInit | BunFetchRequestInit,
      ) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(bytes, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  const response = await askController.handle(
    new Request("http://localhost/ask/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "",
        files: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "photo.png",
            type: "image/png",
          },
        ],
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.text()).toContain("画像を確認しました。");
  const messages = requestBody?.messages as
    | { role: string; content: string | Record<string, unknown>[] }[]
    | undefined;
  expect(messages?.at(-1)?.content).toEqual([
    {
      type: "image_url",
      image_url: {
        url: expect.stringContaining("X-Amz-Expires=86400"),
      },
    },
  ]);
  expect(deleteSpy).toHaveBeenCalledTimes(1);
});

test("rejects an empty prompt when no attachments are supplied", async () => {
  const response = await askController.handle(
    new Request("http://localhost/ask/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "質問または添付ファイルを指定してください。",
  });
});

test("renders a requested video and appends an embeddable media marker", async () => {
  const encoder = new TextEncoder();
  const scene = {
    kind: "video",
    title: "二次関数",
    duration: 4,
    view: { xMin: -2, xMax: 2 },
    items: [
      { type: "axes" },
      {
        type: "plot",
        expressions: ["x^2 - 1", "x^2", "x^2 + 1"],
      },
      {
        type: "point",
        positions: [
          [0, -1],
          [0, 0],
          [0, 1],
        ],
        label: "頂点",
      },
      { type: "steps", latex: ["x^2 - 1", "x^2", "x^2 + 1"] },
    ],
  };
  const bytes = encoder.encode(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "二次関数の変化を示します。" } }] })}\n\n`,
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
            kind: "video",
            url: "https://renderer.example.test/media/visual.mp4",
            captions_url: "https://renderer.example.test/media/visual.vtt",
            alt: "二次関数",
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
  for await (const chunk of generateAskResponse(
    "二次関数の変化を動画で説明して",
  )) {
    chunks.push(chunk);
  }

  const response = chunks.join("");
  expect(response.startsWith("二次関数の変化を示します。")).toBe(true);
  expect(response).toContain("[[FLUINA_MEDIA:");
  expect(response).not.toContain("fluina-visual");
  expect(requests).toHaveLength(2);
  expect(requests[1]?.url).toBe("https://renderer.example.test/render");
  expect(requests[1]?.authorization).toBe("Bearer test-renderer-token-123");
  expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual(scene);
});

test("normalizes AI-authored plot and point keyframes", () => {
  const scene = normalizeVisualScene({
    kind: "video",
    title: "判別式",
    items: [
      { type: "axes" },
      {
        type: "plot",
        expressions: ["x^2 - 2*x", "x^2 - 2*x + 1", "x^2 - 2*x + 2"],
      },
      {
        type: "point",
        positions: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        label: "頂点",
      },
      { type: "steps", latex: ["D > 0", "D = 0", "D < 0"] },
    ],
  });

  expect(isVisualScene(scene)).toBe(true);
  expect(scene).toMatchObject({
    items: [
      { type: "axes" },
      {
        type: "plot",
        expressions: ["x^2 - 2*x", "x^2 - 2*x + 1", "x^2 - 2*x + 2"],
      },
      {
        type: "point",
        positions: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      { type: "steps", latex: ["D > 0", "D = 0", "D < 0"] },
    ],
  });
});

test("normalizes content-based scenes without clamping data coordinates", () => {
  const scene = normalizeVisualScene({
    kind: "video",
    title: "座標",
    items: [
      { type: "plot", expression: "process.exit()" },
      { type: "plot", expression: "x+*2" },
      { type: "plot", expression: "x^2 - 3" },
      { type: "formula", latex: "y = x^2", x: 100, y: -100 },
      { type: "point", x: 12, y: -9, label: "点", custom: true },
      { type: "steps", latex: ["x = 0", "x = 1"] },
    ],
  });

  expect(isVisualScene(scene)).toBe(true);
  expect(scene).toEqual({
    kind: "video",
    title: "座標",
    items: [
      { type: "plot", expression: "x^2 - 3" },
      { type: "formula", latex: "y = x^2" },
      { type: "point", x: 12, y: -9, label: "点" },
      { type: "steps", latex: ["x = 0", "x = 1"] },
    ],
  });
  expect(
    isVisualScene(
      normalizeVisualScene({
        kind: "image",
        title: "静止画",
        items: [{ type: "axes" }],
      }),
    ),
  ).toBe(false);
  expect(
    isVisualScene(
      normalizeVisualScene({
        kind: "video",
        title: "固定図",
        items: [{ type: "axes" }, { type: "plot", expression: "x^2" }],
      }),
    ),
  ).toBe(false);
});

test("does not accept legacy positioned text elements", () => {
  const scene = normalizeVisualScene({
    kind: "video",
    title: "旧形式",
    elements: [{ type: "text", text: "点", x: 1, y: 2 }],
  });

  expect(isVisualScene(scene)).toBe(false);
});

test("treats null optional visual fields as omitted", () => {
  const scene = normalizeVisualScene({
    kind: "video",
    title: "判別式",
    view: null,
    duration: null,
    items: [
      { type: "axes" },
      { type: "point", x: 0, y: 0, label: null, color: null },
      { type: "steps", latex: ["x = 0", "x = 1"] },
    ],
  });

  expect(isVisualScene(scene)).toBe(true);
  expect(scene).toEqual({
    kind: "video",
    title: "判別式",
    items: [
      { type: "axes" },
      { type: "point", x: 0, y: 0 },
      { type: "steps", latex: ["x = 0", "x = 1"] },
    ],
  });
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
      items: [
        {
          type: "steps",
          latex: ["x^2", "x \\cdot x"],
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

test("reports a renderer scene-schema mismatch as a deployment issue", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () =>
        Response.json({ detail: "Invalid scene schema" }, { status: 422 }),
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  await expect(
    renderVisualScene({
      kind: "video",
      title: "二次関数",
      items: [{ type: "steps", latex: ["x^2", "x^2 + 1"] }],
    }),
  ).rejects.toMatchObject({
    name: "ManimRendererError",
    statusCode: 422,
    message:
      "レンダラーが現在のシーン形式を受け付けません。レンダラーを最新コードで再デプロイしてください。",
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

test("deletes uploaded attachments when OpenRouter rejects the request", async () => {
  const deleteSpy = spyOn(S3Client.prototype, "send").mockImplementation(
    async () => ({}) as never,
  );
  restoreR2 = () => deleteSpy.mockRestore();
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () =>
        Response.json(
          { error: { message: "Invalid request" } },
          { status: 400 },
        ),
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restoreFetch = () => fetchSpy.mockRestore();

  await expect(
    (async () => {
      for await (const _chunk of generateAskResponse(
        "質問",
        "",
        [],
        undefined,
        [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "photo.png",
            type: "image/png",
          },
        ],
      )) {
        // Consume the stream to observe the request error and cleanup.
      }
    })(),
  ).rejects.toThrow("OpenRouter request failed");

  expect(deleteSpy).toHaveBeenCalledTimes(1);
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
