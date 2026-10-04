# LabKit Manager

LabKit is a static web app for planning electronic lab kits across semesters,
building component lists, comparing vendor pricing, forecasting demand, and
tracking purchase orders and receipts.

The supplied design prototype has been packaged as the application entry point
and extended with responsive behavior and persistent demo data. No build-time
dependencies are required.

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

## Current data behavior

The app starts with representative demo data from the design. User changes are
stored in the browser's `localStorage`, so they survive refreshes on that device.
The **Reset** action in the sidebar restores the original demo data.

All persistence goes through `window.LabKitDataSource` in
`src/data-source.js`. That small boundary is intentional: the UI can move from
local demo persistence to a remote API without rebuilding every screen.

The proposed Google Sheets architecture, table layout, security model, and
migration sequence are in [docs/data-architecture.md](docs/data-architecture.md).
# Lab-Supplies
# Lab-Supplies
# Lab-Supplies
# Lab-Supplies
