# Data architecture plan

## Recommendation

Use GitHub Pages for this static frontend and use a small Google Apps Script web
app as the authenticated API in front of a private Google Sheet.

Do not put a Google service-account key, API secret, or unrestricted write
credential in the browser. Anything shipped by GitHub Pages is public and can
be inspected. The browser should know only the API URL and a public Google OAuth
client ID.

```text
Browser on GitHub Pages
        │
        │ HTTPS + signed-in Google identity
        ▼
Google Apps Script web app
        │
        │ validates user, validates records, takes write lock
        ▼
Private Google Spreadsheet
```

For a university team, the Apps Script deployment should be restricted to the
university's Google Workspace domain where possible. The script can execute as
the deploying data owner, while every request is checked against an allowlist or
role table before data is returned or changed.

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
| `Semesters` | `id`, `label`, `season`, `year`, `status`, `forecast_units`, `actual_units`, `updated_at`, `version` |
| `SemesterKits` | `id`, `semester_id`, `kit_id`, `sold`, `on_hand`, `faulty`, `to_purchase`, `forecast_override`, `version` |
| `Inventory` | `id`, `component_id`, `quantity`, `location`, `counted_at`, `version` |
| `VendorQuotes` | `id`, `component_id`, `vendor`, `sku`, `quantity_break`, `unit_price`, `shipping`, `lead_days`, `checked_at` |
| `Orders` | `id`, `order_number`, `vendor`, `date`, `status`, `receipt_url`, `created_by`, `created_at`, `version` |
| `OrderLines` | `id`, `order_id`, `component_id`, `quantity`, `unit_price`, `semester_ids`, `version` |
| `Users` | `email`, `role`, `active` |
| `AuditLog` | `timestamp`, `request_id`, `email`, `action`, `entity`, `entity_id`, `before_json`, `after_json` |

The `version` column enables optimistic concurrency: the browser sends the
version it edited, and the API rejects a stale update instead of silently
overwriting someone else's changes.

Receipts should live in a restricted Google Drive folder; the sheet stores the
Drive file ID or URL rather than the file itself.

## API contract

Start with a small, versioned JSON contract:

```text
GET  ?action=bootstrap
POST { action: "saveKit", payload: { ... }, requestId: "..." }
POST { action: "saveSemester", payload: { ... }, requestId: "..." }
POST { action: "saveInventoryCount", payload: { ... }, requestId: "..." }
POST { action: "createOrder", payload: { ... }, requestId: "..." }
POST { action: "attachReceipt", payload: { ... }, requestId: "..." }
```

`bootstrap` should return the normalized records plus a `dataVersion` and
`syncedAt` value. The frontend can keep that snapshot in IndexedDB for fast
startup and offline read access.

Every write should:

1. Authenticate the Google user and check their role.
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

- Read the bootstrap data once at startup, not once per table or component.
- Update the UI optimistically, then replace the edited record with the API
  response.
- Debounce draft-like fields, but explicitly save important procurement changes.
- Cache the last successful snapshot and show `Saving`, `Saved`, `Offline`, or
  `Conflict` in the sidebar.
- Retry temporary quota or network failures with capped exponential backoff.
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
3. Add Google sign-in and domain/role checks.
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
