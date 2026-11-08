import { expect, type Page, test } from "@playwright/test";

const heading = "見出しの文字が順番に滑らかに表示されます";
const paragraph = "その後に本文が表示されます";
const answer = `## ${heading}\n\n${paragraph}`;

async function mockAnswer(page: Page, response: string, held = false) {
  await page.addInitScript(
    ({ response, held }) => {
      const originalFetch = window.fetch;
      window.fetch = Object.assign(
        (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url !== "http://localhost:3001/api/ask") {
            return originalFetch(input, init);
          }
          if (!held) return Promise.resolve(new Response(response));
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(response));
                  (
                    window as Window & {
                      appendTestAnswer?: (text: string) => void;
                      finishTestAnswer?: () => void;
                    }
                  ).appendTestAnswer = (text) =>
                    controller.enqueue(new TextEncoder().encode(text));
                  (
                    window as Window & { finishTestAnswer?: () => void }
                  ).finishTestAnswer = () => controller.close();
                },
              }),
            ),
          );
        },
        originalFetch,
      );
    },
    { response, held },
  );
}

test("renders Markdown and HTML tables without the default frames or controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const wideCell = "W".repeat(300);
  await mockAnswer(
    page,
    `| 材料 | 分量 |\n| :--- | ---: |\n| ${wideCell} | 100g |\n\n<table><thead><tr><th>材料</th><th>分量</th></tr></thead><tbody><tr><td>牛乳</td><td>100ml</td></tr></tbody></table>\n\n\`\`\`js\nconst flour = 100;\n\`\`\``,
    true,
  );
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("表の表示");
  await page.getByRole("button", { name: "Send" }).click();

  const turn = page.locator("[data-chat-last-turn]").last();
  const tables = turn.getByRole("table");
  await expect(tables).toHaveCount(2);
  for (const table of await tables.all()) {
    await expect(table).toHaveCSS("margin-top", "0px");
    await expect(table).toHaveCSS("margin-bottom", "0px");
    const styles = await table.evaluate((element) => {
      const head = element.querySelector("thead");
      if (!head) throw new Error("Table header not found");
      const probe = document.createElement("span");
      element.parentElement?.append(probe);
      probe.style.color = "var(--back-2)";
      const headerColor = getComputedStyle(probe).color;
      probe.style.color = "var(--back-5)";
      const borderColor = getComputedStyle(probe).color;
      probe.remove();
      const region = element.closest("section");
      const frame = region?.parentElement;
      if (!region || !frame) throw new Error("Table frame not found");
      const frameStyle = getComputedStyle(frame);
      return {
        headerColor,
        actualHeaderColor: getComputedStyle(head).backgroundColor,
        borderColor,
        radius: frameStyle.borderTopLeftRadius,
        scrollRadius: getComputedStyle(region).borderTopLeftRadius,
        borders: ["Top", "Right", "Bottom", "Left"].map((side) => ({
          width: frameStyle.getPropertyValue(
            `border-${side.toLowerCase()}-width`,
          ),
          style: frameStyle.getPropertyValue(
            `border-${side.toLowerCase()}-style`,
          ),
          color: frameStyle.getPropertyValue(
            `border-${side.toLowerCase()}-color`,
          ),
        })),
      };
    });
    expect(styles.actualHeaderColor).toBe(styles.headerColor);
    expect(styles.radius).toBe("16px");
    expect(styles.scrollRadius).toBe(styles.radius);
    for (const border of styles.borders) {
      expect(border).toEqual({
        width: "1px",
        style: "solid",
        color: styles.borderColor,
      });
    }
    for (const cell of await table.locator("th, td").all()) {
      await expect(cell).toHaveCSS("padding-left", "16px");
      await expect(cell).toHaveCSS("padding-right", "16px");
      await expect(cell).toHaveCSS("vertical-align", "middle");
    }
    for (const header of await table.locator("thead th").all()) {
      await expect(header).toHaveCSS("padding-top", "8px");
      await expect(header).toHaveCSS("padding-bottom", "8px");
    }
  }
  await expect(tables.first().locator("thead th").first()).toHaveCSS(
    "text-align",
    "left",
  );
  await expect(tables.first().locator("tbody td").last()).toHaveCSS(
    "text-align",
    "right",
  );
  await expect(turn.locator('[data-streamdown="table-wrapper"]')).toHaveCount(
    0,
  );
  await expect(turn.getByRole("button", { name: "Copy table" })).toHaveCount(0);
  await expect(
    turn.getByRole("button", { name: "Download table" }),
  ).toHaveCount(0);
  await expect(
    turn.getByRole("button", { name: "View fullscreen" }),
  ).toHaveCount(0);
  await expect(tables.nth(1).getByText("牛乳")).toBeVisible();
  await expect(turn.locator("pre code")).toHaveText("const flour = 100;\n");
  await expect(turn.getByRole("button", { name: "Copy code" })).toHaveCount(1);
  const region = turn.getByRole("region", { name: "表" }).first();
  expect(
    await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);

  await page.evaluate(() => {
    (window as Window & { finishTestAnswer?: () => void }).finishTestAnswer?.();
  });
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  await expect(tables).toHaveCount(2);
  await expect(turn.locator('[data-streamdown="table-wrapper"]')).toHaveCount(
    0,
  );
});

test("shows a keyboard focus ring and scroll controls for wide tables", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(
    page,
    `[前のリンク](https://example.com)\n\n| A | B |\n| --- | --- |\n| ${"W".repeat(300)} | 2 |`,
    true,
  );
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("表の操作");
  await page.getByRole("button", { name: "Send" }).click();

  const turn = page.locator("[data-chat-last-turn]").last();
  const region = turn.getByRole("region", { name: "表" });
  await expect(region).toHaveAttribute("data-scroll-edge-fade", "");
  await expect
    .poll(() =>
      region.evaluate((element) =>
        element.style.getPropertyValue("--scroll-fade-right"),
      ),
    )
    .toBe("1");
  const shadow = () =>
    region.evaluate((element) => {
      const wrapper = element.parentElement;
      if (!wrapper) throw new Error("Table wrapper not found");
      return getComputedStyle(wrapper).boxShadow;
    });
  const unfocusedShadow = await shadow();
  await turn.getByRole("link", { name: "前のリンク" }).focus();
  await page.keyboard.press("Tab");
  await expect(region).toBeFocused();
  await expect(region).toHaveCSS("outline-style", "none");
  await expect.poll(shadow).not.toBe(unfocusedShadow);
  expect(await shadow()).toMatch(/2px/);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      region.evaluate((element) =>
        element.style.getPropertyValue("--scroll-fade-left"),
      ),
    )
    .toBe("1");

  await page.evaluate(() => {
    (window as Window & { finishTestAnswer?: () => void }).finishTestAnswer?.();
  });
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  await region.scrollIntoViewIfNeeded();
  const bounds = await region.boundingBox();
  if (!bounds) throw new Error("Table region not found");
  await page.mouse.click(
    bounds.x + bounds.width - 20,
    bounds.y + bounds.height / 2,
  );
  await expect
    .poll(() =>
      region.evaluate(
        (element) =>
          element.scrollWidth - element.clientWidth - element.scrollLeft,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      region.evaluate((element) =>
        element.style.getPropertyValue("--scroll-fade-right"),
      ),
    )
    .toBe("0");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`fills the response width for code and tables at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const wide = "W".repeat(300);
    await mockAnswer(
      page,
      `\`\`\`js\nshort();\n\`\`\`\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>\n\n\`\`\`text\n${wide}\n\`\`\`\n\n| A | B |\n| --- | --- |\n| ${wide} | 2 |`,
      true,
    );
    await page.goto("/ask");
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await page.locator("#prompt").fill("幅の検証");
    await page.getByRole("button", { name: "Send" }).click();
    const turn = page.locator("[data-chat-last-turn]").last();
    await expect(turn.locator("pre")).toHaveCount(2);
    await expect(turn.getByRole("region", { name: "表" })).toHaveCount(3);

    const checkWidths = async () => {
      const measurements = await turn.evaluate((element) => {
        const prose = element.querySelector<HTMLElement>(".prose");
        const message = prose?.parentElement;
        if (!prose || !message) throw new Error("Response not found");
        const width = (el: Element) => el.getBoundingClientRect().width;
        return {
          turn: width(element),
          message: width(message),
          prose: width(prose),
          blocks: Array.from(
            prose.querySelectorAll("[data-code-frame]"),
            width,
          ),
          tables: Array.from(
            prose.querySelectorAll<HTMLElement>("section[aria-label='表']"),
            (region) => {
              const table = region.querySelector("table");
              const frame = region.parentElement;
              if (!table || !frame) throw new Error("Table not found");
              const proseRect = prose.getBoundingClientRect();
              const frameRect = frame.getBoundingClientRect();
              return {
                region: width(region),
                table: width(table),
                leftInset: frameRect.left - proseRect.left,
                rightInset: proseRect.right - frameRect.right,
                scrollWidth: region.scrollWidth,
                clientWidth: region.clientWidth,
              };
            },
          ),
          codeScroll: (() => {
            const pre = prose.querySelectorAll("pre")[1];
            return {
              scrollWidth: pre.scrollWidth,
              clientWidth: pre.clientWidth,
            };
          })(),
        };
      });
      expect(Math.abs(measurements.message - measurements.turn)).toBeLessThan(
        1,
      );
      expect(Math.abs(measurements.prose - measurements.message)).toBeLessThan(
        1,
      );
      for (const width of measurements.blocks) {
        expect(Math.abs(width - measurements.prose)).toBeLessThan(1);
      }
      for (const table of measurements.tables) {
        expect(table.table).toBeGreaterThanOrEqual(table.region - 1);
        expect(table.leftInset).toBeGreaterThanOrEqual(2);
        expect(table.rightInset).toBeGreaterThanOrEqual(2);
        expect(Math.abs(table.leftInset - table.rightInset)).toBeLessThan(1);
      }
      expect(measurements.tables[2].scrollWidth).toBeGreaterThan(
        measurements.tables[2].clientWidth,
      );
      expect(measurements.codeScroll.scrollWidth).toBeGreaterThan(
        measurements.codeScroll.clientWidth,
      );
    };

    await checkWidths();
    await page.evaluate(() => {
      (
        window as Window & { finishTestAnswer?: () => void }
      ).finishTestAnswer?.();
    });
    await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
    await checkWidths();
    await page.reload();
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await expect(turn.locator("pre")).toHaveCount(2);
    await checkWidths();
  });
}

test("renders and preserves a streamed code block with code controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(page, "```js\nconst answer =", true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コード");
  await page.getByRole("button", { name: "Send" }).click();
  const turn = page.locator("[data-chat-last-turn]").last();
  const code = turn.locator("pre code");
  await expect(code).toContainText("const answer =");
  await expect(code.locator(".syntax-token")).toHaveCount(0);
  await expect(turn.locator('[data-streamdown="code-block"]')).toHaveCount(0);
  const pre = turn.locator("pre");
  await expect(pre).toHaveCSS("overflow-x", "auto");
  await expect(pre.locator("code")).toHaveAttribute(
    "data-code-line-numbers",
    "",
  );
  await expect(pre.locator(".code-line")).toHaveCount(2);
  await expect(pre.locator(".code-line").first()).toHaveAttribute(
    "data-line-number",
    "1",
  );
  const lineLayout = await pre.locator(".code-line").evaluateAll((elements) =>
    elements.map((line) => {
      const bounds = line.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        paddingLeft: getComputedStyle(line).paddingLeft,
      };
    }),
  );
  expect(new Set(lineLayout.map((line) => line.width)).size).toBe(1);
  expect(lineLayout[1].top - lineLayout[0].top).toBe(lineLayout[0].height);
  expect(lineLayout[1].height).toBe(lineLayout[0].height);
  expect(Number.parseFloat(lineLayout[0].paddingLeft)).toBeLessThan(80);
  expect(
    await pre
      .locator(".code-line")
      .first()
      .evaluate((line) => {
        return getComputedStyle(line, "::before").userSelect;
      }),
  ).toBe("none");
  await expect(pre).toHaveCSS("border-bottom-left-radius", "16px");
  await expect(pre).toHaveCSS("border-bottom-right-radius", "16px");
  await expect(pre.locator("../..")).toHaveCSS(
    "border-bottom-left-radius",
    "16px",
  );
  await expect(pre.locator("../..")).toHaveCSS(
    "border-bottom-right-radius",
    "16px",
  );
  await expect(turn.getByRole("button", { name: "Save code" })).toBeEnabled();
  const header = turn.locator("[data-code-header]");
  await expect(header).toHaveCSS("border-bottom-width", "1px");
  const clippedFrame = pre.locator("xpath=ancestor::div[@data-code-frame]");
  await expect(clippedFrame.locator(":scope > div > div")).toHaveCSS(
    "overflow",
    "hidden",
  );
  await expect(clippedFrame.locator(":scope > div > div")).toHaveCSS(
    "border-bottom-left-radius",
    "16px",
  );
  await expect(clippedFrame.locator(":scope > div > div")).toHaveCSS(
    "border-bottom-right-radius",
    "16px",
  );
  const styling = await pre.evaluate((element) => {
    const before = getComputedStyle(element).paddingLeft;
    const prose = element.closest(".prose");
    if (!prose) throw new Error("Prose container not found");
    prose.classList.remove("prose");
    const without = getComputedStyle(element).paddingLeft;
    prose.classList.add("prose");
    return { before, without };
  });
  expect(styling.before).not.toBe(styling.without);
  await turn.getByRole("button", { name: "Expand code" }).click();
  const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  await expect(dialog.locator("code")).toContainText("const answer =");
  await page.evaluate(() => {
    const stream = window as Window & {
      appendTestAnswer?: (chunk: string) => void;
      finishTestAnswer?: () => void;
    };
    stream.appendTestAnswer?.(" 42;\n```\n");
    stream.finishTestAnswer?.();
  });
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  await expect(dialog.locator("code")).toHaveText("const answer = 42;\n");
  await dialog.getByRole("button", { name: "Close expanded code" }).click();
  await expect(code).toHaveText("const answer = 42;\n");
  await expect(code).toHaveClass(/language-js/);
  await expect
    .poll(() => code.locator(".syntax-token").count(), { timeout: 30000 })
    .toBeGreaterThan(1);
  await expect(turn.getByRole("button", { name: "Copy code" })).toHaveCount(1);
});

test("does not animate streamed code layout while its size changes", async ({
  page,
}) => {
  await mockAnswer(page, "```js\nconst answer =", true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コード");
  await page.getByRole("button", { name: "Send" }).click();

  const turn = page.locator("[data-chat-last-turn]").last();
  const code = turn.locator("pre code");
  await expect(code).toContainText("const answer =");
  await page.evaluate(() => {
    const state = window as Window & {
      codeLayoutSamples?: { frame: string; content: string; header: string }[];
      stopCodeLayoutSampling?: boolean;
    };
    state.codeLayoutSamples = [];
    state.stopCodeLayoutSampling = false;
    const sample = () => {
      const frame = document.querySelector<HTMLElement>(
        "[data-code-frame] > div",
      );
      const content = document.querySelector<HTMLElement>(
        "[data-code-frame] [data-code-content]",
      );
      const header = document.querySelector<HTMLElement>(
        "[data-code-frame] [data-code-header]",
      );
      if (frame && content && header) {
        state.codeLayoutSamples?.push({
          frame: getComputedStyle(frame).transform,
          content: getComputedStyle(content).transform,
          header: getComputedStyle(header).transform,
        });
      }
      if (!state.stopCodeLayoutSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  for (const chunk of [" 42;\n", "const next = [\n", "  1,\n  2,\n];\n"]) {
    await page.evaluate((nextChunk) => {
      (
        window as Window & {
          appendTestAnswer?: (value: string) => void;
        }
      ).appendTestAnswer?.(nextChunk);
    }, chunk);
    await expect(code).toContainText(chunk.trim());
    await page.waitForTimeout(100);
  }
  const samples = await page.evaluate(() => {
    const state = window as Window & {
      codeLayoutSamples?: { frame: string; content: string; header: string }[];
      stopCodeLayoutSampling?: boolean;
    };
    state.stopCodeLayoutSampling = true;
    return state.codeLayoutSamples ?? [];
  });
  expect(samples.length).toBeGreaterThan(10);
  expect(
    samples.every(
      ({ frame, content, header }) =>
        frame === "none" && content === "none" && header === "none",
    ),
    JSON.stringify(samples),
  ).toBe(true);
});

test("highlights each completed streamed code block before the reply finishes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(
    page,
    "```js\nconst first = 1;\n```\n\n```js\nconst second =",
    true,
  );
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("複数のコードブロック");
  await page.getByRole("button", { name: "Send" }).click();

  const codes = page.locator("[data-chat-last-turn] pre code");
  await expect(codes).toHaveCount(2);
  await expect
    .poll(() => codes.nth(0).locator(".syntax-token").count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(1);
  await expect(codes.nth(1).locator(".syntax-token")).toHaveCount(0);
  await expect(page.locator("[data-chat-disclaimer]")).toHaveCount(0);

  await page.evaluate(() => {
    const stream = window as Window & {
      appendTestAnswer?: (chunk: string) => void;
      finishTestAnswer?: () => void;
    };
    stream.appendTestAnswer?.("\n```");
    stream.finishTestAnswer?.();
  });
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  await expect
    .poll(() => codes.nth(1).locator(".syntax-token").count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(1);
});

test("allows selecting code together with line breaks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(page, "```js\nfirstLine();\nsecondLine();\n```");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("改行選択");
  await page.getByRole("button", { name: "Send" }).click();

  const code = page.locator("[data-chat-last-turn] pre code");
  await expect
    .poll(() => code.locator(".syntax-token").count(), { timeout: 30000 })
    .toBeGreaterThan(0);
  const bounds = await code.evaluate((element) => {
    const lines = element.querySelectorAll(".code-line");
    const firstLine = lines[0];
    const lastLine = lines[1];
    if (!firstLine || !lastLine) throw new Error("Code lines not rendered");
    const firstText = document
      .createTreeWalker(firstLine, NodeFilter.SHOW_TEXT)
      .nextNode();
    const lastWalker = document.createTreeWalker(
      lastLine,
      NodeFilter.SHOW_TEXT,
    );
    let lastText = lastWalker.nextNode();
    while (lastWalker.nextNode()) lastText = lastWalker.currentNode;
    if (!firstText?.textContent || !lastText?.textContent) {
      throw new Error("Selectable code text not found");
    }
    const firstRange = document.createRange();
    firstRange.setStart(firstText, 0);
    firstRange.setEnd(firstText, 1);
    const firstRect = firstRange.getBoundingClientRect();
    const lastRange = document.createRange();
    lastRange.setStart(lastText, lastText.textContent.length - 1);
    lastRange.setEnd(lastText, lastText.textContent.length);
    const lastRect = lastRange.getBoundingClientRect();
    return {
      start: { x: firstRect.x, y: firstRect.y + firstRect.height / 2 },
      end: {
        x: lastRect.x + lastRect.width,
        y: lastRect.y + lastRect.height / 2,
      },
    };
  });
  await page.mouse.move(bounds.start.x, bounds.start.y);
  await page.mouse.down();
  await page.mouse.move(bounds.end.x, bounds.end.y, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "firstLine();\nsecondLine();",
  );
});

test("preserves empty lines when copying a code block", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedCode?: string }).copiedCode = text;
        },
      },
    });
  });
  await mockAnswer(page, "```js\nfirstLine();\n\nsecondLine();\n```");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("空行選択");
  await page.getByRole("button", { name: "Send" }).click();

  const code = page.locator("[data-chat-last-turn] pre code");
  await expect(code).toHaveText("firstLine();\n\nsecondLine();\n");
  await page
    .locator("[data-chat-last-turn]")
    .getByRole("button", { name: "Copy code" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { copiedCode?: string }).copiedCode,
      ),
    )
    .toBe("firstLine();\n\nsecondLine();\n");
});

test("renders multiline user messages with the same Markdown and code controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedCode?: string }).copiedCode = text;
        },
      },
    });
  });
  await mockAnswer(page, "回答");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);

  const prompt = [
    "# User title",
    "",
    "Text **bold**",
    "",
    "```js",
    "firstLine();",
    "",
    "secondLine();",
    "```",
  ].join("\n");
  await page.locator("#prompt").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();

  const userMessage = page
    .locator("[data-chat-message-id]")
    .filter({ has: page.getByRole("heading", { name: "User title" }) });
  await expect(
    userMessage.getByRole("heading", { name: "User title" }),
  ).toBeVisible();
  await expect(userMessage.getByText("Text bold")).toBeVisible();
  await expect(userMessage.locator("strong")).toHaveText("bold");
  const code = userMessage.locator("pre code");
  await expect(code).toHaveText("firstLine();\n\nsecondLine();\n");
  await expect(
    userMessage.getByRole("button", { name: "Copy code" }),
  ).toBeVisible();
  await userMessage.getByRole("button", { name: "Copy code" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { copiedCode?: string }).copiedCode,
      ),
    )
    .toBe("firstLine();\n\nsecondLine();\n");
});

test("keeps code text at a stable size while a streamed code block grows", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockAnswer(page, "```js\nconst value = 1;", true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コード生成");
  await page.getByRole("button", { name: "Send" }).click();

  const code = page.locator("[data-chat-last-turn] pre code");
  await expect(code).toContainText("const value = 1;");
  await page.evaluate(() => {
    const stream = window as Window & {
      appendTestAnswer?: (chunk: string) => void;
    };
    stream.appendTestAnswer?.(
      `${Array.from(
        { length: 20 },
        (_, index) => `\nconst item${index} = ${index};`,
      ).join("")}\n\`\`\``,
    );
  });

  const characterWidths = await code.evaluate(
    (element) =>
      new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        const start = performance.now();
        const sample = () => {
          const text = document
            .createTreeWalker(element, NodeFilter.SHOW_TEXT)
            .nextNode();
          if (text?.textContent) {
            const range = document.createRange();
            range.setStart(text, 0);
            range.setEnd(text, Math.min(3, text.textContent.length));
            samples.push(range.getBoundingClientRect().width);
          }
          if (performance.now() - start < 700) requestAnimationFrame(sample);
          else resolve(samples);
        };
        requestAnimationFrame(sample);
      }),
  );

  expect(characterWidths.length).toBeGreaterThan(2);
  expect(
    Math.max(...characterWidths) - Math.min(...characterWidths),
  ).toBeLessThan(1);
});

test("supports horizontal and vertical edge scrolling in expanded code", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const longLine = `const value = ${"W".repeat(240)}`;
  const code = [
    "```text",
    longLine,
    ...Array.from({ length: 100 }, (_, index) => `line ${index}`),
    "```",
    "",
    "```text",
    "another code block",
    "```",
  ].join("\n");
  await mockAnswer(page, code);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("長いコードをスクロール");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  const turn = page.locator("[data-chat-last-turn]").last();
  const codeFrames = turn.locator("[data-code-frame]");
  const collapsedViewport = codeFrames.first().locator("pre");
  await expect(collapsedViewport).toBeVisible();
  await expect(collapsedViewport).toHaveCSS("border-top-left-radius", "0px");
  await expect(collapsedViewport).toHaveCSS(
    "border-bottom-left-radius",
    "16px",
  );
  const collapsedWidth = await collapsedViewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(collapsedWidth.scrollWidth).toBeGreaterThan(
    collapsedWidth.clientWidth,
  );
  await expect(collapsedViewport).toHaveCSS("--scroll-fade-right", "1");
  await collapsedViewport.click({
    position: { x: collapsedWidth.clientWidth - 2, y: 20 },
  });
  await expect
    .poll(() => collapsedViewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await collapsedViewport.click({ position: { x: 2, y: 20 } });
  await expect
    .poll(() => collapsedViewport.evaluate((element) => element.scrollLeft))
    .toBe(0);
  await collapsedViewport.evaluate((element) => {
    element.scrollLeft = 30;
  });
  await expect
    .poll(() => collapsedViewport.evaluate((element) => element.scrollLeft))
    .toBe(30);

  await codeFrames.first().getByRole("button", { name: "Expand code" }).click();

  const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  const viewport = dialog.locator("pre[data-scroll-edge-fade]");
  await expect(viewport).toBeVisible();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBe(30);
  await expect(dialog.locator(".bg-back-2").first()).toHaveCSS(
    "border-top-left-radius",
    "0px",
  );
  await expect
    .poll(() =>
      viewport.evaluate((element) => {
        const backing = element.parentElement;
        if (!backing) throw new Error("Code viewport backing is missing");
        return (
          getComputedStyle(element).backgroundColor ===
          getComputedStyle(backing).backgroundColor
        );
      }),
    )
    .toBe(true);
  await expect(page.locator("body")).toHaveAttribute(
    "data-code-dialog-open",
    "",
  );
  await expect
    .poll(() =>
      page
        .locator("main .scroll-edge-blur")
        .evaluateAll((overlays) =>
          overlays.some((overlay) => getComputedStyle(overlay).opacity === "1"),
        ),
    )
    .toBe(true);
  await expect(viewport.locator("code .code-line")).toHaveCount(102);
  const expandedLineLayout = await viewport
    .locator(".code-line")
    .evaluateAll((lines) =>
      lines.map((line) => {
        const bounds = line.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          paddingLeft: Number.parseFloat(getComputedStyle(line).paddingLeft),
        };
      }),
    );
  expect(new Set(expandedLineLayout.map((line) => line.width)).size).toBe(1);
  expect(expandedLineLayout[1].top - expandedLineLayout[0].top).toBe(
    expandedLineLayout[0].height,
  );
  expect(expandedLineLayout.at(-1)?.paddingLeft).toBeLessThan(80);
  await expect(collapsedViewport).not.toHaveAttribute("data-scroll-edge-fade");
  await expect(codeFrames.nth(1).locator("pre")).toHaveAttribute(
    "data-scroll-edge-fade",
    "",
  );
  const dimensions = await viewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);

  await viewport.click({
    position: { x: dimensions.clientWidth / 2, y: dimensions.clientHeight - 2 },
  });
  await expect
    .poll(() =>
      viewport.evaluate((element) => element.scrollTop + element.clientHeight),
    )
    .toBeGreaterThanOrEqual(dimensions.scrollHeight - 1);
  await viewport.click({
    position: { x: dimensions.clientWidth - 2, y: dimensions.clientHeight / 2 },
  });
  await expect
    .poll(() =>
      viewport.evaluate((element) => element.scrollLeft + element.clientWidth),
    )
    .toBeGreaterThanOrEqual(dimensions.scrollWidth - 1);
  await viewport.evaluate((element) => {
    element.scrollLeft = 80;
  });
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBe(80);
  await dialog.getByRole("button", { name: "Close expanded code" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-code-dialog-open",
  );
  await expect(collapsedViewport).toHaveAttribute("data-scroll-edge-fade", "");
  const expectedRestoredScrollLeft = await collapsedViewport.evaluate(
    (element) => Math.min(80, element.scrollWidth - element.clientWidth),
  );
  expect(expectedRestoredScrollLeft).toBeGreaterThan(0);
  await expect
    .poll(() => collapsedViewport.evaluate((element) => element.scrollLeft))
    .toBe(expectedRestoredScrollLeft);
  const edgeOverlayBounds = await collapsedViewport.evaluate((element) => {
    const overlay = element.nextElementSibling;
    if (!(overlay instanceof HTMLElement)) {
      throw new Error("Code edge overlay not found");
    }
    const codeRect = element.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
      codeTop: codeRect.top,
      overlayTop: overlayRect.top,
      codeBottom: codeRect.bottom,
      overlayBottom: overlayRect.bottom,
    };
  });
  expect(edgeOverlayBounds.overlayTop).toBeGreaterThanOrEqual(
    edgeOverlayBounds.codeTop - 1,
  );
  expect(edgeOverlayBounds.overlayBottom).toBeLessThanOrEqual(
    edgeOverlayBounds.codeBottom + 1,
  );
  const headerOverlayOverlap = await collapsedViewport.evaluate((element) => {
    const overlay = element.nextElementSibling;
    const header = element
      .closest("[data-code-frame]")
      ?.querySelector("[data-code-header]");
    if (!(overlay instanceof HTMLElement) || !(header instanceof HTMLElement)) {
      throw new Error("Code header or edge overlay is missing");
    }
    const overlayBounds = overlay.getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    return (
      overlayBounds.left < headerBounds.right &&
      overlayBounds.right > headerBounds.left &&
      overlayBounds.top < headerBounds.bottom &&
      overlayBounds.bottom > headerBounds.top
    );
  });
  expect(headerOverlayOverlap).toBe(false);
  const restoredWidth = await collapsedViewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(restoredWidth.scrollWidth).toBeGreaterThan(restoredWidth.clientWidth);
  await expect(collapsedViewport).toHaveCSS("--scroll-fade-right", "1");
});

test("keeps mobile code shrink animation in sync with its border", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockAnswer(page, `\`\`\`text\n${"W".repeat(160)}\n\`\`\``);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コードを縮小");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();

  const frame = page
    .locator("[data-chat-last-turn]")
    .last()
    .locator("[data-code-frame]");
  const sourceContent = frame.locator("[data-code-content]");
  const source = frame.locator("pre");
  const codeRegion = source.locator("xpath=..");
  const codeHeader = frame.locator(".bg-back-2").first();
  const originBounds = await frame.boundingBox();
  const originContentBounds = await sourceContent.boundingBox();
  if (!originBounds) throw new Error("Collapsed code frame is not visible");
  if (!originContentBounds)
    throw new Error("Collapsed code content is not visible");
  await expect(codeHeader).toHaveCSS("border-top-left-radius", "16px");
  await expect(codeRegion).toHaveCSS("border-top-left-radius", "0px");
  await expect(source).toHaveCSS("border-top-left-radius", "0px");

  await frame.getByRole("button", { name: "Expand code" }).click();
  const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  const expandedCode = dialog.locator("pre");
  await expect(expandedCode).toBeVisible();
  const expandedContent = dialog.locator("[data-code-content]");
  await page.waitForTimeout(600);
  const expandedContentBounds = await expandedContent.boundingBox();
  if (!expandedContentBounds)
    throw new Error("Expanded code content is not visible");
  await expandedCode.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const expandedBounds = await dialog.locator(".prose-fluina").boundingBox();
  if (!expandedBounds) throw new Error("Expanded code frame is not visible");
  const closeTargetBounds = await frame.boundingBox();
  if (!closeTargetBounds)
    throw new Error("Collapsed code target is not measurable");

  await page.evaluate(() => {
    const state = window as Window & {
      closeCrossfadeSamples?: {
        source: number;
        dialog: number;
        sourceWidth: number;
        sourceHeight: number;
        dialogWidth: number;
        dialogHeight: number;
      }[];
      stopCloseCrossfadeSampling?: boolean;
    };
    state.closeCrossfadeSamples = [];
    state.stopCloseCrossfadeSampling = false;
    const sample = () => {
      const dialogElement = document.querySelector<HTMLElement>(
        '[aria-label="Fullscreen Code View"] .prose-fluina',
      );
      const sourceSurface =
        document.querySelector<HTMLElement>(
          "[data-code-frame]",
        )?.firstElementChild;
      const isClosing = document.querySelector(
        ".code-dialog-overlay[data-closing]",
      );
      if (isClosing && dialogElement && sourceSurface instanceof HTMLElement) {
        const sourceBounds = sourceSurface.getBoundingClientRect();
        const dialogBounds = dialogElement.getBoundingClientRect();
        state.closeCrossfadeSamples?.push({
          source: Number(getComputedStyle(sourceSurface).opacity),
          dialog: Number(getComputedStyle(dialogElement).opacity),
          sourceWidth: sourceBounds.width,
          sourceHeight: sourceBounds.height,
          dialogWidth: dialogBounds.width,
          dialogHeight: dialogBounds.height,
        });
      }
      if (!state.stopCloseCrossfadeSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await dialog.getByRole("button", { name: "Close expanded code" }).click();
  await expect(dialog).toHaveCount(0);
  const closeCrossfadeSamples = await page.evaluate(() => {
    const state = window as Window & {
      closeCrossfadeSamples?: {
        source: number;
        dialog: number;
        sourceWidth: number;
        sourceHeight: number;
        dialogWidth: number;
        dialogHeight: number;
      }[];
      stopCloseCrossfadeSampling?: boolean;
    };
    state.stopCloseCrossfadeSampling = true;
    return state.closeCrossfadeSamples ?? [];
  });
  expect(
    closeCrossfadeSamples.some(
      ({ source, dialog: dialogOpacity }) =>
        source > 0 &&
        source < 1 &&
        dialogOpacity > 0 &&
        dialogOpacity < 1 &&
        Math.abs(source + dialogOpacity - 1) < 0.1,
    ),
    JSON.stringify(closeCrossfadeSamples),
  ).toBe(true);
  const activeCloseCrossfadeSamples = closeCrossfadeSamples.filter(
    ({ source, dialog: dialogOpacity }) =>
      (source > 0 && source < 1) || (dialogOpacity > 0 && dialogOpacity < 1),
  );
  expect(activeCloseCrossfadeSamples.length).toBeGreaterThan(0);
  expect(
    activeCloseCrossfadeSamples.every(
      ({ source, dialog: dialogOpacity }) =>
        Math.abs(source + dialogOpacity - 1) < 0.02,
    ),
    JSON.stringify(activeCloseCrossfadeSamples),
  ).toBe(true);
  for (const heightKey of ["sourceHeight", "dialogHeight"] as const) {
    const heights = closeCrossfadeSamples.map((sample) => sample[heightKey]);
    expect(
      Math.max(...heights) - Math.min(...heights),
      JSON.stringify(closeCrossfadeSamples),
    ).toBeGreaterThan(20);
  }
  await expect(frame.locator(":scope > :first-child")).toHaveCSS(
    "opacity",
    "1",
  );
  const restoredBounds = await frame.boundingBox();
  if (!restoredBounds) throw new Error("Collapsed code frame was not restored");
  expect(Math.abs(restoredBounds.x - closeTargetBounds.x)).toBeLessThan(1);
  expect(Math.abs(restoredBounds.y - closeTargetBounds.y)).toBeLessThan(1);
  expect(Math.abs(restoredBounds.width - closeTargetBounds.width)).toBeLessThan(
    1,
  );
  expect(
    Math.abs(restoredBounds.height - closeTargetBounds.height),
  ).toBeLessThan(1);
  await expect(source).toHaveAttribute("data-scroll-edge-fade", "");
  const overlayBounds = await source.evaluate((element) => {
    const overlay = element.nextElementSibling;
    if (!(overlay instanceof HTMLElement)) {
      throw new Error("Code edge overlay not found");
    }
    const codeRect = element.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
      codeTop: codeRect.top,
      overlayTop: overlayRect.top,
      codeBottom: codeRect.bottom,
      overlayBottom: overlayRect.bottom,
    };
  });
  expect(overlayBounds.overlayTop).toBeGreaterThanOrEqual(
    overlayBounds.codeTop - 1,
  );
  expect(overlayBounds.overlayBottom).toBeLessThanOrEqual(
    overlayBounds.codeBottom + 1,
  );
});

test("supports mobile drag-to-close from the code header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
  });
  await mockAnswer(
    page,
    `\`\`\`python\n${Array.from({ length: 6 }, (_, index) => `print(${index})`).join("\n")}\n\`\`\``,
  );
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コードをモバイルで開く");
  await page.getByRole("button", { name: "Send" }).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Send control is not a button");
    }
    button.click();
  });
  const turn = page.locator("[data-chat-last-turn]").last();
  const sourceCode = turn.locator("pre code");
  await expect(sourceCode.locator(".code-line")).toHaveCount(7);
  await turn.getByRole("button", { name: "Expand code" }).click();

  const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  await expect(dialog).toBeVisible();
  const header = dialog.locator(".bg-back-2").first();
  await expect(header).toHaveClass(/touch-none/);
  const codeViewport = dialog.locator("pre");
  await expect(codeViewport).toHaveAttribute(
    "class",
    expect.stringContaining("pb-[env(safe-area-inset-bottom,1rem)]"),
  );
  const codeBounds = await codeViewport.boundingBox();
  if (!codeBounds) throw new Error("Expanded code is not visible");
  await page.mouse.move(
    codeBounds.x + 40,
    codeBounds.y + codeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    codeBounds.x + 40,
    codeBounds.y + codeBounds.height / 2 + 140,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(dialog).toBeVisible();

  const bounds = await header.boundingBox();
  if (!bounds) throw new Error("Code header is not visible");
  await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2 - 260, {
    steps: 10,
  });
  const backdropAlpha = await page
    .locator(".code-dialog-backdrop")
    .evaluate((element) =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue(
          "--code-dialog-backdrop-alpha",
        ),
      ),
    );
  expect(backdropAlpha).toBeGreaterThan(50);
  expect(backdropAlpha).toBeLessThanOrEqual(100);
  const dragTransform = await dialog
    .locator(".prose-fluina > div")
    .evaluate((element) => getComputedStyle(element).transform);
  expect(dragTransform).not.toBe("none");
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(500);

  const updatedHeaderBounds = await header.boundingBox();
  if (!updatedHeaderBounds) throw new Error("Code header is not visible");
  await page.mouse.move(
    updatedHeaderBounds.x + 40,
    updatedHeaderBounds.y + updatedHeaderBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    updatedHeaderBounds.x + 40,
    updatedHeaderBounds.y + updatedHeaderBounds.height / 2 + 140,
    { steps: 10 },
  );
  const downwardAlpha = await page
    .locator(".code-dialog-backdrop")
    .evaluate((element) =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue(
          "--code-dialog-backdrop-alpha",
        ),
      ),
    );
  expect(downwardAlpha).toBeGreaterThanOrEqual(0);
  expect(downwardAlpha).toBeLessThan(50);
  await page.evaluate(() => {
    const state = window as Window & {
      closingSurfaceSamples?: {
        top: number;
        dialogOpacity: number;
        sourceOpacity: number;
      }[];
      stopClosingSurfaceSampling?: boolean;
    };
    state.closingSurfaceSamples = [];
    state.stopClosingSurfaceSampling = false;
    const sample = () => {
      const surface = document.querySelector<HTMLElement>(
        '[aria-label="Fullscreen Code View"] .prose-fluina > div',
      );
      if (surface?.closest(".code-dialog-overlay[data-closing]")) {
        const dialog = surface.closest<HTMLElement>(
          '[aria-label="Fullscreen Code View"] .prose-fluina',
        );
        if (dialog) {
          state.closingSurfaceSamples?.push({
            top: surface.getBoundingClientRect().top,
            dialogOpacity: Number(getComputedStyle(dialog).opacity),
            sourceOpacity: Number(
              getComputedStyle(
                document.querySelector("[data-code-frame] > div") ??
                  document.body,
              ).opacity,
            ),
          });
        }
      }
      if (!state.stopClosingSurfaceSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  const closingSurfaceSamples = await page.evaluate(() => {
    const state = window as Window & {
      closingSurfaceSamples?: {
        top: number;
        dialogOpacity: number;
        sourceOpacity: number;
      }[];
      stopClosingSurfaceSampling?: boolean;
    };
    state.stopClosingSurfaceSampling = true;
    return state.closingSurfaceSamples ?? [];
  });
  expect(closingSurfaceSamples.length).toBeGreaterThan(2);
  await expect(turn.locator("[data-code-frame] > div").first()).toBeVisible();
  const visibleCloseSamples = closingSurfaceSamples.filter(
    ({ dialogOpacity }) => dialogOpacity > 0.05,
  );
  expect(visibleCloseSamples.length).toBeGreaterThan(0);
  expect(
    visibleCloseSamples.some(
      ({ dialogOpacity, sourceOpacity }) =>
        dialogOpacity < 0.25 && sourceOpacity > 0.75,
    ),
  ).toBe(true);
  expect(
    Math.max(
      ...visibleCloseSamples
        .slice(1)
        .map((sample, index) =>
          Math.abs(sample.top - visibleCloseSamples[index].top),
        ),
    ),
    JSON.stringify(visibleCloseSamples),
  ).toBeLessThan(80);
});

test("fades the mobile menu backdrop as the sheet is dragged down", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
  });
  await page.goto("/ask");
  await page.getByRole("button", { name: "Attatch" }).click();

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const sheet = page.locator(".rounded-t-4xl").last();
  await expect
    .poll(() => sheet.evaluate((element) => getComputedStyle(element).filter))
    .toBe("none");
  const backdrop = page.locator(".absolute.inset-0.bg-back-0").last();
  const handle = page.getByRole("button", { name: "Switch menu height" });
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error("Mobile menu handle is not visible");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2 + 60,
    { steps: 5 },
  );
  const opacity = Number.parseFloat(
    await backdrop.evaluate((element) => getComputedStyle(element).opacity),
  );
  expect(opacity).toBeGreaterThanOrEqual(0);
  expect(opacity).toBeLessThan(0.5);
  await page.mouse.up();
});

test("reports clipboard failures without claiming a successful copy", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard unavailable");
        },
      },
    });
  });
  await mockAnswer(page, "```js\nexample();\n```");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コピー");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  const frame = page
    .locator("[data-chat-last-turn]")
    .last()
    .locator("pre")
    .locator("..");
  await frame.getByRole("button", { name: "Copy code" }).click();
  await expect(frame.getByRole("alert")).toHaveText(
    "コードをコピーできませんでした。",
  );
  await expect(frame.locator("svg.lucide-copy")).toBeVisible();
});

test("morphs the code block into and out of fullscreen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedCode?: string }).copiedCode = text;
        },
      },
    });
  });
  await mockAnswer(page, "```js\nlet x = 1;\n```");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("拡大表示");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  const expand = page
    .locator("[data-chat-last-turn]")
    .last()
    .getByRole("button", { name: "Expand code" });
  const sourceFrame = expand.locator("xpath=ancestor::div[@data-code-frame]");
  const originBounds = await sourceFrame.boundingBox();
  expect(originBounds).not.toBeNull();
  await page.evaluate(() => {
    const state = window as Window & {
      backdropSamples?: { opacity: number; filter: string }[];
      geometrySamples?: {
        frame: number;
        header: number;
        headerLeft: number;
        headerRight: number;
        text: number;
        content: number;
        radius: number;
      }[];
      openingCrossfadeSamples?: { source: number; dialog: number }[];
      stopBackdropSampling?: boolean;
    };
    state.backdropSamples = [];
    state.geometrySamples = [];
    state.openingCrossfadeSamples = [];
    state.stopBackdropSampling = false;
    const sample = () => {
      const backdrop = document.querySelector(".code-dialog-backdrop");
      if (backdrop) {
        const style = getComputedStyle(backdrop);
        state.backdropSamples?.push({
          opacity: Number(style.opacity),
          filter: style.backdropFilter,
        });
      }
      const dialog = document.querySelector<HTMLElement>(
        '[aria-label="Fullscreen Code View"] .prose-fluina',
      );
      const sourceFrame =
        document.querySelector<HTMLElement>("[data-code-frame]");
      const sourceSurface = sourceFrame?.firstElementChild;
      if (dialog && sourceSurface instanceof HTMLElement) {
        state.openingCrossfadeSamples?.push({
          source: Number(getComputedStyle(sourceSurface).opacity),
          dialog: Number(getComputedStyle(dialog).opacity),
        });
      }
      const code = dialog?.querySelector("code");
      const header = dialog?.querySelector<HTMLElement>("[data-code-header]");
      const content = dialog?.querySelector<HTMLElement>("[data-code-content]");
      const text =
        code &&
        document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode();
      if (
        dialog instanceof HTMLElement &&
        text?.textContent &&
        header &&
        content
      ) {
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, Math.min(3, text.textContent.length));
        const headerBounds = header.getBoundingClientRect();
        state.geometrySamples?.push({
          frame: dialog.getBoundingClientRect().width,
          header: headerBounds.width,
          headerLeft: headerBounds.left,
          headerRight: headerBounds.right,
          text: range.getBoundingClientRect().width,
          content: content.getBoundingClientRect().width,
          radius: Number.parseFloat(
            getComputedStyle(dialog).borderTopLeftRadius,
          ),
        });
      }
      if (!state.stopBackdropSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await expand.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Expand control is not a button");
    }
    button.click();
  });
  const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".code-dialog-backdrop")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  await expect(dialog.locator(".prose-fluina")).toHaveCSS(
    "overflow-x",
    "visible",
  );
  await expect(
    expand
      .locator("xpath=ancestor::div[@data-code-frame]")
      .locator(":scope > div"),
  ).toHaveCSS("overflow-x", "visible");
  await page.waitForTimeout(800);
  const samples = await page.evaluate(
    () =>
      (window as Window & { geometrySamples?: Array<Record<string, number>> })
        .geometrySamples ?? [],
  );
  const openingCrossfadeSamples = await page.evaluate(
    () =>
      (
        window as Window & {
          openingCrossfadeSamples?: { source: number; dialog: number }[];
        }
      ).openingCrossfadeSamples ?? [],
  );
  expect(
    openingCrossfadeSamples.some(
      ({ source, dialog }) =>
        source > 0 && source < 1 && dialog > 0 && dialog < 1,
    ),
    JSON.stringify(openingCrossfadeSamples),
  ).toBe(true);
  expect(
    openingCrossfadeSamples.some(
      ({ source, dialog }) => Math.abs(source + dialog - 1) < 0.1,
    ),
  ).toBe(true);
  const sizes = samples.map((sample) => sample.frame);
  const headerSizes = samples.map((sample) => sample.header);
  const headerLeftEdges = samples.map((sample) => sample.headerLeft);
  const headerRightEdges = samples.map((sample) => sample.headerRight);
  const textSizes = samples.map((sample) => sample.text);
  const contentSizes = samples.map((sample) => sample.content);
  const radii = samples.map((sample) => sample.radius);
  const radiusAnimations = await dialog
    .locator(".prose-fluina")
    .evaluate((element) =>
      element.getAnimations().map((animation) => ({
        currentTime: animation.currentTime,
        keyframes:
          animation.effect instanceof KeyframeEffect
            ? animation.effect.getKeyframes()
            : [],
      })),
    );
  expect(samples.length).toBeGreaterThan(2);
  expect(Math.max(...headerSizes) - Math.min(...headerSizes)).toBeGreaterThan(
    100,
  );
  for (const edge of [headerLeftEdges, headerRightEdges]) {
    expect(Math.max(...edge) - Math.min(...edge)).toBeGreaterThan(50);
  }
  expect(Math.max(...textSizes) - Math.min(...textSizes)).toBeGreaterThan(1);
  expect(
    Math.max(
      ...textSizes
        .slice(1)
        .map((size, index) => Math.abs(size - textSizes[index])),
    ),
  ).toBeLessThan(10);
  expect(Math.max(...contentSizes) - Math.min(...contentSizes)).toBeGreaterThan(
    20,
  );
  expect(Math.max(...radii), JSON.stringify(radiusAnimations)).toBeGreaterThan(
    0,
  );
  expect(Math.min(...sizes)).toBeLessThan(
    (page.viewportSize()?.width ?? 0) - 20,
  );
  expect(Math.max(...sizes)).toBeGreaterThan(
    (page.viewportSize()?.width ?? 0) - 50,
  );
  await expect(dialog.locator("span.font-mono")).toHaveCSS(
    "user-select",
    "none",
  );
  await expect(dialog.locator("pre code")).toHaveCSS("user-select", "text");
  await dialog.getByRole("button", { name: "Copy code" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { copiedCode?: string }).copiedCode,
      ),
    )
    .toBe("let x = 1;\n");
  await page.waitForTimeout(600);
  const backdropSamples = await page.evaluate(
    () =>
      (
        window as Window & {
          backdropSamples?: { opacity: number; filter: string }[];
        }
      ).backdropSamples ?? [],
  );
  const opacitySamples = backdropSamples.map((sample) => sample.opacity);
  expect(backdropSamples.length).toBeGreaterThan(2);
  expect(
    Math.max(...opacitySamples) - Math.min(...opacitySamples),
  ).toBeGreaterThan(0.1);
  expect(backdropSamples.every((sample) => sample.filter === "none")).toBe(
    true,
  );
  await expect
    .poll(() =>
      dialog.locator("pre code").evaluate((code) => {
        const range = document.createRange();
        range.selectNodeContents(code);
        const rect = range.getBoundingClientRect();
        const visibleElement = document.elementFromPoint(
          rect.x + 1,
          rect.y + 1,
        );
        return Boolean(visibleElement && code.contains(visibleElement));
      }),
    )
    .toBe(true);
  const code = dialog.locator("pre code");
  await expect(code).toHaveCSS("user-select", "text");
  await expect(code.locator(".syntax-token").first()).toHaveCSS(
    "user-select",
    "text",
  );
  const selectionBounds = await code.evaluate((element) => {
    const text = document
      .createTreeWalker(element, NodeFilter.SHOW_TEXT)
      .nextNode();
    if (!text?.textContent || text.textContent.length < 2) {
      throw new Error("Selectable code text not found");
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.move(
    selectionBounds.x + 1,
    selectionBounds.y + selectionBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    selectionBounds.x + selectionBounds.width - 1,
    selectionBounds.y + selectionBounds.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.getSelection()?.toString()),
  ).toBeTruthy();

  await page.evaluate(() => {
    const state = window as Window & {
      backdropSamples?: { opacity: number; filter: string }[];
    };
    state.backdropSamples = [];
  });
  await page.evaluate(() => {
    const state = window as Window & {
      codeCloseSamples?: {
        left: number;
        top: number;
        frame: number;
        height: number;
        text: number;
        sourceWidth: number;
        sourceHeight: number;
      }[];
      stopCodeCloseSampling?: boolean;
    };
    state.codeCloseSamples = [];
    state.stopCodeCloseSampling = false;
    const sample = () => {
      const content = document.querySelector<HTMLElement>(
        '[aria-label="Fullscreen Code View"] .prose-fluina',
      );
      const sourceSurface = document.querySelector<HTMLElement>(
        "[data-code-frame] > div",
      );
      if (content && sourceSurface) {
        const code = content.querySelector("code");
        const text =
          code &&
          document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode();
        let textWidth = 0;
        if (text?.textContent) {
          const range = document.createRange();
          range.setStart(text, 0);
          range.setEnd(text, Math.min(3, text.textContent.length));
          textWidth = range.getBoundingClientRect().width;
        }
        state.codeCloseSamples?.push({
          left: content.getBoundingClientRect().left,
          top: content.getBoundingClientRect().top,
          frame: content.getBoundingClientRect().width,
          height: content.getBoundingClientRect().height,
          text: textWidth,
          sourceWidth: sourceSurface.getBoundingClientRect().width,
          sourceHeight: sourceSurface.getBoundingClientRect().height,
        });
      }
      if (!state.stopCodeCloseSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await dialog.getByRole("button", { name: "Close expanded code" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const closeBackdropSamples = await page.evaluate(
    () =>
      (
        window as Window & {
          backdropSamples?: { opacity: number; filter: string }[];
        }
      ).backdropSamples ?? [],
  );
  expect(closeBackdropSamples.length).toBeGreaterThan(2);
  expect(
    Math.max(...closeBackdropSamples.map((sample) => sample.opacity)) -
      Math.min(...closeBackdropSamples.map((sample) => sample.opacity)),
  ).toBeGreaterThan(0.1);
  expect(closeBackdropSamples.every((sample) => sample.filter === "none")).toBe(
    true,
  );
  const closeWidths = await page.evaluate(() => {
    const state = window as Window & {
      codeCloseSamples?: {
        left: number;
        top: number;
        frame: number;
        height: number;
        text: number;
        sourceWidth: number;
        sourceHeight: number;
      }[];
      stopCodeCloseSampling?: boolean;
    };
    state.stopCodeCloseSampling = true;
    return state.codeCloseSamples ?? [];
  });
  expect(closeWidths.length).toBeGreaterThan(2);
  const closingFrameSizes = closeWidths.map((sample) => sample.frame);
  const closingTextSizes = closeWidths
    .map((sample) => sample.text)
    .filter((size) => size > 0);
  expect(
    Math.max(...closingFrameSizes) - Math.min(...closingFrameSizes),
  ).toBeGreaterThan(20);
  const closingSourceWidths = closeWidths.map((sample) => sample.sourceWidth);
  const closingSourceHeights = closeWidths.map((sample) => sample.sourceHeight);
  expect(
    Math.max(...closingSourceWidths) - Math.min(...closingSourceWidths),
  ).toBeGreaterThan(20);
  expect(
    Math.max(...closingSourceHeights) - Math.min(...closingSourceHeights),
  ).toBeGreaterThan(20);
  expect(closingTextSizes.length).toBeGreaterThan(2);
  expect(
    Math.max(...closingTextSizes) - Math.min(...closingTextSizes),
  ).toBeLessThan(1);
  const closedSourceBounds = await sourceFrame.boundingBox();
  expect(closedSourceBounds).not.toBeNull();
  expect(
    Math.abs((closedSourceBounds?.x ?? 0) - (originBounds?.x ?? 0)),
  ).toBeLessThan(3);
  expect(
    Math.abs((closedSourceBounds?.y ?? 0) - (originBounds?.y ?? 0)),
  ).toBeLessThan(3);
  expect(
    Math.abs((closedSourceBounds?.width ?? 0) - (originBounds?.width ?? 0)),
  ).toBeLessThan(3);
  expect(
    Math.abs((closedSourceBounds?.height ?? 0) - (originBounds?.height ?? 0)),
  ).toBeLessThan(3);
  await expect(expand).toBeFocused();
  await page.evaluate(() => {
    (
      window as Window & { stopBackdropSampling?: boolean }
    ).stopBackdropSampling = true;
  });
});

test("copies, saves and expands code blocks without losing their contents", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedCode?: string }).copiedCode = text;
        },
      },
    });
  });
  await mockAnswer(
    page,
    "```javascript\nconst first = 1;\n```\n\n```python\nprint('hello')\n```\n\n```\nplain\n```\n\n```jsx\n<div />\n```\n\n```rust\nfn main() {}\n```",
  );
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("コード操作");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  const turn = page.locator("[data-chat-last-turn]").last();
  const first = turn.locator("pre").nth(0).locator("../..");
  await expect(first).toContainText("javascript");
  await expect(first.getByRole("button", { name: "Copy code" })).toBeVisible();
  await first.getByRole("button", { name: "Copy code" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { copiedCode?: string }).copiedCode,
      ),
    )
    .toBe("const first = 1;\n");
  await expect(first.locator("svg.lucide-check")).toBeVisible();
  await expect(first.locator("svg.lucide-copy")).toBeVisible({
    timeout: 1000,
  });
  for (const [index, filename, content] of [
    [0, "file.js", "const first = 1;\n"],
    [1, "file.py", "print('hello')\n"],
    [2, "file.txt", "plain\n"],
    [3, "file.jsx", "<div />\n"],
    [4, "file.rs", "fn main() {}\n"],
  ] as const) {
    const frame = turn.locator("pre").nth(index).locator("../..");
    await frame.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    const downloadPromise = page.waitForEvent("download");
    const save = frame.getByRole("button", { name: "Save code" });
    if (index === 0) {
      await save.click();
    } else {
      await save.focus();
      await page.keyboard.press("Enter");
    }
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe(content);
  }
  const expand = first.getByRole("button", { name: "Expand code" });
  await expand.click();
  const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("pre code")).toHaveText("const first = 1;\n");
  const size = await dialog.boundingBox();
  expect(size?.width).toBe(page.viewportSize()?.width);
  expect(size?.height).toBe(page.viewportSize()?.height);
  await dialog.getByRole("button", { name: "Copy code" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
});

for (const theme of ["light", "dark"]) {
  test(`renders images and navigable footnotes without HTML warnings in ${theme} mode`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(
      (mode) => localStorage.setItem("theme", mode),
      theme,
    );
    await mockAnswer(
      page,
      [
        "文中の画像 ![inline](/favicon/light.ico) と文章。",
        "",
        "![standalone](/favicon/light.ico)",
        "",
        "[![linked](/favicon/light.ico)](https://example.com/image)",
        "",
        "[external](https://example.com) と脚注[^example]。",
        "",
        "[^example]: 脚注の内容。",
      ].join("\n"),
    );
    await page.goto("/ask");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await page.locator("#prompt").fill("画像と脚注");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
    const turn = page.locator("[data-chat-last-turn]").last();
    const images = turn.locator("img");
    await expect(images).toHaveCount(3);
    for (const alt of ["inline", "standalone", "linked"]) {
      const image = turn.getByAltText(alt);
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    await expect(turn.locator('[data-streamdown="image-wrapper"]')).toHaveCount(
      0,
    );
    await expect(turn.locator("p div")).toHaveCount(0);
    await expect(turn.locator('[data-streamdown="link"]')).toHaveCount(0);
    const reference = turn.locator("sup a[data-footnote-ref]");
    await expect(reference).toHaveAttribute("href", "#user-content-fn-example");
    await reference.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/#user-content-fn-example$/);
    const back = turn.locator("a[data-footnote-backref]");
    await expect(back).toHaveAttribute("href", "#user-content-fnref-example");
    await back.click();
    await expect(page).toHaveURL(/#user-content-fnref-example$/);
    const external = turn.getByRole("link", { name: "external" });
    await expect(external).toHaveAttribute("href", "https://example.com/");
    await expect(external).toHaveAttribute("target", "_blank");
    const popupPromise = page.waitForEvent("popup");
    await external.click();
    const popup = await popupPromise;
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(popup).toHaveURL("https://example.com/");
    await popup.close();
    await page.reload();
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await expect(page.getByAltText("standalone")).toBeVisible();
    expect(
      errors.filter((error) =>
        /cannot be a descendant|cannot contain a nested|hydration|validateDOMNesting|does not recognize/i.test(
          error,
        ),
      ),
    ).toEqual([]);
  });
}

test("footnotes navigate within their own answer when IDs are repeated", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(page, "本文[^note]\n\n[^note]: 脚注です。");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  for (const question of ["最初", "次"]) {
    await page.locator("#prompt").fill(question);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  }
  const replies = page.locator(".prose").filter({ hasText: "脚注です。" });
  await expect(replies).toHaveCount(2);
  const second = replies.last();
  const reference = second.locator("a[data-footnote-ref]");
  const target = second.locator('[id="user-content-fn-note"]');
  await reference.click();
  await expect(target).toBeFocused();
  await second.locator("a[data-footnote-backref]").click();
  await expect(reference).toBeFocused();
});

test("applies button interaction effects to Markdown links", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockAnswer(page, "[Link](#example)");
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("リンク");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  const link = page.locator("[data-chat-last-turn]").last().getByRole("link", {
    name: "Link",
  });
  await expect(link).toBeVisible();
  await link.hover();
  await expect
    .poll(() =>
      link.evaluate((element) => Number(getComputedStyle(element).scale)),
    )
    .toBeGreaterThan(1);
  await page.mouse.down();
  await expect
    .poll(() =>
      link.evaluate((element) => Number(getComputedStyle(element).scale)),
    )
    .toBeLessThan(1);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await link.focus();
  await expect(link).toBeFocused();
  await expect
    .poll(() => link.evaluate((element) => element.matches(":focus-visible")))
    .toBe(true);
  await expect
    .poll(() => link.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe("none");
  await expect
    .poll(() =>
      link.evaluate((element) => Number(getComputedStyle(element).scale)),
    )
    .toBeGreaterThan(1);
  await page.keyboard.down("Enter");
  await expect
    .poll(() =>
      link.evaluate((element) => Number(getComputedStyle(element).scale)),
    )
    .toBeLessThan(1);
  await page.keyboard.up("Enter");
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`scrolls to footnotes and back with ${motion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript(() => {
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (
          this.id === "user-content-fn-note" ||
          this.id === "user-content-fnref-note"
        ) {
          const events = window as Window & {
            footnoteScrolls?: Array<{ id: string; behavior: string }>;
          };
          events.footnoteScrolls ??= [];
          events.footnoteScrolls.push({
            id: this.id,
            behavior:
              typeof options === "object"
                ? (options.behavior ?? "auto")
                : "auto",
          });
        }
        original.call(this, options);
      };
    });
    await mockAnswer(
      page,
      `参照[^note]\n\n${Array.from({ length: 60 }, (_, i) => `本文 ${i}`).join("\n\n")}\n\n[^note]: 注釈です。`,
    );
    await page.goto("/ask");
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await page.locator("#prompt").fill("注釈の移動");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("[data-chat-disclaimer]")).toBeVisible({
      timeout: 60000,
    });
    const turn = page.locator("[data-chat-last-turn]").last();
    const reference = turn.locator("a[data-footnote-ref]");
    const target = turn.locator('[id="user-content-fn-note"]');
    const behavior = motion === "reduce" ? "instant" : "smooth";
    await reference.scrollIntoViewIfNeeded();
    await reference.evaluate((element) => {
      let scroller = element.parentElement;
      while (
        scroller &&
        !(
          scroller.scrollHeight > scroller.clientHeight &&
          ["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
        )
      ) {
        scroller = scroller.parentElement;
      }
      if (!scroller) throw new Error("Chat scroller not found");
      const state = window as Window & { footnotePositions?: number[] };
      state.footnotePositions = [];
      scroller.addEventListener("scroll", () =>
        state.footnotePositions?.push(scroller.scrollTop),
      );
    });
    await reference.click();
    const scrolls = () =>
      page.evaluate(
        () =>
          (
            window as Window & {
              footnoteScrolls?: Array<{ id: string; behavior: string }>;
            }
          ).footnoteScrolls ?? [],
      );
    await expect.poll(scrolls).toContainEqual({
      id: "user-content-fn-note",
      behavior,
    });
    await expect(target).toBeFocused();
    await expect(page).toHaveURL(/#user-content-fn-note$/);
    await expect(target).toBeInViewport();
    if (motion === "no-preference") {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Set(
                (window as Window & { footnotePositions?: number[] })
                  .footnotePositions,
              ).size,
          ),
        )
        .toBeGreaterThan(3);
    }
    await turn.locator("a[data-footnote-backref]").focus();
    await page.keyboard.press("Enter");
    await expect.poll(scrolls).toContainEqual({
      id: "user-content-fnref-note",
      behavior,
    });
    await expect(reference).toBeFocused();
    await expect(page).toHaveURL(/#user-content-fnref-note$/);
    await expect(reference).toBeInViewport();
  });
}

test("does not render a broken image while its URL is streaming", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(page, "画像 ![loading](https://exam", true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("画像");
  await page.getByRole("button", { name: "Send" }).click();
  const turn = page.locator("[data-chat-last-turn]").last();
  await expect(turn.getByText("画像", { exact: false })).toBeVisible();
  await expect(turn.locator("img")).toHaveCount(0);
  await page.evaluate(() => {
    const stream = window as Window & {
      appendTestAnswer?: (chunk: string) => void;
      finishTestAnswer?: () => void;
    };
    stream.appendTestAnswer?.("ple.com/image.png)");
    stream.finishTestAnswer?.();
  });
  await expect(turn.getByAltText("loading")).toHaveAttribute(
    "src",
    "https://example.com/image.png",
  );
});

for (const theme of ["light", "dark"]) {
  test(`uses prose styles for ordinary Markdown and preserves special rendering in ${theme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(
      (mode) => localStorage.setItem("theme", mode),
      theme,
    );
    await mockAnswer(
      page,
      [
        "# Heading",
        "Text with **bold**, `inline code`, <kbd>Ctrl</kbd>, [link](https://example.com) and $x^2$.",
        "- First",
        "  - Nested",
        "- [x] Done",
        "",
        "3. Third",
        "4. Fourth",
        "",
        "> A quotation",
        "",
        "---",
        "",
        "$$",
        "x^2 + y^2 = z^2",
        "$$",
        "",
        "```js",
        "const result = 42;",
        "```",
        "",
        "```not-a-real-language",
        "unrecognized code",
        "```",
      ].join("\n"),
      true,
    );
    await page.goto("/ask");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await page.locator("#prompt").fill("Markdownの表示");
    await page.getByRole("button", { name: "Send" }).click();
    const turn = page.locator("[data-chat-last-turn]").last();
    await expect(turn.getByRole("heading", { name: "Heading" })).toBeVisible();
    await expect(turn.locator("strong")).toHaveText("bold");
    const inlineCode = turn.locator("code").filter({ hasText: "inline code" });
    await expect(inlineCode).toBeVisible();
    await expect(inlineCode).toHaveCSS("font-weight", "400");
    const shortcut = turn.locator("kbd");
    await expect(shortcut).toHaveText("Ctrl");
    const shortcutMatchesCode = await shortcut.evaluate((element) => {
      const code = element.parentElement?.querySelector("code");
      if (!code) throw new Error("Inline code not found");
      const codeStyle = getComputedStyle(code);
      const shortcutStyle = getComputedStyle(element);
      return {
        background: shortcutStyle.backgroundColor === codeStyle.backgroundColor,
        color: shortcutStyle.color === codeStyle.color,
        radius: shortcutStyle.borderRadius === codeStyle.borderRadius,
        padding: shortcutStyle.padding === codeStyle.padding,
        weight: shortcutStyle.fontWeight === codeStyle.fontWeight,
        font: shortcutStyle.fontFamily === codeStyle.fontFamily,
        size: shortcutStyle.fontSize === codeStyle.fontSize,
        shadow: shortcutStyle.boxShadow,
      };
    });
    expect(shortcutMatchesCode).toEqual({
      background: true,
      color: true,
      radius: true,
      padding: true,
      weight: true,
      font: true,
      size: true,
      shadow: "none",
    });
    await expect(turn.locator("pre").first().locator("../..")).toHaveCSS(
      "border-radius",
      "16px",
    );
    const inlineStyles = await inlineCode.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      before: getComputedStyle(element, "::before").content,
      after: getComputedStyle(element, "::after").content,
    }));
    expect(inlineStyles.before).toBe("none");
    expect(inlineStyles.after).toBe("none");
    const link = turn.getByRole("link", { name: "link" });
    await expect(link).toBeVisible();
    expect(
      await link.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--tw-prose-links)";
        element.append(probe);
        const sameColor =
          getComputedStyle(element).color === getComputedStyle(probe).color;
        probe.remove();
        return sameColor;
      }),
    ).toBe(true);
    await expect(turn.getByRole("checkbox")).toBeChecked();
    await expect(turn.locator("ol")).toHaveAttribute("start", "3");
    await expect(turn.locator("ul ul")).toContainText("Nested");
    await expect(turn.locator("blockquote")).toContainText("A quotation");
    await expect(turn.locator("hr")).toHaveCount(1);
    const themeColors = await turn.locator(".prose").evaluate((prose) => {
      const probe = document.createElement("span");
      prose.append(probe);
      const color = (variable: string) => {
        probe.style.color = `var(${variable})`;
        return getComputedStyle(probe).color;
      };
      const required = (selector: string) => {
        const element = prose.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        return element;
      };
      const result = {
        body: getComputedStyle(prose).color,
        heading: getComputedStyle(required("h1")).color,
        counter: getComputedStyle(required("ol li"), "::marker").color,
        bullet: getComputedStyle(required("ul li"), "::marker").color,
        hr: getComputedStyle(required("hr")).borderTopColor,
        quoteBorder: getComputedStyle(required("blockquote")).borderLeftColor,
        pre: getComputedStyle(required("pre")).backgroundColor,
        fore1: color("--fore-1"),
        fore5: color("--fore-5"),
        back1: color("--back-1"),
        back2: color("--back-2"),
        back5: color("--back-5"),
      };
      probe.remove();
      return result;
    });
    expect(themeColors.body).toBe(themeColors.fore1);
    expect(themeColors.heading).toBe(themeColors.fore1);
    expect(themeColors.counter).toBe(themeColors.fore5);
    expect(themeColors.bullet).toBe(themeColors.fore5);
    expect(themeColors.hr).toBe(themeColors.back5);
    expect(themeColors.quoteBorder).toBe(themeColors.back5);
    expect(themeColors.pre).toBe(themeColors.back1);
    expect(inlineStyles.background).toBe(themeColors.back2);
    expect(themeColors.fore1).toBe(
      theme === "light" ? "rgb(13, 13, 13)" : "rgb(242, 242, 242)",
    );
    await expect(turn.locator(".katex")).toHaveCount(2);
    const highlightedCode = turn.locator("pre code").first();
    await expect(highlightedCode).toHaveText("const result = 42;\n");
    await expect
      .poll(() => highlightedCode.locator(".syntax-token").count(), {
        timeout: 30000,
      })
      .toBeGreaterThan(1);
    const tokenColors = await highlightedCode
      .locator(".syntax-token")
      .evaluateAll((tokens) => [
        ...new Set(tokens.map((token) => getComputedStyle(token).color)),
      ]);
    expect(tokenColors.length).toBeGreaterThan(1);
    const unknownCode = turn.locator("pre code").last();
    await expect(unknownCode).toHaveText("unrecognized code\n");
    await expect(unknownCode.locator(".syntax-token")).toHaveCount(0);
    await expect(turn.getByRole("button", { name: "Copy code" })).toHaveCount(
      2,
    );
    await expect(
      turn.getByRole("button", { name: "Download file" }),
    ).toHaveCount(0);
    await expect(turn.locator('[data-streamdown="heading-1"]')).toHaveCount(0);
    await expect(
      turn.locator('[data-streamdown="unordered-list"]'),
    ).toHaveCount(0);
    await expect(turn.locator('[data-streamdown="blockquote"]')).toHaveCount(0);
    await expect(link).toHaveAttribute("href", "https://example.com/");
    await page.evaluate(() => {
      (
        window as Window & { finishTestAnswer?: () => void }
      ).finishTestAnswer?.();
    });
    await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
    await expect(turn.locator("strong")).toHaveText("bold");
    await expect(turn.locator(".katex")).toHaveCount(2);
    await expect(highlightedCode).toHaveText("const result = 42;\n");
    await expect(turn.getByRole("button", { name: "Copy code" })).toHaveCount(
      2,
    );
  });
}

test("reveals completed responses in order instead of skipping ahead", async ({
  page,
}) => {
  await mockAnswer(page, answer);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("順序を確認");
  await page.getByRole("button", { name: "Send" }).click();

  const message = page.locator("[data-chat-last-turn]").last();
  await expect(message.getByText("見出し", { exact: false })).toBeVisible();
  await expect(message.getByText(paragraph, { exact: false })).toHaveCount(0);
  await expect(page.locator("[data-chat-disclaimer]")).toHaveCount(0);

  await expect(message.getByRole("heading", { name: heading })).toBeVisible();
  await expect(message.getByText(paragraph, { exact: true })).toBeVisible();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
});

test("shows the full response immediately when motion is reduced", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAnswer(page, answer);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("動きを抑える");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(paragraph, { exact: true })).toBeVisible();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
});

test("keeps the reveal ordered across network chunks and stream completion", async ({
  page,
}) => {
  const first = `## ${heading}\n\n`;
  await mockAnswer(page, first, true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("分割された返答");
  await page.getByRole("button", { name: "Send" }).click();
  const message = page.locator("[data-chat-last-turn]").last();
  await expect(message.getByText("見出し", { exact: false })).toBeVisible();
  await page.evaluate((text) => {
    const stream = window as Window & {
      appendTestAnswer?: (chunk: string) => void;
      finishTestAnswer?: () => void;
    };
    stream.appendTestAnswer?.(text);
    stream.finishTestAnswer?.();
  }, paragraph);
  await expect(message.getByText(paragraph, { exact: false })).toHaveCount(0);
  await expect(message.getByRole("heading", { name: heading })).toBeVisible();
  await expect(message.getByText(paragraph, { exact: true })).toBeVisible();
  await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
});

test("reveals buffered text at a steady bounded pace", async ({ page }) => {
  await mockAnswer(page, "あ".repeat(240));
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("速度");
  await page.getByRole("button", { name: "Send" }).click();

  const prose = page.locator("[data-chat-last-turn] .prose").last();
  await expect(prose).toContainText("あ");
  const start = (await prose.textContent())?.length ?? 0;
  await page.waitForTimeout(300);
  const advanced = ((await prose.textContent())?.length ?? 0) - start;
  expect(advanced).toBeGreaterThanOrEqual(12);
  expect(advanced).toBeLessThanOrEqual(48);
  await expect(prose).toHaveText("あ".repeat(240));
});

test("does not expose partial media markers while streaming", async ({
  page,
}) => {
  await mockAnswer(page, "前の文章です。\n\n[[FLUI", true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("画像");
  await page.getByRole("button", { name: "Send" }).click();

  const prose = page.locator("[data-chat-last-turn] .prose").last();
  await expect(prose).toContainText("前の文章です。");
  await page.waitForTimeout(200);
  await expect(prose).not.toContainText("[[FLUI");

  const payload = encodeURIComponent(
    JSON.stringify({
      kind: "image",
      url: "https://example.com/example.png",
      alt: "Example media",
    }),
  );
  await page.evaluate((text) => {
    const stream = window as Window & {
      appendTestAnswer?: (chunk: string) => void;
      finishTestAnswer?: () => void;
    };
    stream.appendTestAnswer?.(text);
    stream.finishTestAnswer?.();
  }, `NA_MEDIA:${payload}]]\n\n後の文章です。`);
  await expect(page.getByAltText("Example media")).toBeVisible();
  await expect(prose).toContainText("後の文章です。");
  await expect(prose).not.toContainText("FLUINA_MEDIA");
});

test("keeps the reading position while buffered text continues to appear", async ({
  page,
}) => {
  const longAnswer = Array.from(
    { length: 30 },
    (_, index) => `行${index}: これはスクロールを確認するための文章です。`,
  ).join("\n\n");
  await mockAnswer(page, longAnswer, true);
  await page.goto("/ask");
  await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  await page.locator("#prompt").fill("長い返答");
  await page.getByRole("button", { name: "Send" }).click();
  const anchor = page.getByText("行10:", { exact: false });
  await expect(anchor).toBeVisible();
  const scroller = page
    .locator("main [data-scroll-edge-fade]")
    .filter({ has: page.locator("[data-chat-last-turn]") })
    .last();
  await scroller.hover();
  await page.mouse.wheel(0, 1);
  await anchor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const before = await anchor.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await page.evaluate(() => {
    (window as Window & { finishTestAnswer?: () => void }).finishTestAnswer?.();
  });
  await page.waitForTimeout(1000);
  const after = await anchor.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(Math.abs(after - before)).toBeLessThan(2);
  await expect(page.getByText("行29:", { exact: false })).toBeVisible();
});

for (const reducedMotion of [false, true]) {
  test(`keeps the latest turn aligned during delayed measurement with ${reducedMotion ? "reduced" : "normal"} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    await mockAnswer(page, "", true);
    await page.addInitScript(() => {
      const NativeResizeObserver = window.ResizeObserver;
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((entries, observer) => {
            for (const entry of entries) {
              if (
                entry.target.parentElement?.style.contain.includes("size") &&
                entry.target.querySelector("[data-chat-last-turn]")
              ) {
                setTimeout(() => callback([entry], observer), 150);
              } else {
                callback([entry], observer);
              }
            }
          });
        }
      };
    });
    await page.goto("/");
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("fluina-chat-archive", 1);
          request.onupgradeneeded = () => {
            const database = request.result;
            const messages = database.createObjectStore("messages", {
              keyPath: "sequence",
              autoIncrement: true,
            });
            messages.createIndex("id", "id", { unique: true });
            database.createObjectStore("metadata", { keyPath: "key" });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("messages", "readwrite");
            const messages = transaction.objectStore("messages");
            for (let index = 0; index < 5; index += 1) {
              for (const role of ["user", "assistant"]) {
                messages.add({
                  id: `${index}-${role}`,
                  role,
                  content: `Previous ${role} ${index} ${"text ".repeat(20)}`,
                  timestamp: Date.now() - 10_000 + index,
                });
              }
            }
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        }),
    );
    await page.goto("/ask");
    await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
    await page.locator("#prompt").fill("長文の質問");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("Responding to the message")).toBeVisible();
    const scroller = page
      .locator("main [data-scroll-edge-fade]")
      .filter({ has: page.locator("[data-chat-last-turn]") })
      .last();
    const alignment = () =>
      scroller.evaluate((viewport) => {
        const turn = viewport.querySelector("[data-chat-last-turn]");
        if (!turn) return Number.POSITIVE_INFINITY;
        return Math.abs(
          turn.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top,
        );
      });
    await expect.poll(alignment).toBeLessThan(2);
    await page.waitForTimeout(300);
    const maxDisplacement = await page.evaluate(async () => {
      const turn = document.querySelector<HTMLElement>("[data-chat-last-turn]");
      const viewport = turn?.closest<HTMLElement>("[data-scroll-edge-fade]");
      if (!turn || !viewport) throw new Error("Chat viewport not found");
      const stream = window as Window & {
        appendTestAnswer?: (chunk: string) => void;
      };
      if (!stream.appendTestAnswer) throw new Error("Test stream not ready");
      stream.appendTestAnswer(
        Array.from(
          { length: 4 },
          (_, i) => `行${i}: ${"文章".repeat(15)}`,
        ).join("\n\n"),
      );
      let max = 0;
      const end = performance.now() + 1000;
      await new Promise<void>((resolve) => {
        const sample = () => {
          max = Math.max(
            max,
            Math.abs(
              turn.getBoundingClientRect().top -
                viewport.getBoundingClientRect().top,
            ),
          );
          if (performance.now() < end) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      return max;
    });
    expect(maxDisplacement).toBeLessThan(2);
    await expect(page.getByText("行0:", { exact: false })).toBeVisible();
  });
}
