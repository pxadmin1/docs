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

// Inject CSS that hides UI elements we never want to ship in screenshots:
//   - "AI Training" sidebar entry (feature-flagged, not for public docs).
//   - "Admin Panel" sidebar entry (only visible to admin users).
//   - Sidebar footer (the user-name / email block at the bottom).
async function applyDocCss(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-sidebar="footer"] { display: none !important; }
    `,
  }).catch(() => {});
  await page.evaluate(() => {
    const TEXTS_TO_HIDE = ["AI Training", "Admin Panel"];
    const hide = (el: Element) => {
      (el as HTMLElement).style.display = "none";
    };
    document.querySelectorAll("a, li, button, [role='menuitem']").forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (TEXTS_TO_HIDE.includes(txt)) {
        // Walk up to the nearest sidebar menu item so we hide the whole row.
        const item = el.closest('li, [data-sidebar="menu-item"]') ?? el;
        hide(item);
      }
    });
    // Belt-and-suspenders: also hide any element whose data-sidebar attribute
    // marks it as the footer.
    document.querySelectorAll('[data-sidebar="footer"]').forEach(hide);
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

  // Click "Connect with OwnerRez". The OAuth flow is either a popup OR a
  // same-tab redirect to ownerrez.com - handle both.
  const popupPromise = page
    .context()
    .waitForEvent("page", { timeout: 8_000 })
    .catch(() => null);
  await page.getByRole("button", { name: /connect with ownerrez/i }).click();
  const popup = await popupPromise;

  let authPage: Page;
  if (popup) {
    authPage = popup;
    await authPage.waitForLoadState("networkidle");
  } else {
    // Same-tab redirect: wait until the original page lands on ownerrez.com.
    await page.waitForURL(/ownerrez\.com/i, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    authPage = page;
  }

  // Step 1: capture whatever screen OwnerRez shows first. Usually the login
  // page (when the user is not signed into OwnerRez), occasionally the
  // consent screen (when they already are).
  await authPage.waitForTimeout(1500); // let the page render fully
  await shoot(authPage, "ownerrez-oauth-login.png");
  console.log("  Captured the OwnerRez sign-in screen.");

  // Step 2: wait for navigation to the OAuth authorize page. The user has up
  // to 5 minutes to sign in to OwnerRez manually.
  console.log(
    "\n  Sign in to OwnerRez in the browser window so the OAuth consent screen",
    "\n  loads. The script will capture it automatically and then close.",
    "\n  (Waiting up to 5 minutes...)\n",
  );
  try {
    await authPage.waitForURL(/oauth\/authorize/i, { timeout: 5 * 60 * 1000 });
    await authPage.waitForLoadState("networkidle");
    await Promise.race([
      authPage.getByRole("button", { name: /allow|authorize|approve|grant/i }).first().waitFor({ timeout: 30_000 }),
      authPage.getByRole("heading", { name: /allow|authorize|access|connect/i }).first().waitFor({ timeout: 30_000 }),
    ]).catch(() => {});
    await shoot(authPage, "ownerrez-oauth-authorize.png");
    console.log("  Captured the OwnerRez OAuth consent screen.");
  } catch {
    console.log("  Did not reach the OAuth consent screen in time. Skipping.");
  }

  if (popup) {
    await authPage.close();
  } else {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
}

// --- Flow 2: Business model creation wizard ---------------------------------

async function captureBusinessModelWizard(page: Page): Promise<void> {
  console.log("Capturing Business Model wizard...");

  await page.goto(`${BASE_URL}/business-models`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shoot(page, "business-models-list.png");

  // Land on /business-models/new directly. Avoids the duplicate "Create
  // Business Model" buttons on the list page (header + empty state).
  await page.goto(`${BASE_URL}/business-models/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Real wizard step labels (from src/lib/business-model-constants.ts):
  //   1 Welcome, 2 What counts as income, 3 Your commission rate,
  //   4 Recurring charges, 5 Final details, 6 Review & Create.
  // Navigation: "Continue" between steps; step 1 has a "Let's Get Started"
  // CTA instead of the inline Continue.

  // Step 1 - Welcome
  await page.getByRole("heading", { name: /let.?s set up how you get paid/i }).waitFor({ timeout: 30_000 });
  await shoot(page, "business-models-wizard-step1-welcome.png");
  await page.getByRole("button", { name: /let.?s get started/i }).click();

  // Step 2 - What counts as income
  await page.waitForTimeout(800);
  await shoot(page, "business-models-wizard-step2-income.png");
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Step 3 - Your commission rate
  // The "Your Commission Rate" card has a Switch (confirmedResEnabled,
  // default false). Flip it on first - the rate input and recognition
  // pills are conditionally rendered behind it.
  await page.waitForTimeout(800);
  const commissionSwitch = page.getByRole("switch").first();
  if ((await commissionSwitch.getAttribute("data-state").catch(() => "")) === "unchecked") {
    await commissionSwitch.click().catch(() => {});
    await page.waitForTimeout(600);
  }

  // Continue is disabled until both a commission rate AND a recognition
  // timing are set. Fill the rate (20%) and pick "When guest checks in".
  const commissionInput = page.getByLabel(/^commission rate$/i).first();
  await commissionInput.click({ clickCount: 3 }).catch(() => {});
  await commissionInput.fill("20").catch(() => {});

  // Click the "When guest checks in" recognition pill. Use a button-scoped
  // locator so we click the button itself (not a child text node) and so the
  // synthetic click lands on the real onClick handler.
  const recognitionPill = page.locator('button:has-text("When guest checks in")').first();
  await recognitionPill.scrollIntoViewIfNeeded().catch(() => {});
  await recognitionPill.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  // Diagnostic: dump the recognition button's class to confirm it became
  // active (border-primary bg-primary). If it did not, retry the click.
  let pillIsActive = await recognitionPill
    .evaluate((el) => (el as HTMLElement).className.includes("border-primary"))
    .catch(() => false);
  if (!pillIsActive) {
    console.log("  Recognition pill click did not stick - retrying.");
    // Try clicking via dispatchEvent to bypass any pointer-event guards.
    await recognitionPill.evaluate((el) => {
      (el as HTMLButtonElement).click();
    }).catch(() => {});
    await page.waitForTimeout(800);
    pillIsActive = await recognitionPill
      .evaluate((el) => (el as HTMLElement).className.includes("border-primary"))
      .catch(() => false);
    console.log(`  pill active after retry: ${pillIsActive}`);
  }

  await shoot(page, "business-models-wizard-step3-commission.png");
  await page.getByRole("button", { name: /^continue$/i }).click({ timeout: 30_000 });

  // Step 4 - Recurring charges (optional, can skip)
  await page.waitForTimeout(800);
  await shoot(page, "business-models-wizard-step4-charges.png");
  // The Continue button on step 4 is enabled even with zero charges. If
  // disabled, fall back to the "Skip this step" link.
  const step4Continue = page.getByRole("button", { name: /^continue$/i });
  if (await step4Continue.isEnabled().catch(() => false)) {
    await step4Continue.click();
  } else {
    await page.getByRole("button", { name: /skip this step/i }).click();
  }

  // Step 5 - Final details (name + assign listings)
  await page.waitForTimeout(800);
  // The name field is `<Input id="wizard-name">`. Its label reads "Name *"
  // (the asterisk is a child span) so getByLabel(/^name$/i) misses it.
  // Target the input by id instead.
  await page.locator("#wizard-name").fill(DRAFT_MODEL_NAME).catch(() => {});
  await page.locator("#wizard-description").fill("Docs capture - safe to delete.").catch(() => {});
  await page.waitForTimeout(400);
  await shoot(page, "business-models-wizard-step5-details.png");
  await page.getByRole("button", { name: /^continue$/i }).click({ timeout: 30_000 });

  // Step 6 - Review & Create
  await page.waitForTimeout(800);
  await shoot(page, "business-models-wizard-step6-review.png");

  console.log(
    `\n  Draft model "${DRAFT_MODEL_NAME}" was filled but not saved.`,
    "\n  If you clicked through manually, delete it from the Business Models list.\n",
  );
}

// --- Entry point ------------------------------------------------------------

async function main(): Promise<void> {
  const flow = (process.argv[2] ?? "all").toLowerCase();
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Launch a persistent context against the user's real Chrome install.
  // Google's "This browser may not be secure" warning blocks sign-in on
  // Chrome-for-Testing; using channel: "chrome" + a persistent profile
  // makes the session look like a normal browser.
  const userDataDir = path.resolve(__dirname, "..", ".tmp", "chrome-profile");
  fs.mkdirSync(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    args: ["--disable-blink-features=AutomationControlled"],
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
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
