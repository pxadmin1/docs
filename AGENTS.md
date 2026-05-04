# PX Accounting documentation

This is the end-user documentation site for PX Accounting (https://pxapp.net), built on [Mintlify](https://mintlify.com) and published at https://docs.pxaccounting.com.

## About this project

- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links
- Audience: **end users** (property management company operators). Not developers, not internal admins.

## Terminology

- "PX Accounting" or "PX" - the product. Don't say "the platform" or "the app".
- "PMS" - property management system. PX supports a growing list of PMSes; do not enumerate them in prose. Speak generically about "your PMS". Only name a specific PMS on its own setup page or where the behavior is genuinely PMS-specific.
- "Ledger" - PX does NOT operate as a ledger or bookkeeping engine. Never say "PX builds the ledger" or "PX maintains a ledger". PX *audits* the data your PMS produces. For the Class 3 reconciliation checks, PX computes what the ledger postings should look like internally for audit purposes only - call this "modeling" or "computing expected postings", never "building the ledger".
- "Listing" / "Property" - the same thing. The UI says "Property" most places, "Listing" when scoped to PMS data. Match the screen the user is on.
- "Reservation" / "Booking" - the same thing. Match what the active PMS calls it (Guesty: reservation, OwnerRez: booking).
- "Business model" (lowercase b/m in prose, "Business Models" capitalized when referring to the page).
- "Audit" - the per-reservation diagnostic run. "Findings" - what an audit returns.
- "Auto-fix" - PX's automatic issue resolution. Toggleable per-property and globally.

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise - one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Save credentials**
- Code formatting for file names, env var names, and exact field values
- Use regular hyphens (-), never em dashes
- Currency examples: use USD ($) by default

## Content boundaries

- **Document**: PMS integrations (Guesty, OwnerRez, Hostaway, Hospitable, Hostfully, Lodgify, Uplisting), Properties, Business Models, Tax Configuration, PMS Configuration, Audits, Financial Reports, Account & Billing, Settings.
- **Do not document**: admin-only pages (impersonation, diagnostic jobs, issue categories, accounting hierarchy), internal API endpoints, infrastructure (Redis, Supabase, Stripe webhook secrets).
- Communication Training is a beta feature - mention briefly under Account if at all, otherwise omit.
- Reports are feature-flagged per user; document them but note the user may not see the page until enabled.

## Screenshots

Use `<Frame>` placeholders next to every UI step. The product owner fills in screenshots after the prose is approved:

```
<Frame caption="The Settings page with PMS Connection card highlighted">
  ![Settings page](/images/screenshots/settings-pms-connection.png)
</Frame>
```
