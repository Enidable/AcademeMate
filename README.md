# AcademeMate

A personal academic time-management tool: study-session log, daily planner, course &amp; grade tracking, deadlines, and dashboards. The GitHub Pages site is just the GUI — your data lives in **your own Google Drive**, one spreadsheet per person, so nobody else can see it.

## How it works

- Each user signs in with their Google account (OAuth). The app creates (or finds) a folder **"AcademeMate - Study Tracking"** on that person's Drive, with a spreadsheet **"AcademeMate Data"** inside it, containing tabs that mirror the classic Master Tracker structure:
  - `INPUT_LOG` — study sessions
  - `Master Time Management` — courses
  - `Grade Computer` — grades
  - `Time structure and hours of study` — weekly hours
  - `Deadlines and Lectures` — deadlines
  - `Daily` — weekly planner
- The `drive.file` OAuth scope means the app can only touch the spreadsheet it created for that account — data stays isolated per user.
- Edits made in the app are written straight back to the spreadsheet (via the Sheets API). If you're not signed in, the app falls back to the bundled example CSVs in `public/data/`.

## Getting started

```bash
npm install
npm run dev
```

### 1. Google Cloud / OAuth setup (one-time)

1. Go to https://console.cloud.google.com → create a project (e.g. `AcademeMate`).
2. **APIs & Services → Library** → enable *Google Drive API* and *Google Sheets API*.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (so your friends can sign in later).
   - Add the scopes `.../auth/drive.file`, `.../auth/spreadsheets`, `openid`, `email`, `profile`.
   - Add yourself (and friends) as **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized JavaScript origins: `https://<username>.github.io` and `http://localhost:5173`
   - Authorized redirect URIs: `https://<username>.github.io/<repo>/` and `http://localhost:5173/`
5. Copy the Client ID into a local env file:

```bash
cp .env.example .env.local   # then paste: VITE_GOOGLE_CLIENT_ID=...
```

### 2. Deployment (GitHub Pages)

The repo includes a workflow (`.github/workflows/deploy.yml`) that builds and deploys on every push to `main`. The Vite `base` is set to `/AcademeMate/`.

1. Create the repo on GitHub (or push this folder to an existing one).
2. Repo **Settings → Pages → Source**: *GitHub Actions*.
3. Push to `main`. The workflow builds `dist` and deploys automatically.

## Data

- **Live data**: the per-user folder + spreadsheet on Drive. A brand-new account is created each time — the app never reuses or touches an existing spreadsheet.
- **Offline/template data**: the CSV files in `public/data/` (used as a fallback when signed out, and as the seed for brand-new accounts).
- **Example data**: because the repo is public, `public/data/` contains only *generated, fictional* data. Regenerate it with `node scripts/generate-example-data.mjs` and validate it with `node scripts/verify-example-data.mjs`. Never commit personal records.
- **Migrating your real data**: in the app, open the *Connect* menu (top-right), connect Drive, then use **Import your own CSV** to replace each tab with an export of your own spreadsheet.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build into `dist/`
- `npm run lint` — oxlint
- `npm run preview` — preview the production build
