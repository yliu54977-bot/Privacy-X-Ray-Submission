import { test, expect } from "@playwright/test";

for (const width of [1440, 390])
  test(`advanced visual review selection, actual PNG comparison and invalidation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/universal.html");
    await page
      .getByRole("button", { name: "Load tuition UI sample", exact: true })
      .click();
    const overlays = page.locator(".uv-detection[role=button]");
    await expect(overlays).toHaveCount(3); // The fourth finding has no coordinates.
    await overlays.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(overlays.nth(1)).toBeFocused();
    await expect(overlays.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("article", { name: "Payment amount", exact: true }),
    ).toHaveAttribute("aria-current", "true");
    await page
      .getByRole("article", { name: "Email address", exact: true })
      .getByRole("button", { name: "Keep visible", exact: true })
      .click();
    await page
      .getByRole("article", {
        name: "Unclassified confidential reference",
        exact: true,
      })
      .getByRole("button", { name: "Keep visible", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Generate final PNG preview", exact: true })
      .click();
    const png = page.getByRole("img", {
      name: "Final redacted PNG for v2 review",
    });
    await expect(png).toBeVisible();
    const slider = page.getByRole("slider", {
      name: "Reveal redacted image",
      exact: true,
    });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(slider).toHaveValue("0");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("1");
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("100");
    // Pixel inspection decodes the actual output, not the CSS comparison clip.
    const pixels = await png.evaluate((img: HTMLImageElement) => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return {
        size: [c.width, c.height],
        mask: Array.from(ctx.getImageData(420, 265, 1, 1).data),
        unmasked: Array.from(ctx.getImageData(1000, 100, 1, 1).data),
      };
    });
    expect(pixels).toEqual({
      size: [1200, 850],
      mask: [0, 0, 0, 255],
      unmasked: [255, 255, 255, 255],
    });
    await page
      .getByRole("checkbox", { name: /I checked the final image/ })
      .check();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download reviewed PNG", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("redacted.png");
    const previous = await png.getAttribute("src");
    await page
      .getByRole("button", { name: "Region 1 · Field-linked", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete Selected", exact: true })
      .click();
    await expect(slider).toHaveCount(0);
    await expect(png).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Download reviewed PNG", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async (url) => {
          try {
            await fetch(url!);
            return false;
          } catch {
            return true;
          }
        }, previous),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test("advanced visual review is connected to the live Universal pipeline while Classic remains available", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/?review=advanced");
  await expect(
    page.getByRole("button", { name: "Classic review", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Universal review (v2)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Try tuition sample", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Inspection progress", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Scan for Sensitive Information",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Scan for Sensitive Information",
      exact: true,
    }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByRole("region", {
      name: "Privacy inspection overview",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator(".uv-detection").count()).toBeGreaterThan(0);
  await expect(
    page.getByRole("region", {
      name: "Universal information review",
      exact: true,
    }),
  ).toBeVisible();
});

async function readyFixture(page: import("@playwright/test").Page) {
  await page.goto("/universal.html");
  await page
    .getByRole("button", { name: "Load tuition UI sample", exact: true })
    .click();
  for (const label of ["Email address", "Unclassified confidential reference"])
    await page
      .getByRole("article", { name: label, exact: true })
      .getByRole("button", { name: "Keep visible", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Generate final PNG preview", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /I checked the final image/ }),
  ).toBeEnabled();
}

test("final UI simulated image-error recovery and acknowledgement invalidation", async ({
  page,
}) => {
  await readyFixture(page);
  const checkbox = page.getByRole("checkbox", {
    name: /I checked the final image/,
  });
  await checkbox.check();
  await page
    .getByRole("img", {
      name: "Original screenshot, before redaction",
      exact: true,
    })
    .dispatchEvent("error");
  await expect(checkbox).toBeDisabled();
  await expect(checkbox).not.toBeChecked();
  await page
    .getByRole("button", { name: "Reload PNG preview", exact: true })
    .click();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  // Merely selecting/clicking the mask must retain the reviewed PNG.
  await page
    .getByRole("button", { name: "Region 1 · Field-linked", exact: true })
    .click();
  await page.locator(".px-mask").first().click();
  await expect(
    page.getByRole("slider", { name: "Reveal redacted image" }),
  ).toBeVisible();
  await expect(checkbox).toBeChecked();
  await page
    .getByRole("button", { name: "Delete Selected", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Reveal redacted image" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download reviewed PNG", exact: true }),
  ).toHaveCount(0);
});

test.describe("final UI touch emulation", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("touch drag comparison updates position and source replacement clears review", async ({
    page,
    context,
  }) => {
    await readyFixture(page);
    const initialAck = page.getByRole("checkbox", { name: /I checked the final image/ });
    await initialAck.tap();
    await expect(initialAck).toBeChecked();
    await initialAck.tap();
    await expect(initialAck).not.toBeChecked();
    await page.evaluate(() => {
      const events: string[] = [];
      (window as Window & { touchJournal?: string[] }).touchJournal = events;
      for (const type of ["touchstart", "touchend", "pointerdown", "pointerup", "pointercancel", "click"])
        document.addEventListener(type, event => {
          const target = event.target as HTMLElement;
          events.push(`${type}:${target.tagName}:${target.getAttribute("type") ?? ""}`);
        }, true);
    });
    const stage = page.locator(".uv-comparison-stage");
    await stage.scrollIntoViewIfNeeded();
    const bounds = (await stage.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const point = {
      x: bounds.x + bounds.width * 0.25,
      y: bounds.y + bounds.height * 0.5,
      id: 0,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    // Let Chromium acknowledge a realistic touch-down frame before moving.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, x: bounds.x + bounds.width * 0.75 }],
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () =>
        Number(
          await page
            .getByRole("slider", { name: "Reveal redacted image" })
            .inputValue(),
        ),
      )
      .toBeGreaterThanOrEqual(74);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await cdp.detach();
    const acknowledgement = page.getByRole("checkbox", { name: /I checked the final image/ });
    await acknowledgement.tap();
    try { await expect(acknowledgement).toBeChecked(); }
    catch (error) {
      console.error('Touch acknowledgement diagnostics:', JSON.stringify(await page.evaluate(() => ({
        events: (window as Window & { touchJournal?: string[] }).touchJournal,
        checkbox: (() => { const input = document.querySelector('.uv-final .uv-check input') as HTMLInputElement | null;
          return input ? { checked: input.checked, disabled: input.disabled } : null; })(),
      }))));
      throw error;
    }
    finally {
      await test.info().attach("synthetic-touch-events", { contentType: "application/json",
        body: JSON.stringify(await page.evaluate(() =>
          (window as Window & { touchJournal?: string[] }).touchJournal)) });
    }
    const replaceImage = page.getByRole("button", { name: "Load order UI sample", exact: true });
    // Settle the header scroll before dispatching touch input.
    await replaceImage.scrollIntoViewIfNeeded();
    await replaceImage.tap();
    await expect(
      page.getByRole("slider", { name: "Reveal redacted image" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Download reviewed PNG", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

for (const width of [320, 768])
  test(`final UI narrow and tablet layout ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await readyFixture(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const slider = page.getByRole("slider", { name: "Reveal redacted image" });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(slider).toHaveValue("0");
    await page.keyboard.press("PageUp");
    await expect(slider).toHaveValue("10");
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("100");
  });
