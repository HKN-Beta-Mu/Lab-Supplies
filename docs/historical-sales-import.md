# Historical sales import

The canonical browser seed is `src/historical-sales.js`. It contains 36
semesters from Spring 2015 through Fall 2026 and replaces the prototype's
generated demo history.

## Sources and reconciliation

- Class sizes and historical purchase counts come from the semester table
  supplied on Oct 4, 2026.
- Fall 2026 comes from the Square Sales Report covering Aug 1 through Oct 4,
  2026. It is marked as an interim total with `asOf: 2026-10-04`.
- The supplied Drive ZIP contains 377 historical operational files (BOMs,
  inventories, sign-up sheets, receipts, and event material). It was inspected
  as supporting source material but was not modified or treated as a
  transaction-level Square export.

Fall 2026 uses these normalized quantities:

| Item | Quantity | Treatment |
| --- | ---: | --- |
| ECE 2031 kit | 228 | Square item quantity |
| ECE 3043 kit | 132 | Square item quantity |
| ECE 3741 kit | 232 | Square item quantity |
| ECE 2040 kit | 171 | Square item quantity |
| Giant breadboard | 77 | Square item quantity |
| Small breadboard | 233 | 230 regular plus 3 alternate-price sales |
| Wire kit | 458 | 448 regular plus 10 Custom Amount / half-price sales |

Those products total 1,531 units. The 584 Credit Card Fee line items are kept
separately and are not counted as physical units, so all reported item lines
still reconcile to Square's 2,115 category items. The 807 transaction count is
the 211 cash payments plus 596 card payments.

Purchase rates are derived from `kits purchased / class size` in the canonical
data instead of storing a second rounded copy. The separate ECE 2031 and ECE
2040 online enrollment rows are retained in each semester's class-count object.

The original records do not contain historical forecasts. Imported terms use
`forecast: null`, and the app labels them as not recorded instead of presenting
fabricated forecast-accuracy scores.

## Sheet storage

The full canonical snapshot is versioned in `AppState`. Readable semester
totals are also written to `Semesters`, while transaction counts and the full
Fall 2026 Square report are written to `SalesSummary`. Existing shared data with
no matching `historicalDataVersion` is migrated on the next editor session:
canonical history replaces the old generated terms, while user-created future
semesters are retained.
