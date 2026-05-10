# Scripts

## capture-screenshots.ts

Playwright script that captures the screenshots the docs site embeds. It opens
a non-headless browser, lets you sign in to PX manually, and then walks the
flows that are hard to script the rest of the way.

### One-time setup

```bash
cd /Users/marwan/GitHub/repos/docs
npm install --save-dev playwright @types/node typescript ts-node
npx playwright install chromium
```

### Running

```bash
# All flows
npx ts-node scripts/capture-screenshots.ts all

# Just one
npx ts-node scripts/capture-screenshots.ts ownerrez-auth
npx ts-node scripts/capture-screenshots.ts bm-wizard
```

The script writes captures into `images/screenshots/` next to the existing
ones - filenames match what the MDX pages reference.

### Skipping the manual login on re-runs

```bash
PX_STORAGE_STATE=./.tmp/px-session.json \
  npx ts-node scripts/capture-screenshots.ts all
```

The first run saves a Playwright `storageState` file with your session cookies
after you log in manually. Later runs reuse it and start automated work
immediately.

### Notes

- **OwnerRez OAuth flow** is captured against the real OwnerRez consent
  screen. The script closes the tab without clicking Allow, so it is safe to
  run on a connected account.
- **Business model wizard** creates a real draft model named `Docs Capture
  <timestamp>`. It stays in Draft; delete it from the Business Models list
  when you are done. Override the name with `PX_BUSINESS_MODEL_NAME`.
- Captures are taken at 1440x900 with `deviceScaleFactor: 2` so the PNGs
  match the resolution of the captures already in the repo.
