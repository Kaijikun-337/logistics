#!/usr/bin/env python3
"""
Tests for parse_gross_board.py — plain asserts, no pytest required.

    python scripts/test_parse_gross_board.py

Covers:
  * the documented 3-row-block layout (header on Excel row 2, data from row 5)
  * a messy real-world export (banners, fleet totals row, edited total, missing
    Load # row, blanks on merged identity cells)
  * custom header/data positions, text and Excel-serial date headers
  * statuses ("HOME", "ENROUTE", "OOS"), non-numeric miles, blank loads
  * JSON output validity (no NaN) and dataframe<->JSON shape
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parent))

from make_sample_gross_board import (  # noqa: E402
    build_messy_workbook,
    build_screenshot_workbook,
    build_spec_workbook,
)
from parse_gross_board import (  # noqa: E402
    parse_gross_board,
    parse_gross_board_frame,
    parse_gross_board_workbook,
    to_number,
)

PASSED: list[str] = []


def ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    PASSED.append(message)


def is_blank_value(value) -> bool:
    """True for None / NaN / pd.NA — pandas 3 uses pd.NA for nullable floats."""
    import pandas as pd

    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def check_unit_helpers() -> None:
    ok(to_number("$1,234.50") == 1234.5, "to_number parses $ and thousands separators")
    ok(to_number("(120)") == -120.0, "to_number parses accounting negatives")
    ok(to_number("HOME") is None, "to_number rejects status text")
    ok(to_number(None) is None and to_number(float("nan")) is None, "to_number rejects blanks/NaN")


def check_spec_workbook(tmp: Path) -> None:
    path = tmp / "spec.xlsx"
    build_spec_workbook(path)

    daily, summary = parse_gross_board(path)
    ok(len(summary) == 5, "spec: five drivers in the summary frame")
    ok(len(daily) == 35, "spec: 5 drivers x 7 dates = 35 driver-days")
    ok(math.isnan(to_number("n/a") or math.nan), "to_number returns None (not NaN) for junk")
    ok(
        list(daily.columns)[:6]
        == ["driver_name", "truck_number", "date", "date_iso", "rate_or_status", "rate_numeric"],
        "spec: flat frame starts with the requested columns",
    )
    ok(daily["date"].notna().all(), "spec: every driver-day has a parsed date")
    ok(set(daily["day_of_week"]) == {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}, "spec: weekday names derived")
    ok(int(daily["load_number"].notna().sum()) == 31, "spec: load numbers preserved (4 intentionally blank)")

    carlos_home = daily[(daily["driver_name"] == "Carlos") & (daily["date_iso"] == "2026-10-14")].iloc[0]
    ok(carlos_home["status"] == "HOME", "'HOME' kept as a status")
    ok(is_blank_value(carlos_home["rate_numeric"]), "'HOME' has no numeric rate")
    ok(float(carlos_home["miles"]) == 0.0, "zero miles preserved")
    ok(bool(carlos_home["is_working_day"]) is False, "status day is not a working day")

    dwayne = summary[summary["driver_name"] == "Dwayne"].iloc[0]
    ok(dwayne["status_flags"] == "ENROUTE, OOS", "multiple statuses collected per driver")
    ok(int(dwayne["days_worked"]) == 4, "days worked counts only positive numeric days")
    ok(dwayne["revenue_check"] == "ok", "spec: daily rates reconcile with Total $")
    ok(dwayne["gross_per_day_worked"] is not None, "derived gross per day worked")
    ok(len(summary) == len(summary["driver_name"].unique()), "summary is one row per driver")

    result = parse_gross_board_workbook(path)
    ok(result.meta["header_row_excel"] == 2, "spec: header detected on Excel row 2")
    ok(result.meta["data_start_excel"] == 5, "spec: data detected from Excel row 5")
    ok(result.warnings == [], f"spec: no warnings for a clean sheet (got {result.warnings})")


def check_messy_workbook(tmp: Path) -> None:
    path = tmp / "messy.xlsx"
    build_messy_workbook(path)
    result = parse_gross_board_workbook(path)

    ok(result.meta["header_row_excel"] == 3, "messy: header found below two banner rows")
    ok(len(result.summary) == 5, "messy: fleet totals row is not counted as a driver")
    ok(
        result.meta["fleet_totals_seen"] is not None
        and result.meta["fleet_totals_seen"]["total_revenue"] == 165525.0,
        "messy: unlabelled fleet totals captured in meta",
    )

    names = set(result.summary["driver_name"])
    ok(names == {"Brett", "Carlos", "Dwayne", "Maria", "Tyrone"}, "messy: all driver names present")

    maria = result.summary[result.summary["driver_name"] == "Maria"].iloc[0]
    ok(str(maria["revenue_check"]).startswith("mismatch"), "messy: hand-edited Total $ flagged")
    tyrone = result.summary[result.summary["driver_name"] == "Tyrone"].iloc[0]
    ok("load" not in str(tyrone["subrows_found"]), "messy: driver missing the Load # row identified")
    ok(int(tyrone["days_worked"]) == 7, "messy: driver still parses without a Load # row")

    warnings = "\n".join(result.warnings)
    ok("Maria" in warnings and "45,550.00" in warnings, "messy: mismatch warning names the driver and amounts")
    ok("Tyrone" in warnings and "no 'Load' row" in warnings, "messy: missing sub-row warning")
    ok("fleet totals" in warnings, "messy: skipped totals row reported, not silent")

    # identity blanks on Mile/Load rows (merged cells) must still resolve
    brett_miles = result.daily[(result.daily["driver_name"] == "Brett")]["miles"]
    ok(brett_miles.notna().sum() == 7, "messy: miles parsed even when identity cells were blank")


def check_screenshot_workbook(tmp: Path) -> None:
    """The supplied screenshot: banner, unlabelled column D, fleet totals, rollup row,
    merged identity cells and statuses written in the Load # row."""
    path = tmp / "week42.xlsx"
    build_screenshot_workbook(path)
    result = parse_gross_board_workbook(path)

    ok(result.meta["header_row_excel"] == 2, "screenshot: header on Excel row 2")
    ok(result.meta["week_start"] == "2026-10-12" and result.meta["week_end"] == "2026-10-18",
       "screenshot: '12 October' style headers resolved to 2026 dates")
    ok(len(result.summary) == 5, "screenshot: five drivers (fleet total + rollup excluded)")
    ok(result.meta["fleet_totals_seen"]["total_revenue"] == 40825.0, "screenshot: fleet totals row captured")
    ok(any("comments not saved" in text.lower() for text in result.meta["instructions"]),
       "screenshot: banner instruction captured")
    ok(result.meta["comments_caveat"] is True, "screenshot: 'comments not saved in archive' flagged")
    ok(len(result.meta["rollup_rows"]) == 1 and result.meta["rollup_rows"][0]["name"] == "Brett",
       "screenshot: totals-only rollup recorded, not counted as a driver")

    dexter = result.summary[result.summary["driver_name"] == "DEXTER SISTRUNK"].iloc[0]
    ok(dexter["total_revenue_reported"] == 8200.0, "screenshot: DEXTER Total $ = 8,200")
    ok(dexter["total_miles_reported"] == 2171.0, "screenshot: DEXTER Total Mile = 2,171")
    ok(int(dexter["days_worked"]) == 6, "screenshot: DEXTER worked 6 days (HOME on 16 Oct)")

    sat = result.daily[(result.daily["driver_name"] == "DEXTER SISTRUNK") & (result.daily["date_iso"] == "2026-10-16")].iloc[0]
    ok(sat["status"] == "HOME" and sat["status_source"] == "load", "screenshot: status read from the Load # row")

    sanders = result.daily[result.daily["driver_name"] == "SANDERS ANTHONY"]
    ok(set(sanders["status"].dropna()) == {"HOME", "ENROUTE"}, "screenshot: multiple statuses per driver-day set")

    andre = result.summary[result.summary["driver_name"] == "ANDRE JUNIOR VALLON"].iloc[0]
    ok(andre["manager_comments"] == "-", "screenshot: manager comment '-' preserved")
    ok(andre["daily_revenue_sum"] == 9900.0, "screenshot: ANDRE daily rates reconcile with Total $")
    andre_rest = result.daily[(result.daily["driver_name"] == "ANDRE JUNIOR VALLON") & (result.daily["date_iso"] == "2026-10-15")].iloc[0]
    ok(andre_rest["status"] == "Wanted to rest", "screenshot: free-text day note kept as status text")

    gonzalez = result.summary[result.summary["driver_name"].str.startswith("GONZALEZ")].iloc[0]
    ok(int(gonzalez["days_worked"]) == 1, "screenshot: single-day block parsed")

    lewis = result.daily[result.daily["driver_name"] == "(CD) LEWIS THOMAS"]
    ok("OOS" in set(lewis["status"].dropna()), "screenshot: OOS day detected")
    ok(lewis[lewis["date_iso"] == "2026-10-13"]["status"].iloc[0] == "WAITED FOR CO-DRIVER",
       "screenshot: long note status preserved")


def check_custom_layout(tmp: Path) -> None:
    """Header on row 1, data on row 2, text + serial dates, merged identity, single-row driver."""
    path = tmp / "custom.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Custom"
    header = [
        "#",
        "Driver Name",
        "Truck #",
        "Row Sub-type",
        "10/12/2026",   # text date
        46309,          # Excel serial date (2026-10-14)
        "Total $",
        "Total Mile",
        "Per Mile",
        "Manager's Comments",
    ]
    for column, value in enumerate(header, start=1):
        sheet.cell(row=1, column=column, value=value)

    rows = [
        [7, "Sam", "T-9", "Rate", 900, "OOS", 900, 100, 9.0, "half week"],
        [None, None, None, "Mile", 120, 0, None, None, None, None],
        [None, None, None, "Load #", "L-1", None, None, None, None, None],
        # single-row driver: no sub-type label at all
        [8, "Nia", "T-4", None, 1500, 1600, 3100, 300, 10.3333, "single row layout"],
    ]
    for offset, values in enumerate(rows, start=2):
        for column, value in enumerate(values, start=1):
            sheet.cell(row=offset, column=column, value=value)
    workbook.save(path)

    result = parse_gross_board_workbook(path)
    ok(result.meta["header_row_excel"] == 1, "custom: header detected on row 1")
    ok(len(result.summary) == 2, "custom: single-row driver also captured")
    ok(result.meta["date_columns"][0]["date"] == "2026-10-12", "custom: text date header parsed")
    ok(result.meta["date_columns"][1]["date"] == "2026-10-14", "custom: Excel serial date header parsed")

    sam = result.summary[result.summary["driver_name"] == "Sam"].iloc[0]
    ok(int(sam["days_worked"]) == 1, "custom: OOS day not counted as worked")
    sam_days = result.daily[result.daily["driver_name"] == "Sam"]
    loads = list(sam_days["load_number"])
    ok(loads[0] == "L-1" and is_blank_value(loads[1]), "custom: load id kept, blank stays null")
    ok(sam_days["miles"].tolist()[0] == 120, "custom: merged-cell identity resolved for mile row")

    nia = result.summary[result.summary["driver_name"] == "Nia"].iloc[0]
    ok(nia["total_revenue_reported"] == 3100, "custom: totals on a single-row driver read correctly")


def check_frame_api_and_json(tmp: Path) -> None:
    path = tmp / "spec.xlsx"
    result = parse_gross_board_workbook(path)

    # explicit overrides still work
    forced = parse_gross_board_workbook(path, header_row=1, start_row=4)
    ok(len(forced.daily) == len(result.daily), "override: header_row/start_row reproduce the same result")

    payload = result.to_dict()
    text = json.dumps(payload, allow_nan=False)
    ok("NaN" not in text, "json: no NaN leaked into the payload")
    reparsed = json.loads(text)
    ok(len(reparsed["drivers"]) == 5, "json: nested drivers array exported")
    ok(len(reparsed["daily"]) == 35, "json: flat daily array exported")
    ok(len(reparsed["drivers"][0]["days"]) == 7, "json: each driver nests its 7 days")

    out = result.to_json(tmp / "board.json")
    ok(out.exists() and json.loads(out.read_text())["meta"]["drivers"] == 5, "json: written to disk")

    # A deliberately tricky frame: no header labels at all -> documented fallback.
    import pandas as pd

    frame = pd.DataFrame(
        [
            ["driver index", "driver name", "truck #", None, datetime(2026, 10, 12), datetime(2026, 10, 13)],
            [1, "Ava", "T-1", "Rate", 1000, 1100],
            [None, None, None, "Mile", 200, 220],
            [None, None, None, "Load #", "L-9", "L-10"],
        ]
    )
    parsed = parse_gross_board_frame(frame)
    ok(len(parsed.summary) == 1, "frame api: parses without a sub-type header label")
    ok(parsed.summary.iloc[0]["daily_revenue_sum"] == 2100, "frame api: daily revenue summed")


def main() -> int:
    check_unit_helpers()
    with tempfile.TemporaryDirectory() as directory:
        tmp = Path(directory)
        check_spec_workbook(tmp)
        check_messy_workbook(tmp)
        check_screenshot_workbook(tmp)
        check_custom_layout(tmp)
        check_frame_api_and_json(tmp)

    print(f"{len(PASSED)} checks passed\n")
    for message in PASSED:
        print(f"  ✓ {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
