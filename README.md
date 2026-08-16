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
   - **Authorized JavaScript origins** (these are the only ones checked by this app's sign-in flow; redirect URIs are not used): `http://localhost:5173` for local dev **and** `https://<username>.github.io` for the deployed GitHub Pages site.
   - *Authorized redirect URIs* can stay empty for this flow.
5. Your Client ID is already baked into `src/config.js` as the default, so the **GitHub Pages build works with it automatically** (Client IDs are public identifiers — they're visible in the shipped JS either way).
   - Only need a local env file if you want to *override* it for a different Client ID:
     ```bash
     cp .env.example .env.local   # then paste: VITE_GOOGLE_CLIENT_ID=...
     ```

> **If OAuth seems to "have a wrong Client ID"**: Google reissues a **new** Client ID every time you regenerate credentials — paste the current one into `.env.local` and restart `npm run dev`. And the origin of the page you open must be in *Authorized JavaScript origins* (localhost and github.io are separate origins).

### 2. Deployment (GitHub Pages)

The repo includes a workflow (`.github/workflows/deploy.yml`) that builds and deploys on every push to `main`. The Vite `base` is set to `/AcademeMate/`.

1. Create the repo on GitHub (or push this folder to an existing one).
2. Repo **Settings → Pages → Source**: *GitHub Actions*.
3. Push to `main`. The workflow builds `dist` and deploys automatically.

## Data

- **Live data**: the per-user folder + spreadsheet on Drive. A brand-new account is created each time — the app never reuses or touches an existing spreadsheet.
- **Template data**: the CSV files in `public/data/` seed brand-new accounts and power the offline fallback. They carry the programme's **course backbone** — real course IDs, names, quartiles, EC and grading weights — with *all* personal data (grades, study log, deadlines, planner appointments) stripped. Rebuild them from your local `my_data/` sheets with `node scripts/generate-example-data.mjs` (runs on your machine only) and validate with `node scripts/verify-example-data.mjs`.
- **Your private data**: never committed. `my_data/` (your spreadsheet exports) is gitignored, and personal records only ever live in your own Drive spreadsheet.
- **Migrating your real data**: in the app, open the *Connect* menu (top-right), connect Drive, then use **Import your own CSV** to replace each tab with an export of your own spreadsheet.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build into `dist/`
- `npm run lint` — oxlint
- `npm run preview` — preview the production build
