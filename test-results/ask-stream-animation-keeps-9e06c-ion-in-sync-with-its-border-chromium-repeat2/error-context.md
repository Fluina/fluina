# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ask-stream-animation.spec.ts >> keeps mobile code shrink animation in sync with its border
- Location: tests\ask-stream-animation.spec.ts:863:1

# Error details

```
Error: expect(locator).not.toHaveAttribute(expected) failed

Locator: locator('[data-chat-last-turn]').last().locator('[data-code-frame]').locator(':scope > :first-child')
Expected pattern: not /opacity/
Received string: "transform: none; transform-origin: 50% 50% 0px; opacity: 1;"
Timeout: 5000ms

Call log:
  - Expect "not toHaveAttribute" locator('[data-chat-last-turn]').last().locator('[data-code-frame]').locator(':scope > :first-child') with timeout 5000ms
  - waiting for locator('[data-chat-last-turn]').last().locator('[data-code-frame]').locator(':scope > :first-child')
    14 × locator resolved to <div class="overflow-visible rounded-2xl border border-back-5 ">…</div>
       - unexpected value "transform: none; transform-origin: 50% 50% 0px; opacity: 1;"

```

```yaml
- text: text
- button "Copy code"
- button "Save code"
- button "Expand code"
- code: 1 WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW 2
```

# Test source

```ts
  883  |   await page.getByRole("button", { name: "Send" }).click();
  884  |   await expect(page.locator("[data-chat-disclaimer]")).toBeVisible();
  885  | 
  886  |   const frame = page
  887  |     .locator("[data-chat-last-turn]")
  888  |     .last()
  889  |     .locator("[data-code-frame]");
  890  |   const sourceContent = frame.locator("[data-code-content]");
  891  |   const source = frame.locator("pre");
  892  |   const codeRegion = source.locator("xpath=..");
  893  |   const codeHeader = frame.locator(".bg-back-2").first();
  894  |   const originBounds = await frame.boundingBox();
  895  |   const originContentBounds = await sourceContent.boundingBox();
  896  |   if (!originBounds) throw new Error("Collapsed code frame is not visible");
  897  |   if (!originContentBounds)
  898  |     throw new Error("Collapsed code content is not visible");
  899  |   await expect(codeHeader).toHaveCSS("border-top-left-radius", "16px");
  900  |   await expect(codeRegion).toHaveCSS("border-top-left-radius", "0px");
  901  |   await expect(source).toHaveCSS("border-top-left-radius", "0px");
  902  | 
  903  |   await frame.getByRole("button", { name: "Expand code" }).click();
  904  |   const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  905  |   const expandedCode = dialog.locator("pre");
  906  |   await expect(expandedCode).toBeVisible();
  907  |   const expandedContent = dialog.locator("[data-code-content]");
  908  |   await page.waitForTimeout(600);
  909  |   const expandedContentBounds = await expandedContent.boundingBox();
  910  |   if (!expandedContentBounds)
  911  |     throw new Error("Expanded code content is not visible");
  912  |   await expandedCode.evaluate((element) => {
  913  |     element.scrollLeft = element.scrollWidth;
  914  |   });
  915  |   const expandedBounds = await dialog.locator(".prose-fluina").boundingBox();
  916  |   if (!expandedBounds) throw new Error("Expanded code frame is not visible");
  917  |   const closeTargetBounds = await frame.boundingBox();
  918  |   if (!closeTargetBounds)
  919  |     throw new Error("Collapsed code target is not measurable");
  920  | 
  921  |   await page.evaluate(() => {
  922  |     const state = window as Window & {
  923  |       closeCrossfadeSamples?: { source: number; dialog: number }[];
  924  |       stopCloseCrossfadeSampling?: boolean;
  925  |     };
  926  |     state.closeCrossfadeSamples = [];
  927  |     state.stopCloseCrossfadeSampling = false;
  928  |     const sample = () => {
  929  |       const dialogElement = document.querySelector<HTMLElement>(
  930  |         '[aria-label="Fullscreen Code View"] .prose-fluina',
  931  |       );
  932  |       const sourceSurface =
  933  |         document.querySelector<HTMLElement>(
  934  |           "[data-code-frame]",
  935  |         )?.firstElementChild;
  936  |       if (dialogElement && sourceSurface instanceof HTMLElement) {
  937  |         state.closeCrossfadeSamples?.push({
  938  |           source: Number(getComputedStyle(sourceSurface).opacity),
  939  |           dialog: Number(getComputedStyle(dialogElement).opacity),
  940  |         });
  941  |       }
  942  |       if (!state.stopCloseCrossfadeSampling) requestAnimationFrame(sample);
  943  |     };
  944  |     requestAnimationFrame(sample);
  945  |   });
  946  |   await dialog.getByRole("button", { name: "Close expanded code" }).click();
  947  |   await expect(dialog).toHaveCount(0);
  948  |   const closeCrossfadeSamples = await page.evaluate(() => {
  949  |     const state = window as Window & {
  950  |       closeCrossfadeSamples?: { source: number; dialog: number }[];
  951  |       stopCloseCrossfadeSampling?: boolean;
  952  |     };
  953  |     state.stopCloseCrossfadeSampling = true;
  954  |     return state.closeCrossfadeSamples ?? [];
  955  |   });
  956  |   expect(
  957  |     closeCrossfadeSamples.some(
  958  |       ({ source, dialog: dialogOpacity }) =>
  959  |         source > 0 &&
  960  |         source < 1 &&
  961  |         dialogOpacity > 0 &&
  962  |         dialogOpacity < 1 &&
  963  |         Math.abs(source + dialogOpacity - 1) < 0.1,
  964  |     ),
  965  |     JSON.stringify(closeCrossfadeSamples),
  966  |   ).toBe(true);
  967  |   const activeCloseCrossfadeSamples = closeCrossfadeSamples.filter(
  968  |     ({ source, dialog: dialogOpacity }) =>
  969  |       (source > 0 && source < 1) || (dialogOpacity > 0 && dialogOpacity < 1),
  970  |   );
  971  |   expect(activeCloseCrossfadeSamples.length).toBeGreaterThan(0);
  972  |   expect(
  973  |     activeCloseCrossfadeSamples.every(
  974  |       ({ source, dialog: dialogOpacity }) =>
  975  |         Math.abs(source + dialogOpacity - 1) < 0.02,
  976  |     ),
  977  |     JSON.stringify(activeCloseCrossfadeSamples),
  978  |   ).toBe(true);
  979  |   await expect(frame.locator(":scope > :first-child")).toHaveCSS(
  980  |     "opacity",
  981  |     "1",
  982  |   );
> 983  |   await expect(frame.locator(":scope > :first-child")).not.toHaveAttribute(
       |                                                            ^ Error: expect(locator).not.toHaveAttribute(expected) failed
  984  |     "style",
  985  |     /opacity/,
  986  |   );
  987  |   const restoredBounds = await frame.boundingBox();
  988  |   if (!restoredBounds) throw new Error("Collapsed code frame was not restored");
  989  |   expect(Math.abs(restoredBounds.x - closeTargetBounds.x)).toBeLessThan(1);
  990  |   expect(Math.abs(restoredBounds.y - closeTargetBounds.y)).toBeLessThan(1);
  991  |   expect(Math.abs(restoredBounds.width - closeTargetBounds.width)).toBeLessThan(
  992  |     1,
  993  |   );
  994  |   expect(
  995  |     Math.abs(restoredBounds.height - closeTargetBounds.height),
  996  |   ).toBeLessThan(1);
  997  |   await expect(source).toHaveAttribute("data-scroll-edge-fade", "");
  998  |   const overlayBounds = await source.evaluate((element) => {
  999  |     const overlay = element.nextElementSibling;
  1000 |     if (!(overlay instanceof HTMLElement)) {
  1001 |       throw new Error("Code edge overlay not found");
  1002 |     }
  1003 |     const codeRect = element.getBoundingClientRect();
  1004 |     const overlayRect = overlay.getBoundingClientRect();
  1005 |     return {
  1006 |       codeTop: codeRect.top,
  1007 |       overlayTop: overlayRect.top,
  1008 |       codeBottom: codeRect.bottom,
  1009 |       overlayBottom: overlayRect.bottom,
  1010 |     };
  1011 |   });
  1012 |   expect(overlayBounds.overlayTop).toBeGreaterThanOrEqual(
  1013 |     overlayBounds.codeTop - 1,
  1014 |   );
  1015 |   expect(overlayBounds.overlayBottom).toBeLessThanOrEqual(
  1016 |     overlayBounds.codeBottom + 1,
  1017 |   );
  1018 | });
  1019 | 
  1020 | test("supports mobile drag-to-close from the code header", async ({ page }) => {
  1021 |   await page.setViewportSize({ width: 390, height: 844 });
  1022 |   await page.addInitScript(() => {
  1023 |     Object.defineProperty(navigator, "userAgent", {
  1024 |       configurable: true,
  1025 |       value:
  1026 |         "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  1027 |     });
  1028 |     Object.defineProperty(navigator, "maxTouchPoints", {
  1029 |       configurable: true,
  1030 |       value: 5,
  1031 |     });
  1032 |   });
  1033 |   await mockAnswer(
  1034 |     page,
  1035 |     `\`\`\`python\n${Array.from({ length: 6 }, (_, index) => `print(${index})`).join("\n")}\n\`\`\``,
  1036 |   );
  1037 |   await page.goto("/ask");
  1038 |   await expect(page.getByLabel("Loading Chat")).toHaveCount(0);
  1039 |   await page.locator("#prompt").fill("コードをモバイルで開く");
  1040 |   await page.getByRole("button", { name: "Send" }).evaluate((button) => {
  1041 |     if (!(button instanceof HTMLButtonElement)) {
  1042 |       throw new Error("Send control is not a button");
  1043 |     }
  1044 |     button.click();
  1045 |   });
  1046 |   const turn = page.locator("[data-chat-last-turn]").last();
  1047 |   const sourceCode = turn.locator("pre code");
  1048 |   await expect(sourceCode.locator(".code-line")).toHaveCount(7);
  1049 |   await turn.getByRole("button", { name: "Expand code" }).click();
  1050 | 
  1051 |   const dialog = page.getByRole("dialog", { name: "Fullscreen Code View" });
  1052 |   await expect(dialog).toBeVisible();
  1053 |   const header = dialog.locator(".bg-back-2").first();
  1054 |   await expect(header).toHaveClass(/touch-none/);
  1055 |   const codeViewport = dialog.locator("pre");
  1056 |   await expect(codeViewport).toHaveAttribute(
  1057 |     "class",
  1058 |     expect.stringContaining("pb-[env(safe-area-inset-bottom,1rem)]"),
  1059 |   );
  1060 |   const codeBounds = await codeViewport.boundingBox();
  1061 |   if (!codeBounds) throw new Error("Expanded code is not visible");
  1062 |   await page.mouse.move(
  1063 |     codeBounds.x + 40,
  1064 |     codeBounds.y + codeBounds.height / 2,
  1065 |   );
  1066 |   await page.mouse.down();
  1067 |   await page.mouse.move(
  1068 |     codeBounds.x + 40,
  1069 |     codeBounds.y + codeBounds.height / 2 + 140,
  1070 |     { steps: 10 },
  1071 |   );
  1072 |   await page.mouse.up();
  1073 |   await expect(dialog).toBeVisible();
  1074 | 
  1075 |   const bounds = await header.boundingBox();
  1076 |   if (!bounds) throw new Error("Code header is not visible");
  1077 |   await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2);
  1078 |   await page.mouse.down();
  1079 |   await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2 - 260, {
  1080 |     steps: 10,
  1081 |   });
  1082 |   const backdropAlpha = await page
  1083 |     .locator(".code-dialog-backdrop")
```