# Data architecture plan

## Recommendation

Use Firebase Authentication on its no-cost Spark plan and a Google Apps Script
web app in front of the private Google Sheet. Keep the source in GitHub. Because
the project must not require a billing account, do not deploy Firebase Cloud
Functions or Cloud Run.

The most reliable no-cost deployment is to serve the production UI from Apps
Script HTML Service and call server functions with `google.script.run`. This
avoids cross-origin restrictions between GitHub Pages and Apps Script while
keeping privileged Sheet access in server-side Apps Script.

Do not put a Google service-account key, API secret, or unrestricted write
credential in the browser. Anything shipped to the browser is public and can be
inspected. The browser may contain only the public Firebase web configuration;
the spreadsheet ID and other backend configuration belong in Apps Script
Properties.

```text
Browser UI served by Apps Script
        │
        │ Firebase ID token via google.script.run
        ▼
Google Apps Script web app
        │
        │ verifies email, enforces one editor lease, validates records
        ▼
Private Google Spreadsheet
```

The script can execute as the deploying data owner, while every request is
verified against Firebase Authentication and restricted to the dedicated
`HKNLabSuppliesGatech@gmail.com` account before data is returned or changed.
The `Users` tab records that account's Firebase UID for auditing. Apps Script
has no usage charge, but it has per-user daily quotas; reaching a quota pauses
operations instead of creating a bill.

## Why not call Sheets directly from GitHub Pages?

A direct browser-to-Sheets integration is possible with per-user OAuth, but it
has awkward trade-offs:

- Every user must be granted access to the underlying spreadsheet.
- The frontend receives broad Sheets authorization and becomes tightly coupled
  to row and column positions.
- Validation, audit logging, role checks, and safe multi-row writes are harder.
- No private service credential can safely live in a GitHub Pages site.

The API layer keeps the sheet private and exposes narrow operations such as
`listComponents`, `saveKit`, and `createPurchaseOrder`.

## Spreadsheet layout

Use one tab per entity, with a stable ID in the first column. Never use a row
number as identity.

| Tab | Important columns |
| --- | --- |
| `Components` | `id`, `part_number`, `name`, `category`, `manufacturer`, `package`, `description`, `active`, `updated_at`, `version` |
| `Kits` | `id`, `code`, `name`, `kind`, `favorite`, `active`, `updated_at`, `version` |
| `KitItems` | `id`, `kit_id`, `component_id`, `quantity`, `updated_at`, `version` |
| `KitItemRequirements` | `id`, `kit_id`, `component_id`, `note`, `updated_at`, `version` |
| `KitVersions` | `id`, `kit_id`, `version_number`, `label`, `effective_from`, `effective_to`, `items_json`, `version` |
| `SemesterKitVersions` | `id`, `semester_id`, `kit_id`, `kit_version_id`, `version` |
| `Semesters` | `id`, `label`, `season`, `year`, `status`, `forecast_units`, `actual_units`, `updated_at`, `version` |
| `SalesSummary` | `semester_id`, `transaction_count`, `credit_card_fee_count`, `as_of`, `sales_report_json`, `version` |
| `SemesterKits` | `id`, `semester_id`, `kit_id`, `sold`, `on_hand`, `faulty`, `to_purchase`, `forecast_override`, `version` |
| `Inventory` | `id`, `component_id`, `quantity`, `location`, `counted_at`, `version` |
| `PackedKitInventory` | `id`, `kit_id`, `prepared`, `sold`, `quantity`, `reserved`, `faulty`, `basis_semester_id`, `location`, `counted_at`, `note`, `version` |
| `VendorQuotes` | `id`, `component_id`, `vendor`, `sku`, `quantity_break`, `unit_price`, `shipping`, `lead_days`, `checked_at` |
| `Orders` | `id`, `order_number`, `vendor`, `date`, `status`, `receipt_url`, `notes`, `created_by`, `created_at`, `version` |
| `OrderLines` | `id`, `order_id`, `component_id`, `quantity`, `unit_price`, `semester_ids`, `version` |
| `Users` | `uid`, `email`, `display_name`, `role`, `active`, `created_at`, `last_seen_at` (one audit row only) |
| `AuditLog` | `timestamp`, `request_id`, `email`, `action`, `entity`, `entity_id`, `before_json`, `after_json` |
| `ChangeHistory` | `id`, `timestamp`, `action`, `entity`, `entity_id`, `summary`, `before_json`, `after_json`, `undone_at`, `version` |

The `version` column enables optimistic concurrency: the browser sends the
version it edited, and the API rejects a stale update instead of silently
overwriting someone else's changes. A separate renewable session lease permits
only one browser to write at a time; other browsers poll the same snapshot in
view-only mode until the lease is released or expires.

Receipts should live in a restricted Google Drive folder; the sheet stores the
Drive file ID or URL rather than the file itself.

## API contract

Start with a small, versioned JSON contract:

```text
POST { action: "bootstrap", sessionId: "..." }
POST { action: "syncSession", sessionId: "...", payload: { knownVersion: 4 } }
POST { action: "saveSnapshot", sessionId: "...", requestId: "...", payload: { expectedVersion: 4, snapshot: { ... } } }
POST { action: "releaseSession", sessionId: "..." }
```

`bootstrap` should return the normalized records plus a `dataVersion` and
`syncedAt` value. The frontend can keep that snapshot in IndexedDB for fast
startup and offline read access.

Authenticated editor-only actions use optional external services:

```text
POST { action: "suggestSemester", payload: { season, year, notes } }
POST { action: "refreshSupplierQuotes", payload: { componentId, quantity } }
POST { action: "lookupVendorComponent", payload: { vendor, query, url, categories } }
POST { action: "parseNewComponentText", payload: { text, vendor, categories } }
```

`suggestSemester` always starts with a deterministic same-season historical
baseline. Gemini may review that baseline through schema-constrained JSON, but
the response is validated and returned as a draft rather than saved. The
browser creates the term only after an officer reviews the values.

`refreshSupplierQuotes` retrieves supplier-owned price and availability data
from configured Mouser, DigiKey, and Newark/element14 APIs.
Gemini sees only catalog descriptions and per-kit requirements and can mark a
candidate for manual review; it never supplies numeric prices. A quote records
its provider, source timestamp, requested and order quantities, MOQ/multiple,
and price breaks. Shipping is excluded unless the supplier explicitly returns
it.

`lookupVendorComponent` is used when an officer adds a component that is not in
the catalog yet. Given a vendor name, a part number/SKU/keyword, and optionally a
product link, Gemini researches the part with its own web tools (Google Search
grounding, plus URL context when a link is given) and returns up to three
candidates: part number, vendor SKU, manufacturer, description, package,
category, stock, price breaks, product link, and datasheet link. It needs only
the Gemini key, not vendor API credentials, and it reads no saved state. Research
and extraction are two requests because the web tools are not combined with a
JSON schema. A product or datasheet link is kept only if the officer typed it,
Gemini's URL tool retrieved it, or its site is one the search cited; Google's
redirect links and unsupported links are dropped. Many vendor sites block
automated readers, so the officer can paste the listing text instead
(`parseNewComponentText`), which uses only the pasted text. Package and category
are best-effort guesses, and the category must be one of the catalog's categories.

Prices from `lookupVendorComponent` are read from web pages by an AI. They are
returned as drafts, saved with `priceSource: "gemini-web"`, and called out in
every purchase plan that allocates to them until the officer ticks that the prices
were checked on the product page. `refreshSupplierQuotes` is separate and still
uses the supplier APIs for verified quotes.

The browser saves a chosen candidate as an officer-maintained (`manual`) vendor
listing on the new component, with its source and look-up date, in one undoable
change together with the component. Compatibility stays "unknown" until the
officer confirms the exact listing. An unconfirmed listing can still be ordered
from Procurement but is left out of "cheapest source" prices.

## Inventory allocation rule

Current stock is physical state, not a forecast input. LabKit captures an
allocation only when the plan is for the immediately next academic semester:

1. Calculate completely packed kits as `prepared - recorded sales`, then
   allocate what remains after `reserved` and `faulty` are removed.
2. Calculate component demand only for the kits still needing assembly.
3. Allocate available loose components (`on_hand - reserved`).
4. Preserve the allocation on the semester plan so a later future plan cannot
   subtract the same stock again.

Farther-future semesters still receive demand suggestions, but their inventory
allocation is empty. Creating a plan does not decrement the master count.
Recording more prepared/received kits or editing semester sales updates the
calculated kit count; loose-component recounts remain explicit inventory edits.

Every request should first verify the Firebase ID token with the Firebase Auth
`accounts:lookup` endpoint, require `emailVerified`, and require the exact
configured account email. Every write should then:

1. Authenticate the dedicated Firebase account.
2. Validate field types, IDs, ranges, and referenced records.
3. Acquire an Apps Script lock.
4. Compare record versions.
5. Apply the related changes as one logical operation.
6. Append an audit entry.
7. Release the lock and return the updated records.

Client-generated `requestId` values make retries idempotent: if a timeout causes
the browser to retry, the API can return the original result rather than writing
the same order twice.

## Sync behavior

- Read the bootstrap data once at startup, then use the session heartbeat to
  fetch a new snapshot only when its version changes.
- Update the UI optimistically, then replace the edited record with the API
  response.
- Debounce draft-like fields, but explicitly save important procurement changes.
- Cache the last successful snapshot and show `Saving`, `Saved`, `Offline`, or
  `Conflict` in the sidebar.
- Retry temporary quota or network failures with capped backoff. Firebase token
  verification is cached briefly on the backend to reduce free-tier URL Fetch
  usage without storing the token in the Sheet.
- Never resolve version conflicts by last-write-wins for inventory or orders;
  show the newer server value and let the user reconcile.

## Limits and the point to migrate

Google Sheets is a good first database for a small internal team because it is
familiar, inspectable, and inexpensive. It is not a relational database.

Revisit the choice if the app reaches any of these conditions:

- dozens of simultaneous editors;
- frequent write bursts or large quote imports;
- complex reporting joins becoming slow;
- row counts moving into the high tens of thousands per entity;
- stronger permissions, transactions, or immutable audit requirements;
- external/public users.

At that point, keep the same frontend provider boundary and move the API to a
serverless function backed by PostgreSQL (for example Supabase or Cloud SQL).

## Implementation sequence

1. Finalize the columns and import the current historical sheet into the
   normalized tabs above.
2. Build read-only `bootstrap` and swap the local provider for a remote provider.
3. Add Firebase token verification and user/role checks.
4. Add one write flow at a time: components, kits, semesters, inventory, orders.
5. Add version checks, locking, audit logs, retries, and Drive receipt uploads.
6. Run both providers side by side during acceptance testing, then make Sheets
   the default after backups and restore procedures are tested.

## Official references

- [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [Apps Script Lock service](https://developers.google.com/apps-script/reference/lock)
- [Google Sheets API usage limits](https://developers.google.com/workspace/sheets/api/limits)
- [Google Identity Services for web](https://developers.google.com/identity/gsi/web/guides/integrate)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Mouser Search API](https://www.mouser.com/en/api-search/)
- [DigiKey two-legged OAuth](https://developer.digikey.com/tutorials-and-resources/oauth-20-2-legged-flow)
- [DigiKey pricing by quantity](https://developer.digikey.com/products/product-information-v4/productsearch/pricingoptionsbyquantity)
- [Newark/element14 Product Search API](https://partner.element14.com/Search_API)
