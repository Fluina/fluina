import { expect, test } from "@playwright/test";

test("chat loads older turns cumulatively without changing the current history", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const getPersistedCount = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open("fluina-chat-archive");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("messages", "readonly");
            const countRequest = transaction.objectStore("messages").count();
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = () => reject(countRequest.error);
            transaction.oncomplete = () => database.close();
          };
        }),
    );
  const getLatestMessages = () =>
    page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const request = indexedDB.open("fluina-chat-archive");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("messages", "readonly");
            const allRequest = transaction.objectStore("messages").getAll();
            allRequest.onsuccess = () =>
              resolve(
                allRequest.result
                  .slice(-4)
                  .map((message: { content: string }) => message.content),
              );
            allRequest.onerror = () => reject(allRequest.error);
            transaction.oncomplete = () => database.close();
          };
        }),
    );
  const askRequests: {
    prompt: string;
    summary: string;
    history: { role: string; content: string }[];
  }[] = [];
  let signalHeldAskStarted: () => void = () => {};
  let releaseHeldAsk: () => void = () => {};
  const heldAskStarted = new Promise<void>((resolve) => {
    signalHeldAskStarted = resolve;
  });
  const heldAskResponse = new Promise<void>((resolve) => {
    releaseHeldAsk = resolve;
  });
  let summaryRequestCount = 0;

  await page.route("http://localhost:3001/api/ask", (route) => {
    const request = route.request().postDataJSON();
    askRequests.push(request);
    const fulfill = () => route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "テスト返答",
    });
    if (request.prompt === "過去ページからの質問") {
      signalHeldAskStarted();
      return heldAskResponse.then(fulfill);
    }
    return fulfill();
  });
  await page.route("http://localhost:3001/api/ask/summarize", (route) => {
    summaryRequestCount += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "過去の会話要約" }),
    });
  });

  await page.goto("/ask");
  const prompt = page.locator("#prompt");

  for (let turn = 1; turn <= 21; turn += 1) {
    await prompt.fill(`質問${turn}`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(getPersistedCount).toBe(turn * 2);
  }

  const chatScroller = page.locator("div.w-full.overflow-y-auto").first();
  const scrollMetrics = await chatScroller.evaluate((element) => {
    const viewport =
      element.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
      element;
    return {
      top: viewport.scrollTop,
      height: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
    };
  });
  for (let turn = 1; turn <= 10; turn += 1) {
    const message = page.getByText(`質問${turn + 11}`, { exact: true });
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS("opacity", "1");
    expect((await message.boundingBox())?.height).toBeGreaterThan(0);
  }
  await expect(page.getByText("質問11", { exact: true })).toHaveCount(0);
  expect(scrollMetrics.height).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(scrollMetrics.top).toBeGreaterThanOrEqual(0);
  expect(summaryRequestCount).toBeGreaterThan(0);
  const twentyFirstRequest = askRequests.find(
    (request) => request.prompt === "質問21",
  );
  expect(twentyFirstRequest?.summary).toBe("過去の会話要約");
  expect(twentyFirstRequest?.history).toHaveLength(19);

  const showOlderButton = page.getByRole("button", {
    name: "Load Older Messages",
  });
  await expect(showOlderButton).toBeVisible();
  await chatScroller.evaluate((element) => {
    const viewport =
      element.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
      element;
    viewport.scrollTop = 0;
  });
  const existingMessage = page.getByText("質問12", { exact: true });
  const existingMessageTop = (await existingMessage.boundingBox())?.y;
  expect(existingMessageTop).toBeDefined();
  await showOlderButton.click();
  await expect(page.getByText("質問2", { exact: true })).toBeVisible();
  await expect(page.getByText("質問21", { exact: true })).toBeVisible();
  await expect(page.getByText("質問1", { exact: true })).toHaveCount(0);
  await expect(showOlderButton).toBeVisible();
  await expect
    .poll(async () => {
      const currentTop = (await existingMessage.boundingBox())?.y;
      return Math.abs((currentTop ?? 0) - (existingMessageTop ?? 0));
    })
    .toBeLessThan(32);

  await chatScroller.evaluate((element) => {
    const viewport =
      element.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
      element;
    viewport.scrollTop = 0;
  });
  await showOlderButton.click();
  await expect(page.getByText("質問1", { exact: true })).toBeVisible();
  await expect(page.getByText("質問21", { exact: true })).toBeVisible();
  await expect(showOlderButton).toHaveCount(0);

  await chatScroller.evaluate((element) => {
    const viewport =
      element.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]") ??
      element;
    viewport.scrollTop = 0;
  });

  await prompt.fill("過去ページからの質問");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("質問1", { exact: true })).toBeVisible();
  await heldAskStarted;
  await expect
    .poll(() =>
      chatScroller.evaluate((element) => {
        const viewport =
          element.querySelector<HTMLElement>(
            "[data-overlayscrollbars-viewport]",
          ) ?? element;
        return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      }),
    )
    .toBeLessThan(5);
  releaseHeldAsk();
  await expect.poll(getPersistedCount).toBe(44);
  await expect(page.getByText("過去ページからの質問")).toBeVisible();
  await expect(await getLatestMessages()).toEqual([
    "質問21",
    "テスト返答",
    "過去ページからの質問",
    "テスト返答",
  ]);

  const persistedCount = await getPersistedCount();
  expect(persistedCount).toBe(44);
  await page.reload();
  await expect(page.getByText("質問13", { exact: true })).toBeVisible();
  await expect(page.getByText("質問12", { exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      chatScroller.evaluate((element) => {
        const viewport =
          element.querySelector<HTMLElement>(
            "[data-overlayscrollbars-viewport]",
          ) ?? element;
        return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      }),
    )
    .toBeLessThan(5);
  await expect(await getLatestMessages()).toEqual([
    "質問21",
    "テスト返答",
    "過去ページからの質問",
    "テスト返答",
  ]);
  await expect(showOlderButton).toBeVisible();
});

test("shows OpenRouter privacy errors instead of saving an empty reply", async ({
  page,
}) => {
  await page.route("http://localhost:3001/api/ask", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "OpenRouter request failed (429): Provider returned error",
      }),
    }),
  );

  await page.goto("/ask");
  await page.locator("#prompt").fill("無料モデルを試す");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByRole("main").getByText(/Zero Data Retention/),
  ).toBeVisible();

  const savedReply = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("fluina-chat-archive");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("messages", "readonly");
          const allRequest = transaction.objectStore("messages").getAll();
          allRequest.onsuccess = () => {
            const latestAssistant = allRequest.result
              .filter(
                (message: { role: string }) => message.role === "assistant",
              )
              .at(-1);
            resolve(latestAssistant?.content ?? "");
          };
          allRequest.onerror = () => reject(allRequest.error);
          transaction.oncomplete = () => database.close();
        };
      }),
  );

  expect(savedReply).toContain("Zero Data Retention");
  expect(savedReply).not.toBe("");
});

test("shows an error when the chat stream completes without text", async ({
  page,
}) => {
  await page.route("http://localhost:3001/api/ask", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "",
    }),
  );

  await page.goto("/ask");
  await page.locator("#prompt").fill("空のストリームを確認");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page
      .getByRole("main")
      .getByText("AIから空の応答が返されました。時間をおいて再度お試しください。"),
  ).toBeVisible();
});
