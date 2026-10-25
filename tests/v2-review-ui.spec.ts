import { test, expect, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/universal.html");
  await page
    .getByRole("button", { name: "Load tuition UI sample", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Universal information review" }),
  ).toBeVisible();
}
function finding(page: Page, label: string) {
  return page.getByRole("article", { name: label, exact: true });
}
async function resolve(page: Page) {
  await finding(page, "Email address")
    .getByRole("button", { name: "Keep visible", exact: true })
    .click();
  await finding(page, "Unclassified confidential reference")
    .getByRole("button", { name: "Keep visible", exact: true })
    .click();
}

test("v2 review UI paginates, groups, searches and filters multi-category and unknown findings", async ({
  page,
}) => {
  await start(page);
  const review = page.getByRole("region", {
    name: "Universal information review",
  });
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("internet_identities");
  await expect(review.getByRole("article")).toHaveCount(1);
  await expect(finding(page, "Email address")).toBeVisible();
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("__unknown");
  await expect(
    finding(page, "Unclassified confidential reference"),
  ).toBeVisible();
  await expect(
    finding(page, "Unclassified confidential reference").getByRole("button", {
      name: "Locate in image",
    }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("");
  await page
    .getByLabel("Search information", { exact: true })
    .fill("EXAMPLE.COM");
  await expect(review.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Search information", { exact: true }).fill("");
  await page.getByRole("button", { name: "Show 240 mock findings" }).click();
  await expect(review.getByRole("article")).toHaveCount(20);
  await expect(page.getByText("Page 1 of 12", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 of 12", { exact: true })).toBeVisible();
  await expect(review.getByRole("article")).toHaveCount(20);
  const labels = await review
    .getByRole("article")
    .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")));
  expect(new Set(labels).size).toBe(20);
  await page
    .getByLabel("Search information", { exact: true })
    .fill("does-not-exist");
  await expect(page.getByText(/No findings match these filters/)).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Inspection coverage" }),
  ).toBeVisible();
});

test("v2 review UI context notes, structured requirements and deliberate confirmation", async ({
  page,
}) => {
  await start(page);
  await expect(page.getByText(/it is not interpreted by an AI/)).toBeVisible();
  await page
    .getByLabel("Who receives it?", { exact: true })
    .fill("Fictional scholarship office");
  await page
    .getByLabel("Why are you sharing it?", { exact: true })
    .fill("Verify fictional payment");
  await page
    .getByRole("combobox", { name: "Whose information is this?", exact: true })
    .selectOption("mixed");
  await page
    .getByRole("combobox", { name: "Who can see it?", exact: true })
    .selectOption("limited_group");
  await page
    .getByRole("button", { name: "Add requirement", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Payment amount requested in instructions");
  await page
    .getByRole("combobox", { name: "Information needed", exact: true })
    .selectOption("type:payment_amount");
  await page
    .getByRole("combobox", { name: "How necessary is it?", exact: true })
    .selectOption("needed");
  await page
    .getByRole("checkbox", {
      name: "I checked this requirement with the recipient or their instructions.",
      exact: true,
    })
    .check();
  const apply = page.getByRole("button", {
    name: "Apply sharing context",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I reviewed the recipient, purpose/ })
    .check();
  await apply.click();
  await expect(
    page.getByRole("region", { name: "Confirm context change", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel context change" }).click();
  await expect(page.locator(".uv-active-context")).toContainText("University");
  await apply.click();
  await page
    .getByRole("button", { name: "Confirm context change", exact: true })
    .click();
  await expect(page.locator(".uv-active-context")).toContainText(
    "Fictional scholarship office",
  );
  await expect(
    page.getByRole("combobox", { name: "Information needed", exact: true }),
  ).toHaveValue("type:payment_amount");
  await expect(
    page.getByRole("checkbox", { name: /I reviewed the recipient, purpose/ }),
  ).not.toBeChecked();
});

test("v2 review UI keyboard region controls create, move, resize, delete and invalidate preview", async ({
  page,
}) => {
  await start(page);
  await resolve(page);
  await page
    .getByRole("button", { name: "Generate final PNG preview", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Final redacted PNG for v2 review" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I checked the final image/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Download reviewed PNG", exact: true }),
  ).toBeEnabled();
  await page
    .getByText("Keyboard and precise region controls", { exact: true })
    .click();
  await page
    .getByLabel("Left edge (original pixels)", { exact: true })
    .fill("100");
  await page
    .getByLabel("Top edge (original pixels)", { exact: true })
    .fill("50");
  await page.getByLabel("Width (original pixels)", { exact: true }).fill("200");
  await page.getByLabel("Height (original pixels)", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "Add manual region", exact: true })
    .press("Enter");
  await expect(page.locator(".px-mask")).toHaveCount(2);
  await expect(
    page.getByRole("img", { name: "Final redacted PNG for v2 review" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Region", exact: true })
    .selectOption({ label: "Region 2 · Manual" });
  await page
    .getByLabel("Left edge (original pixels)", { exact: true })
    .fill("220");
  await page.getByLabel("Width (original pixels)", { exact: true }).fill("300");
  await page
    .getByRole("button", { name: "Apply region changes", exact: true })
    .click();
  await expect(page.locator(".px-mask").nth(1)).toHaveAttribute("x", "220");
  await expect(page.locator(".px-mask").nth(1)).toHaveAttribute("width", "300");
  await page
    .getByRole("button", { name: "Remove this region", exact: true })
    .click();
  await expect(page.locator(".px-mask")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Region 1 · Field-linked", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete Selected", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Suggested mask removed",
  );
  await expect(
    finding(page, "Bank account number").getByRole("button", {
      name: "Review later",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("v2 review UI does not invent masks for coordinate-free MASK choices", async ({
  page,
}) => {
  await start(page);
  await finding(page, "Email address")
    .getByRole("button", { name: "Keep visible", exact: true })
    .click();
  await finding(page, "Unclassified confidential reference")
    .getByRole("button", { name: "Mask information", exact: true })
    .click();
  await expect(page.locator(".px-mask")).toHaveCount(1);
  await expect(
    page.getByText(/It does not cover pixels without a manually located mask/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Generate final PNG preview",
      exact: true,
    }),
  ).toBeDisabled();
  const confirm = page.getByRole("checkbox", {
    name: /I located and manually masked/,
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByText("Keyboard and precise region controls", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add manual region", exact: true })
    .click();
  await confirm.check();
  await expect(
    page.getByRole("button", {
      name: "Generate final PNG preview",
      exact: true,
    }),
  ).toBeEnabled();
});

for (const width of [1440, 768, 390])
  test(`v2 review UI layout and controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await start(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByLabel("Search information", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Search information", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Show 240 mock findings" }).click();
    await expect(
      page
        .getByRole("region", { name: "Universal information review" })
        .getByRole("article"),
    ).toHaveCount(20);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

test("v2 review UI image replacement discards pending context draft", async ({
  page,
}) => {
  await start(page);
  await page
    .getByLabel("Who receives it?", { exact: true })
    .fill("Old-image recipient");
  await page
    .getByRole("checkbox", { name: /I reviewed the recipient, purpose/ })
    .check();
  await page
    .getByRole("button", { name: "Apply sharing context", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Confirm context change", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load order UI sample", exact: true })
    .click();
  await expect(
    page.getByLabel("Who receives it?", { exact: true }),
  ).toHaveValue("Customer support");
  await expect(
    page.getByRole("region", { name: "Confirm context change", exact: true }),
  ).toHaveCount(0);
});
