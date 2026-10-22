#!/usr/bin/env python3
"""
Generate sample Gross Board workbooks so the parser can be tried immediately.

    python scripts/make_sample_gross_board.py --out samples/

Creates:
  * gross_board_spec.xlsx   — exactly the documented layout (header on Excel row 2,
                              data from Excel row 5, 3 rows per driver)
  * gross_board_messy.xlsx  — same idea but with the quirks real exports have:
                              banner rows, merged identity cells, a fleet totals row,
                              a driver missing the Load # row, statuses and gaps
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


HEADER = [
    "Driver Index",
    "Driver Name",
    "Truck #",
    "Row Sub-type",
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "Total $",
    "Total Mile",
    "Per Mile",
    "Manager's Comments",
]

DRIVERS = [
    {
        "index": 1,
        "name": "Brett",
        "truck": "T-12",
        "rate": [5200, 5600, 4800, 6100, 5900, 6200, 7025],
        "miles": [1180, 1240, 1105, 1320, 1280, 1330, 1515],
        "loads": ["L-88012", "L-88045", "L-88077", "L-88102", "L-88140", "L-88188", "L-88210"],
        "comments": "Solid week, no violations",
    },
    {
        "index": 2,
        "name": "Carlos",
        "truck": "T-07",
        "rate": [3900, 4200, "HOME", 4400, 4600, 4300, 4000],
        "miles": [980, 1015, 0, 1050, 1120, 1040, 995],
        "loads": ["L-88013", "L-88050", None, "L-88110", "L-88152", "L-88190", "L-88212"],
        "comments": "Home Wednesday",
    },
    {
        "index": 3,
        "name": "Dwayne",
        "truck": "T-21",
        "rate": ["ENROUTE", 5100, 5250, "OOS", 0, 6100, 6400],
        "miles": [420, 1260, 1300, 0, 0, 1480, 1520],
        "loads": [None, "L-88060", "L-88081", None, None, "L-88201", "L-88225"],
        "comments": "OOS Thu-Fri, DOT inspection",
    },
    {
        "index": 4,
        "name": "Maria",
        "truck": "T-33",
        "rate": [6200, 6350, 6100, 6500, 6700, 6800, 6900],
        "miles": [1440, 1470, 1410, 1500, 1540, 1560, 1580],
        "loads": ["L-88020", "L-88055", "L-88090", "L-88118", "L-88160", "L-88205", "L-88230"],
        "comments": None,
    },
    {
        "index": 5,
        "name": "Tyrone",
        "truck": "T-44",
        "rate": [4100, 4300, 4250, 4400, 4550, 4600, 4700],
        "miles": [1010, 1055, 1040, 1080, 1110, 1125, 1150],
        "loads": ["L-88031", "L-88066", "L-88095", "L-88125", "L-88170", "L-88215", "L-88240"],
        "comments": "New hire, ride-along Monday",
    },
]


def total(values: list[object]) -> float:
    return round(sum(value for value in values if isinstance(value, (int, float))), 2)


def safe_rpm(revenue: float, miles: float) -> float:
    return round(revenue / miles, 6) if miles else 0


def style_sheet(sheet) -> None:
    header_fill = PatternFill("solid", fgColor="12564A")
    for cell in sheet[2]:
        if cell.value is not None:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
    widths = {1: 8, 2: 16, 3: 10, 4: 10, 12: 12, 13: 12, 14: 11, 15: 34}
    for index in range(1, 16):
        sheet.column_dimensions[get_column_letter(index)].width = widths.get(index, 13)
    sheet.freeze_panes = "E3"


def write_driver_block(sheet, row: int, driver: dict, *, identity_on_every_row: bool = True) -> int:
    """Write Rate/Mile/Load # for one driver starting at ``row``. Returns rows used."""
    revenue = total(driver["rate"])
    miles = total(driver["miles"])
    rpm = safe_rpm(revenue, miles)
    index = driver["index"]

    rate_row = [index, driver["name"], driver["truck"], "Rate", *driver["rate"], revenue, miles, rpm, driver["comments"]]
    mile_row = [None, None, None, "Mile", *driver["miles"], None, None, None, None]
    load_row = [None, None, None, "Load #", *driver["loads"], None, None, None, None]

    if identity_on_every_row:
        for offset in (1, 2):
            mile_row[0] = index
            load_row[0] = index
            mile_row[1] = driver["name"]
            load_row[1] = driver["name"]
            mile_row[2] = driver["truck"]
            load_row[2] = driver["truck"]

    for offset, values in enumerate((rate_row, mile_row, load_row)):
        for column, value in enumerate(values, start=1):
            sheet.cell(row=row + offset, column=column, value=value)
    return 3


def build_spec_workbook(path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"

    # Excel row 1: intentionally empty (index 0)
    for column, value in enumerate(HEADER, start=1):
        sheet.cell(row=2, column=column, value=value)
    # Excel rows 3-4 (index 2-3) stay blank, so data begins on Excel row 5 (index 4)
    row = 5
    for driver in DRIVERS:
        row += write_driver_block(sheet, row, driver, identity_on_every_row=True)
    style_sheet(sheet)
    workbook.save(path)


def build_messy_workbook(path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Gross Board"

    # banner rows above the header
    sheet["A1"] = "See Gross Archive"
    sheet["B1"] = "Dont use comments. Use notes."
    sheet["A2"] = "Weekly gross board — week of 2026-10-12"

    for column, value in enumerate(HEADER, start=1):
        sheet.cell(row=3, column=column, value=value)

    # unlabelled fleet totals row right under the header
    fleet_revenue = sum(total(driver["rate"]) for driver in DRIVERS)
    fleet_miles = sum(total(driver["miles"]) for driver in DRIVERS)
    for column, value in enumerate(
        [None, None, None, None, None, None, None, None, None, None, None, fleet_revenue, fleet_miles, safe_rpm(fleet_revenue, fleet_miles), None],
        start=1,
    ):
        sheet.cell(row=4, column=column, value=value)

    row = 5
    for order, driver in enumerate(DRIVERS):
        if driver["name"] == "Tyrone":
            # a driver whose Load # row is missing entirely
            revenue = total(driver["rate"])
            miles = total(driver["miles"])
            rate_row = [driver["index"], driver["name"], driver["truck"], "Rate", *driver["rate"], revenue, miles, safe_rpm(revenue, miles), driver["comments"]]
            mile_row = [None, None, None, "Mile", *driver["miles"], None, None, None, None]
            for offset, values in ((0, rate_row), (1, mile_row)):
                for column, value in enumerate(values, start=1):
                    sheet.cell(row=row + offset, column=column, value=value)
            row += 2
            continue

        if driver["name"] == "Maria":
            # deliberately wrong Total $ so the reconciliation warning fires
            revenue = total(driver["rate"])
            miles = total(driver["miles"])
            rate_row = [driver["index"], driver["name"], driver["truck"], "Rate", *driver["rate"], revenue - 250, miles, safe_rpm(revenue, miles), "Total was edited by hand"]
            mile_row = [None, None, None, "Mile", *driver["miles"], None, None, None, None]
            load_row = [None, None, None, "Load #", *driver["loads"], None, None, None, None]
            for offset, values in ((0, rate_row), (1, mile_row), (2, load_row)):
                for column, value in enumerate(values, start=1):
                    sheet.cell(row=row + offset, column=column, value=value)
            row += 3
            continue

        row += write_driver_block(sheet, row, driver, identity_on_every_row=(order % 2 == 0))

    sheet.cell(row=row + 1, column=1, value="Prepared by dispatch · questions to ops@example.com")
    style_sheet(sheet)
    workbook.save(path)


SCREENSHOT_HEADER = [
    None,
    "Driver Name",
    "Truck #",
    None,  # column D is intentionally unlabelled in the real sheet
    "12 October",
    "13 October",
    "14 October",
    "15 October",
    "16 October",
    "17 October",
    "18 October",
    "Total $",
    "Total Mile",
    "Per Mile",
    "Manager's Comments",
]

# Rate / Mile / Load # per driver, exactly as in the supplied screenshot.
# "—" means the cell is empty; statuses appear in whichever sub-row the board used.
SCREENSHOT_BLOCKS = [
    {
        "index": 1, "name": "DEXTER SISTRUNK", "truck": "# 105829",
        "rate": ["$1,600", "$1,800", "$1,350", "$950", "—", "$1,300", "$1,200"],
        "mile": [427, 450, 228, 329, "—", 395, 342],
        "load": ["1762990", "0247304", "9821299", "9490029", "HOME", "0248466", "0248482"],
        "total": "$8,200", "miles": "2,171", "rpm": "$3.78", "comments": None,
    },
    {
        "index": 2, "name": "SANDERS ANTHONY", "truck": "# 4260",
        "rate": ["—", "$3,750", "—", "$2,400", "—", "$4,350", "—"],
        "mile": ["—", 1077, "—", 814, "—", 1709, "—"],
        "load": ["HOME", "1160719", "ENROUTE", "11308", "69576974", "—", "ENROUTE"],
        "total": "$10,500", "miles": "3,600", "rpm": "$2.92", "comments": None,
    },
    {
        "index": 3, "name": "ANDRE JUNIOR VALLON", "truck": "# 9908",
        "rate": ["ENROUTE", "$1,800", "$2,600", "Wanted to rest", 5500, "—", "—"],
        "mile": ["—", 697, 1180, 2083, "—", "—", "—"],
        "load": ["—", "LD73674", "9782283", "1756346", "—", "—", "ENROUTE"],
        "total": "$9,900", "miles": "3,960", "rpm": "$2.50", "comments": "-",
    },
    {
        "index": 4, "name": "GONZALEZ BRYANT & RODRIGUEZ TAMARA", "truck": "# 102",
        "rate": ["$4,500", "—", "—", "—", "—", "—", "—"],
        "mile": [1235, "—", "—", "—", "—", "—", "—"],
        "load": ["830523", "ENROUTE", "HOME", "—", "—", "—", "—"],
        "total": "$4,500", "miles": "1,235", "rpm": "$3.64", "comments": None,
    },
    {
        "index": 5, "name": "(CD) LEWIS THOMAS", "truck": "# 249",
        "rate": ["$1,025", "—", "$2,700", "—", "$4,000", "—", "—"],
        "mile": [410, "—", 913, "—", 1309, "—", "—"],
        "load": ["5451683", "WAITED FOR CO-DRIVER", "1160707", "OOS", "1400461", "—", "ENROUTE"],
        "total": "$7,725", "miles": "2,632", "rpm": "$2.94", "comments": None,
    },
]


def build_screenshot_workbook(path: Path) -> None:
    """The exact shape from the supplied screenshot: banner, unlabelled col D,
    fleet totals row, a totals-only rollup, merged identity cells, statuses in
    the Load # row."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"

    sheet["A1"] = None
    sheet["B1"] = "See Gross Archive"
    sheet["C1"] = "Dont use comments. Use notes. comments not saved in archive"

    for column, value in enumerate(SCREENSHOT_HEADER, start=1):
        sheet.cell(row=2, column=column, value=value)

    # fleet totals row (no driver name)
    sheet.cell(row=3, column=12, value="$40,825")
    sheet.cell(row=3, column=13, value="13,598")
    sheet.cell(row=3, column=14, value="$3.00")
    # totals-only rollup row
    sheet.cell(row=4, column=2, value="Brett")
    sheet.cell(row=4, column=12, value="$40,825")
    sheet.cell(row=4, column=13, value="13,598")
    sheet.cell(row=4, column=14, value="$3.00")

    row = 5
    for block in SCREENSHOT_BLOCKS:
        is_last = block is SCREENSHOT_BLOCKS[-1]
        values = {
            "Rate": block["rate"],
            "Mile": block["mile"],
            "Load #": block["load"],
        }
        for offset, (subtype, days) in enumerate(values.items()):
            current = row + offset
            if offset == 0:  # identity only on the Rate row; merged cells export blank
                sheet.cell(row=current, column=1, value=block["index"])
                sheet.cell(row=current, column=2, value=block["name"])
                sheet.cell(row=current, column=3, value=block["truck"])
            sheet.cell(row=current, column=4, value=subtype)
            for index, value in enumerate(days):
                if value != "—":
                    sheet.cell(row=current, column=5 + index, value=value)
        totals_row = row + (2 if is_last else 2)
        sheet.cell(row=totals_row, column=12, value=block["total"])
        sheet.cell(row=totals_row, column=13, value=block["miles"])
        sheet.cell(row=totals_row, column=14, value=block["rpm"])
        if block["comments"]:
            sheet.cell(row=totals_row, column=15, value=block["comments"])
        row += 3

    for index in range(1, 16):
        sheet.column_dimensions[get_column_letter(index)].width = 22 if index == 2 else 13
    sheet.freeze_panes = "E3"
    workbook.save(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create sample Gross Board workbooks.")
    parser.add_argument("--out", default="samples", help="Output directory (default: samples).")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    spec_path = out_dir / "gross_board_spec.xlsx"
    messy_path = out_dir / "gross_board_messy.xlsx"
    screenshot_path = out_dir / "gross_board_week42.xlsx"
    build_spec_workbook(spec_path)
    build_messy_workbook(messy_path)
    build_screenshot_workbook(screenshot_path)
    print(f"Wrote {spec_path}")
    print(f"Wrote {messy_path}")
    print(f"Wrote {screenshot_path}")
    print(f"Drivers per file: {len(DRIVERS)} · week of {date(2026, 10, 12).isoformat()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
