# Gross Board parser (Python + pandas)

Parses a trucking **Gross Board** workbook — three rows per driver
(`Rate` / `Mile` / `Load #`) with dates across the columns — into tidy tables.

```
scripts/
├── parse_gross_board.py         # the parser + CLI
├── make_sample_gross_board.py   # generates spec + messy sample workbooks
├── test_parse_gross_board.py    # 51 assertions, no pytest needed
└── ../samples/                  # generated sample .xlsx files
```

## Install

```bash
pip install pandas openpyxl
```

## Run

```bash
# 1) parse a workbook: prints a preview + writes CSV/JSON to ./out
python scripts/parse_gross_board.py samples/gross_board_messy.xlsx --out out/

# 2) just the data frames, no files
python scripts/parse_gross_board.py board.xlsx --no-files

# 3) unusual preamble: point at the header / first data row (0-based iloc)
python scripts/parse_gross_board.py board.xlsx --header-row 2 --start-row 5

# 4) pick a sheet
python scripts/parse_gross_board.py board.xlsx --sheet "Week 42"

# 5) run the tests / regenerate samples
python scripts/test_parse_gross_board.py
python scripts/make_sample_gross_board.py --out samples
```

Outputs in `--out`: `driver_days.csv`, `driver_summary.csv`, `gross_board.json`.

## Use as a library

```python
from parse_gross_board import parse_gross_board, parse_gross_board_workbook

# exactly the two frames requested
daily_df, summary_df = parse_gross_board("board.xlsx")

# or, with warnings + metadata + JSON export
result = parse_gross_board_workbook("board.xlsx")
print(result.warnings)
result.to_json("out/board.json")
```

`result.to_dict()` returns:

```jsonc
{
  "meta":     { "header_row_excel": 3, "data_start_excel": 4, "week_start": "...", "columns": {...} },
  "warnings": ["driver 'Maria': daily rate cells add up to 45,550.00 but Total $ says 45,300.00 ..."],
  "drivers":  [ { "driver_name": "Brett", "...": "...", "days": [ /* 7 daily records */ ] } ],
  "summary":  [ /* one record per driver */ ],
  "daily":    [ /* one record per driver-day */ ]
}
```

## The two frames

**`daily` — one row per (driver, date)**

| column | meaning |
| --- | --- |
| `driver_name`, `truck_number` | identity, filled from the Rate row even when merged cells export blank |
| `date`, `date_iso` | parsed date (null when the header isn't a date) |
| `rate_or_status` | raw cell text, exactly as written (`"4300"`, `"HOME"`, `"OOS - DOT"`) |
| `rate_numeric` | the number when the cell is money, otherwise null |
| `status` | upper-cased non-numeric marker (`HOME`, `ENROUTE`, `OOS`, …) |
| `is_working_day` | true only when a positive numeric rate exists |
| `miles`, `load_number` | from the Mile and Load # rows |
| `driver_index`, `driver_key`, `day_of_week`, `date_label`, `week_start`, `week_end`, `source_row` | provenance for pivots, joins and audits |

**`summary` — one row per driver**

`total_revenue_reported`, `total_miles_reported`, `rate_per_mile_reported`,
`manager_comments` come from columns L–O. Derived: `days_worked`,
`daily_revenue_sum`, `total_miles_sum`, `computed_rate_per_mile`,
`gross_per_day_worked`, `miles_per_day_worked`, `status_flags`, plus
`revenue_check` / `miles_check` (`ok` or `mismatch (…)`) and `source_rows`.

## What it tolerates

- Header anywhere in the first 20 rows (banners, export stamps, blank rows).
- Sub-type spellings: `Rate`, `Revenue`, `Gross`, `Mile(s)`, `Mileage`,
  `Load`, `Load #`, `Load Id`, `Trip`, `Pro`.
- Identity cells blank on the Mile / Load rows (merged-cell exports).
- Missing `Load #` row, sub-rows out of order, or a driver with only one row.
- `HOME` / `ENROUTE` / `OOS` / `SHOP` / … in a rate cell, kept as a status.
- Non-numeric miles, `$1,234.50`, `(120)` negatives, Excel serial dates.
- An unlabelled fleet-totals row under the header: skipped as a driver and
  exposed in `meta.fleet_totals_seen`.
- Notes/footers below the table and empty spacer rows.

Nothing is silently dropped: skipped rows and every reconciliation difference
appear in `warnings`.

## Reconciliation

`revenue_check` compares the seven daily rate cells with **Total $**; `miles_check`
compares daily miles with **Total Mile**. Any difference above $0.02 raises a
warning naming the driver and both numbers — the fastest way to catch a
hand-edited total. `Per Mile` is also re-derived and compared.

## Assumptions worth knowing

- Rows are associated with dates by **column position**, so a hidden or inserted
  column inside E..K shifts the mapping; pass `--header-row` if the sheet is
  unusual and check `meta.date_columns` when you load a new template.
- Gross figures are assumed to be the driver's revenue for that day, not net of
  fuel or accessorials — the sheet does not distinguish them.
- The parser is read-only; it never writes back to the workbook.
