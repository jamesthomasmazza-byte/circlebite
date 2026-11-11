import { expect, test, type Page } from "@playwright/test";

// Two typed barcodes in a row, no reload (2026-11-10). Seen in production on the operator account,
// in desktop Chrome: a typed scan's card came up; "Scan another product", a second barcode typed
// into the same field, Check — and nothing came up, no card and no error, until a reload. Found
// here first, then fixed: "Scan another product" called the scanner's start(), which opens the
// camera, while the mode control still said Type it, so the camera stage stayed hidden and the
// camera-up layout hid the next card (styles.css, .scan-camera-up). Every /api call is stubbed,
// so this runs with no server.

const PROFILE = { id: "p-maya", label: "Maya", is_self: false, relationship: "owner", allergen_names: ["Egg", "Milk", "Peanut"] };

const KATES_BUTTER = {
  barcode: "0041231000131",
  product_name: "Butter",
  product_brand: "Kate's",
  ingredients_text: "Grade a cream, sea salt.",
  result: "contains_allergen",
  matched: [
    { allergenName: "Egg", matched: false, source: null, severity: "severe", classification: "clear" },
    { allergenName: "Milk", matched: true, source: "ingredients", severity: "severe", classification: "contains", matchedText: "cream" },
    { allergenName: "Peanut", matched: false, source: null, severity: "severe", classification: "clear" },
  ],
};

const SPARKLING_WATER = {
  barcode: "0012000001291",
  product_name: "Sparkling Water",
  product_brand: "Fernhallow",
  ingredients_text: "Carbonated water, natural flavor.",
  result: "safe",
  matched: PROFILE.allergen_names.map((allergenName) => ({ allergenName, matched: false, source: null, severity: "severe", classification: "clear" })),
};

const PRODUCTS = [KATES_BUTTER, SPARKLING_WATER];

async function stubApi(page: Page) {
  let scans = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/features") return json({ guidedSetupEnabled: true, registrationOpen: false });
    if (path === "/me") {
      return json({
        user: { id: "u-1", email: "owner@example.com", displayName: "Owner", isAdmin: false },
        actingProfileId: null,
        labelScanEnabled: true,
        scannerRegionEnabled: false,
        circleRequestsEnabled: false,
        guidedSetupEnabled: true,
        scanSoundsEnabled: false,
        circleRedesignEnabled: true,
        scanRedesignEnabled: true,
        profileRedesignEnabled: true,
      });
    }
    if (path === "/profiles") return json({ managed: [PROFILE], followed: [] });
    if (path === "/scans" && route.request().method() === "POST") {
      const { barcode } = route.request().postDataJSON() as { barcode: string };
      const product = PRODUCTS.find((p) => p.barcode === barcode);
      if (!product) return json({ error: "not_found" }, 404);
      scans++;
      return json({
        id: `scan-${scans}`,
        barcode: product.barcode,
        product_name: product.product_name,
        product_brand: product.product_brand,
        ingredients_text: product.ingredients_text,
        product_last_updated: null,
        result: product.result,
        matched_allergens: product.matched,
        source: "barcode",
        confidence: "high",
        explanation: null,
        created_at: new Date().toISOString(),
        effective: null,
        community_reports: [],
        pending_circle_reports: [],
        evidence_decision: { photo: "none" },
      });
    }
    // Anything else the shell asks for on the way: empty, never an error.
    return json(Array.isArray(path.match(/changes$|scans$|requests$/)) ? [] : {});
  });
  // The camera sentence has been seen on this device, as on JT's and the operator's browsers.
  await page.addInitScript(() => localStorage.setItem("circlebite.cameraPrimerSeen", "1"));
}

async function typeBarcode(page: Page, barcode: string) {
  await page.getByLabel("Barcode").fill(barcode);
  await page.getByRole("button", { name: "Check this product" }).click();
}

test("a second typed barcode after 'Scan another product' brings up its card, no reload", async ({ page }) => {
  await stubApi(page);
  await page.goto("/scan");

  await page.getByRole("button", { name: "Type it" }).click();
  await typeBarcode(page, KATES_BUTTER.barcode);
  await expect(page.getByRole("heading", { name: "Contains an allergen" })).toBeVisible();
  await expect(page.getByText("Kate's")).toBeVisible();

  await page.getByRole("button", { name: "Scan another product" }).click();

  // As in production: if the Barcode field is still on screen, type straight into it; if the page
  // moved to the camera, pick Type it first. Either way the next card must come up.
  const field = page.getByLabel("Barcode");
  if (!(await field.isVisible())) await page.getByRole("button", { name: "Type it" }).click();
  await typeBarcode(page, SPARKLING_WATER.barcode);
  await expect(page.getByText("Sparkling Water")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "No listed allergens found" })).toBeVisible();
  await expect(page.getByText("Kate's")).toHaveCount(0);
});
