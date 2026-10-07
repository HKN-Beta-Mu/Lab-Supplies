# LabKit Manager

LabKit is a static web app for planning electronic lab kits across semesters,
building component lists, comparing vendor pricing, forecasting demand, and
tracking purchase orders and receipts.

The shared app now also tracks loose-component and completely packed-kit
inventory, captures that stock only for the immediately next semester, keeps
per-kit requirements on every BOM line, versions kit definitions by semester,
keeps editable sales and undoable change history, and records both bulk and
one-off orders with paid prices and receipt links. It also supports reviewable
Gemini demand suggestions plus verified Mouser/DigiKey/Newark pricing. AI never
applies a plan automatically; the officer edits and approves the draft. When a
new component is added from a vendor, Gemini can read the part and its prices
from the web; those prices are drafts, marked unverified until an officer checks
them. Each semester can also be pointed at one vendor, and a bulk purchase finds
the most economical split between two vendors when the cheaper one runs short.

The supplied design prototype has been packaged as the application entry point
and extended with responsive behavior and persistent shared data. The semester
history now uses the supplied Spring 2015–Fall 2026 records rather than generated
demo figures. No build-time dependencies are required.

## Run locally

```sh
npm run dev
```

Open <http://127.0.0.1:4173>.

## Check and build

```sh
npm run check
```

This runs the smoke tests and creates a deployable `dist/` directory. The app
uses only relative asset paths, so it works on a GitHub Pages project URL as
well as on a custom domain.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Run the **Deploy LabKit to GitHub Pages** workflow, or push to `main`.

The workflow tests the app, builds only the production assets, and publishes
the `dist/` directory. The source prototype, notebook, and zip file are not
included in the deployed site.

GitHub Pages is useful for a static preview, but it cannot use the private
Google Sheet backend. The production club app should remain the Apps Script
`/exec` deployment.

## Automatically deploy Apps Script from GitHub

The `Deploy LabKit to Apps Script` workflow rebuilds the self-contained
`apps-script/Index.html`, pushes `Code.gs`, `Index.html`, and `appsscript.json`
with clasp, then updates the existing deployment. Updating the existing
deployment preserves the current `/exec` URL.

The workflow is disabled until the one-time setup in
[`apps-script/README.md`](apps-script/README.md#automatic-github-deployment) is
complete. Credentials live in GitHub Actions secrets and are never committed.

## Data behavior

The app starts with the imported historical sales data and the design's
component catalog. When run locally or on
GitHub Pages, user changes are stored in the browser's `localStorage`. When the
generated `apps-script/Index.html` is hosted by Apps Script, the same interface
loads and saves the shared private Google Sheet through `google.script.run`.

All persistence goes through `window.LabKitDataSource` in
`src/data-source.js`. That small boundary is intentional: the UI can move from
local demo persistence to a remote API without rebuilding every screen.

The public Firebase browser configuration lives in
`src/firebase-config.js`, and `src/firebase.js` initializes Firebase and
Authentication. Firebase's browser API key identifies the project; it is not a
backend credential. Never place Gemini keys, service-account keys, OAuth client
secrets, or other privileged credentials in either frontend file.

`src/auth.js` and `src/auth.css` provide email verification, sign-in, password
reset, persistent sessions, and sign-out for the one dedicated HKN Lab Supplies
account. Firebase Authentication stores the credentials; the application and
Google Sheet never receive or store its password. The Apps Script backend
verifies the Firebase ID token and rejects every other email before returning or
changing shared data.

Only one browser session can edit at a time. Apps Script grants a renewable
editor lease to the first signed-in session; additional sessions receive live
updates in view-only mode and automatically gain edit access after the editor
signs out or its lease expires. The backend checks the lease on every save, so
the restriction is not dependent on disabled UI controls.

The Apps Script installation and deployment steps are in
[apps-script/README.md](apps-script/README.md). The Google Sheets architecture,
table layout, security model, and migration guidance are in
[docs/data-architecture.md](docs/data-architecture.md).
The sales-source reconciliation is documented in
[docs/historical-sales-import.md](docs/historical-sales-import.md).

Gemini and supplier credentials are stored only in Apps Script Properties. If
they are omitted or a free-tier quota is exhausted, semester creation falls
back to the deterministic historical forecast and pricing remains visibly
labeled as an estimate. Amazon, Jameco, LCSC, AliExpress, and Alibaba are
available as manual search links; their results are not presented as live or
included in verified cheapest-price decisions without an authorized API.
# Lab-Supplies
# Lab-Supplies
# Lab-Supplies
# Lab-Supplies
# Lab-Supplies
