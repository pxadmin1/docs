/**
 * Capture screenshots for the docs site.
 *
 * Two flows:
 *   1. ownerrez-auth   -> OwnerRez OAuth consent screen
 *   2. bm-wizard       -> each step of the Create Business Model wizard
 *
 * Usage (from /Users/marwan/GitHub/repos/docs):
 *   npm install --save-dev playwright @types/node typescript ts-node
 *   npx ts-node scripts/capture-screenshots.ts ownerrez-auth
 *   npx ts-node scripts/capture-screenshots.ts bm-wizard
 *   npx ts-node scripts/capture-screenshots.ts all
 *
 * The browser opens non-headless. Sign in manually when prompted - the script
 * waits for you to land on the dashboard before automating anything. All
 * captures land in ./images/screenshots/ alongside the screenshots already
 * committed to the repo.
 *
 * Env knobs:
 *   PX_BASE_URL          default https://pxapp.net
 *   PX_STORAGE_STATE     path to a Playwright storageState.json so you can
 *                        skip the manual login on subsequent runs
 *   PX_BUSINESS_MODEL_NAME   draft model name; defaults to a timestamped
 *                        "Docs Capture <ts>" so re-runs do not collide
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = process.env.PX_BASE_URL ?? "https://pxapp.net";
const SCREENSHOT_DIR = path.resolve(__dirname, "..", "images", "screenshots");
const STORAGE_STATE = process.env.PX_STORAGE_STATE; // optional

const DRAFT_MODEL_NAME =
  process.env.PX_BUSINESS_MODEL_NAME ??
  `Docs Capture ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

async function ensureSignedIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // Heuristic: dashboard renders a sidebar with "Properties" once signed in.
  const dashboardMarker = page.getByRole("link", { name: /properties/i }).first();
  try {
    await dashboardMarker.waitFor({ timeout: 5_000 });
    console.log("  Already signed in - continuing.");
    return page;
  } catch {
    console.log(
      "\n  Sign in to PX in the browser window that just opened.",
      "\n  The script will resume automatically once it sees the dashboard.",
      "\n  (Waiting up to 5 minutes...)\n",
    );
    await dashboardMarker.waitFor({ timeout: 5 * 60 * 1000 });
    console.log("  Sign-in detected.");
    if (STORAGE_STATE) {
      await context.storageState({ path: STORAGE_STATE });
      console.log(`  Saved storage state to ${STORAGE_STATE}`);
    }
    return page;
  }
}

// Inject CSS that hides UI elements we never want to ship in screenshots.
// "AI Training" is a feature-flagged sidebar entry that should not appear in
// public docs.
async function applyDocCss(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Hide any sidebar item whose visible text is exactly "AI Training". */
      [class*="sidebar"] a:has(> span:is(:where(*))) { /* no-op for selector test */ }
    `,
  }).catch(() => {});
  // The reliable approach: walk the DOM and hide matching elements directly.
  await page.evaluate(() => {
    const TEXTS_TO_HIDE = ["AI Training"];
    const hide = (el: Element) => {
      (el as HTMLElement).style.display = "none";
    };
    document.querySelectorAll("a, li, button, [role='menuitem']").forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (TEXTS_TO_HIDE.includes(txt)) hide(el);
    });
  });
}

async function shoot(page: Page, name: string): Promise<void> {
  await applyDocCss(page);
  const out = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`  saved ${name}`);
}

// --- Flow 1: OwnerRez OAuth consent screen ----------------------------------

async function captureOwnerRezAuth(page: Page): Promise<void> {
  console.log("Capturing OwnerRez OAuth consent screen...");

  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /pms connection/i }).first().click().catch(() => {});
  await page.getByRole("button", { name: /^ownerrez$/i }).first().click();

  // Open the OAuth pop-up. Most providers serve it in a new tab.
  const [authPage] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: /connect with ownerrez/i }).click(),
  ]);

  await authPage.waitForLoadState("networkidle");
  // The consent screen is on ownerrez.com - title contains "Authorize" or
  // "Allow". Wait for either before shooting.
  await Promise.race([
    authPage.getByRole("button", { name: /allow|authorize/i }).first().waitFor({ timeout: 30_000 }),
    authPage.getByRole("heading", { name: /allow|authorize/i }).first().waitFor({ timeout: 30_000 }),
  ]);

  await shoot(authPage, "ownerrez-oauth-authorize.png");

  // Don't actually authorize - close the tab so the dev account stays untouched.
  await authPage.close();
}

// --- Flow 2: Business model creation wizard ---------------------------------

async function captureBusinessModelWizard(page: Page): Promise<void> {
  console.log("Capturing Business Model wizard...");

  await page.goto(`${BASE_URL}/business-models`, { waitUntil: "networkidle" });
  await shoot(page, "business-models-list.png");

  await page.getByRole("button", { name: /create business model/i }).click();

  // Step 1 - template
  await page.getByRole("heading", { name: /template/i }).waitFor();
  await shoot(page, "business-models-wizard-step1-template.png");
  await page.getByRole("button", { name: /^sample/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 2 - basic info
  await page.getByLabel(/^name$/i).waitFor();
  await page.getByLabel(/^name$/i).fill(DRAFT_MODEL_NAME);
  await page.getByLabel(/description/i).fill("Created by docs capture script - safe to delete.");
  await shoot(page, "business-models-wizard-step2-basic.png");
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 3 - net rental income
  await page.getByRole("heading", { name: /net rental income/i }).waitFor();
  await shoot(page, "business-models-wizard-step3-net-rental-income.png");
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 4 - commission
  await page.getByRole("heading", { name: /commission/i }).waitFor();
  await shoot(page, "business-models-wizard-step4-commission.png");
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 5 - trust account
  await page.getByRole("heading", { name: /trust account/i }).waitFor();
  await shoot(page, "business-models-wizard-step5-trust-account.png");
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 6 - review and assign
  await page.getByRole("heading", { name: /review/i }).waitFor();
  await shoot(page, "business-models-wizard-step6-review.png");

  // Open the assign-properties picker so we can capture the dialog as it
  // looks during creation (not from an already-saved model).
  await page.getByRole("button", { name: /assign properties/i }).click();
  await page.getByRole("dialog").waitFor();
  await shoot(page, "business-models-assign-from-wizard.png");
  await page.getByRole("button", { name: /cancel|close/i }).first().click();

  console.log(
    `\n  Draft model "${DRAFT_MODEL_NAME}" was left in Draft status. Delete it from`,
    "\n  the Business Models list when you are done with these captures.\n",
  );
}

// --- Entry point ------------------------------------------------------------

async function main(): Promise<void> {
  const flow = (process.argv[2] ?? "all").toLowerCase();
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-quality screenshots
    storageState: STORAGE_STATE && fs.existsSync(STORAGE_STATE) ? STORAGE_STATE : undefined,
  });

  try {
    const page = await ensureSignedIn(context);

    if (flow === "ownerrez-auth" || flow === "all") {
      await captureOwnerRezAuth(page);
    }
    if (flow === "bm-wizard" || flow === "all") {
      await captureBusinessModelWizard(page);
    }
    if (!["ownerrez-auth", "bm-wizard", "all"].includes(flow)) {
      console.error(`Unknown flow: ${flow}. Use ownerrez-auth | bm-wizard | all.`);
      process.exit(1);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
