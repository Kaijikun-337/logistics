#!/usr/bin/env python3
"""
parse_gross_board.py
====================

Parse a trucking "Gross Board" workbook into tidy tabular data.

The sheet is organised as **three consecutive rows per driver**:

    Excel row 2 (index 1)   header row
      A Driver Index | B Driver Name | C Truck # | D Row Sub-type
      E..K dates | L Total $ | M Total Mile | N Per Mile | O Manager's Comments

    then, for every driver:

      D = "Rate"     daily revenue (numeric) *or* a status ("HOME", "ENROUTE", "OOS", ...)
      D = "Mile"     miles driven per date
      D = "Load #"   load / tracking id per date

This module turns that layout into two DataFrames:

* ``daily``   — one row per (driver, date): rate_or_status, rate_numeric, status,
                miles, load_number (+ driver identity and provenance columns)
* ``summary`` — one row per driver: reported Total $ / Total Mile / Per Mile /
                comments, plus derived fields (days worked, gross per day worked,
                recomputed RPM, reconciliation checks)

Design notes
------------
* ``pd.read_excel(path, header=None)`` is used on purpose: the header is not on
  row 0, so we locate and interpret it ourselves.
* Nothing is silently dropped. Rows that are not driver data (title banners,
  fleet totals, notes) are skipped *and reported*, and every driver whose daily
  numbers do not reconcile with the reported totals gets a warning.
* The block layout is detected, not assumed:
    - the sub-type column may say Rate / Miles / Mileage / Load / Load # / Load Id
    - identity cells are allowed to be blank on the Mile and Load rows
      (merged cells export as blanks)
    - drivers missing a Load # row, or with sub-rows out of order, still parse
    - a driver with only a single row (no sub-types) is treated as rate-only

Usage
-----
    python scripts/parse_gross_board.py workbook.xlsx
    python scripts/parse_gross_board.py workbook.xlsx --sheet "Week 42" --out out/
    python scripts/parse_gross_board.py workbook.xlsx --json out/board.json --quiet

Programmatic use
----------------
    from parse_gross_board import parse_gross_board, parse_gross_board_workbook

    daily_df, summary_df = parse_gross_board("board.xlsx")
    result = parse_gross_board_workbook("board.xlsx")   # + warnings / meta / rows

Requires: pandas, openpyxl
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Sequence

import pandas as pd

__all__ = [
    "GrossBoard",
    "parse_gross_board",
    "parse_gross_board_workbook",
    "parse_gross_board_frame",
    "to_number",
]

# --------------------------------------------------------------------------- #
# Vocabulary
# --------------------------------------------------------------------------- #

#: Sub-type spellings seen in the wild -> canonical sub-type.
SUBTYPE_ALIASES: dict[str, str] = {
    "rate": "rate",
    "rate $": "rate",
    "rates": "rate",
    "revenue": "rate",
    "gross": "rate",
    "gross $": "rate",
    "income": "rate",
    "mile": "mile",
    "miles": "mile",
    "mileage": "mile",
    "mi": "mile",
    "load": "load",
    "loads": "load",
    "load #": "load",
    "load#": "load",
    "load no": "load",
    "load number": "load",
    "load id": "load",
    "load num": "load",
    "trip": "load",
    "trip #": "load",
    "pro": "load",
    "pro #": "load",
    "bol": "load",
}

#: Header spellings -> internal column roles.
LABEL_ALIASES: dict[str, set[str]] = {
    "index": {"driver index", "driver idx", "driver id", "driver #", "driver no", "driver number", "idx", "id", "#"},
    "name": {"driver name", "driver", "name", "drivers"},
    "truck": {"truck #", "truck", "truck no", "truck number", "unit", "unit #", "unit no", "tractor", "tractor #"},
    "subtype": {"row sub-type", "row subtype", "sub-type", "subtype", "row type", "type", "metric", "row label"},
    "total_revenue": {"total $", "total", "total revenue", "total gross", "gross total", "weekly total", "revenue total"},
    "total_miles": {"total mile", "total miles", "total mileage", "miles total", "weekly miles"},
    "rpm": {"per mile", "rate per mile", "revenue per mile", "rpm", "cpm", "$/mile", "per mi", "avg per mile"},
    "comments": {"manager's comments", "managers comments", "manager comments", "comments", "comment", "notes", "note", "remarks", "remark"},
}

#: Known non-numeric day markers. Any short alpha string is also kept as a status.
KNOWN_STATUSES = {
    "HOME",
    "ENROUTE",
    "EN ROUTE",
    "OOS",
    "OFF",
    "VAC",
    "VACATION",
    "SHOP",
    "SICK",
    "LAYOVER",
    "RESET",
    "HOMETIME",
    "HOME TIME",
    "NO LOAD",
    "TRAINING",
    "INJURED",
    "BREAKDOWN",
    "HOLIDAY",
    "PTO",
    "HIRED",
    "QUIT",
    "TERMINATED",
    "START",
    "DISPATCH",
    "EMPTY",
    "DEADHEAD",
    "DH",
    "WAIT",
    "WAITING",
    "RAIN",
    "SNOW",
    "WEATHER",
    "TRAFFIC",
    "DOT",
    "REPAIR",
}

_TOTAL_ROW_PATTERN = re.compile(
    r"^(grand\s+total|sub\s*-?\s*total|total|totals|sum|summary|fleet\s+total|report\s+total)\b",
    re.IGNORECASE,
)
_APOSTROPHES = str.maketrans({"\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"'})

#: Fallback positions, straight from the sheet specification.
SPEC_POSITIONS = {
    "index": 0,
    "name": 1,
    "truck": 2,
    "subtype": 3,
    "total_revenue": 11,
    "total_miles": 12,
    "rpm": 13,
    "comments": 14,
}
SPEC_DATE_POSITIONS = list(range(4, 11))

RECON_TOLERANCE = 0.02  # dollars; avoids float dust from Excel


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def normalize_label(value: Any) -> str:
    """Lower-case, collapse whitespace, drop trailing colons — for header matching."""
    if is_blank(value):
        return ""
    text = str(value).translate(_APOSTROPHES).replace("\u00a0", " ").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text.rstrip(":")


def is_blank(value: Any) -> bool:
    """True for None, NaN, pd.NA, empty/whitespace strings and the string 'nan'."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    try:  # pd.NA / NaT
        if pd.isna(value):
            return True
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text == "" or text.lower() in {"nan", "nat", "none", "null", "#n/a", "n/a"}


def to_number(value: Any) -> float | None:
    """Parse "$1,234.50", "(120)", "3.00" / 1234.5 into a float, else None."""
    if is_blank(value):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return None if math.isnan(number) or math.isinf(number) else number
    text = str(value).strip()
    negative = text.startswith("(") and text.endswith(")")
    cleaned = re.sub(r"[^0-9.\-]", "", text.replace(",", ""))
    if cleaned in {"", "-", ".", "-."}:
        return None
    try:
        number = float(cleaned)
    except ValueError:
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return -abs(number) if negative else number


def coerce_identifier(value: Any) -> Any:
    """1.0 -> 1, 'T-12' -> 'T-12', NaN -> None. Keeps the sheet's own taste."""
    if is_blank(value):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return int(number) if number.is_integer() else number
    text = str(value).strip()
    number = to_number(text)
    if number is not None and re.fullmatch(r"-?\d+(\.0+)?", text):
        return int(number) if float(number).is_integer() else number
    return text


def clean_text(value: Any) -> str | None:
    if is_blank(value):
        return None
    return re.sub(r"\s+", " ", str(value).translate(_APOSTROPHES)).strip()


def clean_load(value: Any) -> str | None:
    """Load ids are identifiers, not numbers: 12345.0 -> '12345'."""
    if is_blank(value):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return str(int(number)) if number.is_integer() else str(number)
    return clean_text(value)


def excel_serial_to_date(serial: float) -> date | None:
    if not (20000 <= serial <= 80000):  # ~1954 .. ~2119
        return None
    try:
        return (datetime(1899, 12, 30) + timedelta(days=float(serial))).date()
    except (OverflowError, ValueError):
        return None


_MONTH_WORDS = {
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
}


def parse_header_date(value: Any, reference_year: int | None = None) -> date | None:
    """Dates in the header may be real dates, Excel serials or text."""
    if is_blank(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return excel_serial_to_date(float(value))
    text = str(value).strip()
    if not text:
        return None
    serial_guess = to_number(text)
    if serial_guess is not None and re.fullmatch(r"\d{5}(\.0+)?", text):
        from_serial = excel_serial_to_date(serial_guess)
        if from_serial is not None:
            return from_serial
    # "12 October", "Mon 12 Oct", "12/10" — no year, so borrow a reference year.
    has_year = bool(re.search(r"\b(19|20)\d{2}\b", text))
    words = set(re.findall(r"[a-z]+", text.lower()))
    if not has_year and (words & _MONTH_WORDS):
        day_match = re.search(r"\b(\d{1,2})\b", text)
        month_index = next(
            (i + 1 for i, name in enumerate(
                ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            ) if any(word.startswith(name) for word in words)),
            None,
        )
        if day_match and month_index:
            year = reference_year or date.today().year
            try:
                return date(year, month_index, int(day_match.group(1)))
            except ValueError:
                return None

    parsed = pd.to_datetime(text, errors="coerce", dayfirst=False)
    if isinstance(parsed, pd.Timestamp) and not pd.isna(parsed) and parsed.year >= 1990:
        return parsed.date()
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if isinstance(parsed, pd.Timestamp) and not pd.isna(parsed) and parsed.year >= 1990:
        return parsed.date()
    return None


def classify_day_value(value: Any) -> tuple[str | None, float | None, str | None]:
    """
    Split a daily rate cell into (raw_text, numeric_value, status_text).

    "842.50" -> ("842.50", 842.5, None)
    "HOME"   -> ("HOME", None, "HOME")
    "OOS - DOT" -> ("OOS - DOT", None, "OOS - DOT")
    """
    if is_blank(value):
        return None, None, None
    raw = clean_text(value)
    if raw is None:
        return None, None, None
    number = to_number(value)
    if number is not None and re.fullmatch(r"[\s$(\-0-9.,]+\)?", str(value).translate(_APOSTROPHES).strip()):
        return raw, number, None
    upper = raw.upper()
    if upper in KNOWN_STATUSES:
        return raw, None, upper
    if len(raw) <= 28 and re.fullmatch(r"[A-Za-z][A-Za-z .#'/&\-]*", raw):
        # Unknown words stay as written; known markers are upper-cased later.
        return raw, None, raw
    return raw, None, raw


_LOAD_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-_/#.]{2,23}$")


def classify_load_cell(value: Any) -> tuple[str | None, str | None]:
    """
    A Load # cell normally holds an id, but the grid also uses it for day markers
    (HOME / ENROUTE / OOS / "WAITED FOR CO-DRIVER"). Return (load_id, status).

    Rule of thumb: identifiers contain a digit and no spaces; words and sentences
    are status/notes.
    """
    if is_blank(value):
        return None, None
    raw = clean_text(value)
    if raw is None:
        return None, None
    upper = raw.upper()
    looks_like_id = bool(re.search(r"\d", raw)) and not re.search(r"\s", raw) and bool(_LOAD_ID_PATTERN.match(raw))
    if looks_like_id:
        return clean_load(value), None
    if upper in KNOWN_STATUSES:
        return None, upper
    # "LD73674" style codes with digits were caught above; anything else is a note.
    return None, raw


def normalize_status_text(value: str) -> str:
    return value.upper() if value.upper() in KNOWN_STATUSES else value


def day_name(value: date | None) -> str | None:
    return value.strftime("%a") if value else None


# --------------------------------------------------------------------------- #
# Result container
# --------------------------------------------------------------------------- #

@dataclass
class GrossBoard:
    """Everything the parser found, plus the warnings it wants you to read."""

    daily: pd.DataFrame
    summary: pd.DataFrame
    warnings: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def drivers(self) -> list[dict[str, Any]]:
        """Driver-centric JSON-friendly view, with their daily rows nested."""
        records: list[dict[str, Any]] = []
        if self.summary.empty:
            return records
        daily_by_driver = {
            key: _records(group)
            for key, group in self.daily.groupby("driver_key", dropna=False, sort=False)
        }
        for row in _records(self.summary):
            record = dict(row)
            record["days"] = daily_by_driver.get(row.get("driver_key"), [])
            records.append(record)
        return records

    def to_dict(self) -> dict[str, Any]:
        """JSON-friendly payload: meta, warnings, summary, daily, drivers."""
        return {
            "meta": self.meta,
            "warnings": self.warnings,
            "drivers": self.drivers,
            "summary": _records(self.summary),
            "daily": _records(self.daily),
        }

    def to_json(self, path: str | Path, *, indent: int = 2) -> Path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            self.to_dict(), indent=indent, default=_json_default, ensure_ascii=False, allow_nan=False
        )
        target.write_text(payload, encoding="utf-8")
        return target

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return (
            f"GrossBoard(drivers={len(self.summary)}, daily_rows={len(self.daily)}, "
            f"warnings={len(self.warnings)})"
        )


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """
    DataFrame -> JSON-safe records (NaN/NaT/NA become null, dates become ISO).

    Built row-by-row from Python scalars on purpose: pandas 3's string dtype
    maps ``None`` back to ``NaN``, which is not valid JSON.
    """
    if frame is None or frame.empty:
        return []
    columns = list(frame.columns)
    return [
        {column: _json_scalar(value) for column, value in zip(columns, row)}
        for row in frame.itertuples(index=False, name=None)
    ]


def _json_scalar(value: Any) -> Any:
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        try:
            return _json_scalar(value.item())
        except (ValueError, AttributeError):  # pragma: no cover - exotic dtypes
            return str(value)
    return value


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (set, tuple)):
        return list(value)
    if isinstance(value, float) and math.isnan(value):
        return None
    return str(value)


# --------------------------------------------------------------------------- #
# Header discovery
# --------------------------------------------------------------------------- #

def _score_header_row(row: Sequence[Any]) -> int:
    labels = [normalize_label(cell) for cell in row]
    if not any(labels):
        return 0
    score = 0
    if any(label in LABEL_ALIASES["name"] for label in labels):
        score += 4
    if any(label in LABEL_ALIASES["subtype"] for label in labels):
        score += 2
    if any(label in LABEL_ALIASES["total_revenue"] for label in labels):
        score += 2
    if any(label in LABEL_ALIASES["rpm"] for label in labels):
        score += 1
    if any(label.startswith("total mile") for label in labels):
        score += 1
    date_hits = sum(1 for cell in row if parse_header_date(cell) is not None)
    score += min(date_hits, 7)
    return score


def find_header_row(frame: pd.DataFrame, search_rows: int = 20) -> int | None:
    """Locate the header row anywhere in the first ``search_rows`` rows."""
    best_index: int | None = None
    best_score = 0
    for index in range(min(search_rows, len(frame))):
        score = _score_header_row(frame.iloc[index].tolist())
        if score > best_score:
            best_score = score
            best_index = index
    # A plausible header needs a driver label plus something else (dates/totals).
    return best_index if best_score >= 4 else None


def resolve_columns(header: Sequence[Any]) -> tuple[dict[str, int], list[int], list[str | None]]:
    """Map roles to column positions; return (roles, date_columns, date_labels)."""
    labels = [normalize_label(cell) for cell in header]
    roles: dict[str, int] = {}

    for role, aliases in LABEL_ALIASES.items():
        for column, label in enumerate(labels):
            if label and label in aliases:
                roles[role] = column
                break

    # Softer passes for the important roles.
    def find(predicate) -> int | None:
        for column, label in enumerate(labels):
            if label and predicate(label):
                return column
        return None

    roles.setdefault("name", find(lambda label: "driver" in label and "name" in label) or None)  # type: ignore[arg-type]
    roles.setdefault("truck", find(lambda label: "truck" in label))  # type: ignore[arg-type]
    roles.setdefault("subtype", find(lambda label: "sub" in label and "type" in label))  # type: ignore[arg-type]
    roles.setdefault("total_revenue", find(lambda label: "total" in label and ("$" in label or "revenue" in label)))  # type: ignore[arg-type]
    roles.setdefault("total_miles", find(lambda label: "total" in label and "mile" in label))  # type: ignore[arg-type]
    roles.setdefault("rpm", find(lambda label: ("per mile" in label) or label in {"rpm", "cpm"}))  # type: ignore[arg-type]
    roles.setdefault("comments", find(lambda label: "comment" in label or "remark" in label or label == "notes"))  # type: ignore[arg-type]
    roles.setdefault("index", find(lambda label: label in {"#", "id", "idx"} or "driver index" in label))  # type: ignore[arg-type]
    roles = {role: column for role, column in roles.items() if isinstance(column, int)}

    subtype_col = roles.get("subtype")
    tail_cols = [roles[key] for key in ("total_revenue", "total_miles", "rpm", "comments") if key in roles]
    first_tail = min(tail_cols) if tail_cols else len(header)

    date_columns: list[int] = []
    date_labels: list[str | None] = []

    for column, cell in enumerate(header):
        if subtype_col is not None and column <= subtype_col:
            continue
        if column in tail_cols:
            continue
        if column >= first_tail and tail_cols:
            continue
        date_columns.append(column)
        date_labels.append(clean_text(cell) if not is_blank(cell) else None)

    if not date_columns:  # fall back to the documented E..K block
        date_columns = [c for c in SPEC_DATE_POSITIONS if c < len(header)]
        date_labels = [clean_text(header[c]) if c < len(header) else None for c in date_columns]

    return roles, date_columns, date_labels


# --------------------------------------------------------------------------- #
# Core parser
# --------------------------------------------------------------------------- #

def _apply_spec_defaults(roles: dict[str, int], warnings: list[str]) -> dict[str, int]:
    """Fill missing roles from the documented positions."""
    resolved = dict(roles)
    for role, position in SPEC_POSITIONS.items():
        if role not in resolved:
            resolved[role] = position
            warnings.append(
                f"Column for '{role}' was not labelled in the header; using documented position "
                f"{_column_letter(position)}."
            )
    return resolved


def _column_letter(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters or "?"


def parse_gross_board_frame(
    frame: pd.DataFrame,
    *,
    source: str = "<dataframe>",
    sheet_name: str | None = None,
    header_row: int | None = None,
    start_row: int | None = None,
) -> GrossBoard:
    """
    Parse an already-loaded (header=None) DataFrame.

    ``header_row`` / ``start_row`` are 0-based *iloc* positions and override
    detection when the sheet has an unusual preamble.
    """
    warnings: list[str] = []
    frame = frame.reset_index(drop=True).where(pd.notna(frame), None)

    if frame.empty:
        return GrossBoard(pd.DataFrame(), pd.DataFrame(), ["Workbook sheet is empty."], {"source": source})

    detected_header = header_row if header_row is not None else find_header_row(frame)
    using_spec_layout = detected_header is None
    if detected_header is None:
        detected_header = 1  # documented: Excel row 2
        warnings.append(
            "No recognisable header row found; falling back to the documented layout "
            "(header on Excel row 2, data from Excel row 5)."
        )
    if not 0 <= detected_header < len(frame):
        raise ValueError(f"header_row {detected_header} is outside the sheet (0..{len(frame) - 1}).")

    header = frame.iloc[detected_header].tolist()
    roles, date_columns, date_labels = resolve_columns(header)
    # A detected header may still be missing labels (e.g. column D named "Rate"
    # instead of "Row Sub-type"), so fill the gaps from the documented positions.
    missing_roles = [role for role in ("name", "subtype") if role not in roles]
    if missing_roles or using_spec_layout:
        roles = _apply_spec_defaults(roles, warnings)

    if frame.shape[1] < 4:
        raise ValueError(
            f"Sheet has only {frame.shape[1]} column(s); a Gross Board needs at least 4. "
            "Check that the file is a Gross Board and not a different report."
        )
    if "name" not in roles:
        raise ValueError("Could not find the Driver Name column. Pass --header-row to point at the header.")

    data_start = start_row if start_row is not None else detected_header + 1
    if start_row is None:
        # Skip blank spacer rows directly under the header (the spec has two).
        while data_start < len(frame) and all(
            is_blank(cell) for cell in frame.iloc[data_start].tolist()
        ):
            data_start += 1

    # Roles are now final: drop any date candidate that is actually a role column
    # (this matters when the header omitted the sub-type label).
    role_columns = set(roles.values())
    subtype_position = roles.get("subtype", -1)
    pruned = [
        (column, label)
        for column, label in zip(date_columns, date_labels)
        if column not in role_columns and column > subtype_position
    ]
    if not pruned:
        pruned = [
            (column, clean_text(header[column]) if column < len(header) else None)
            for column in SPEC_DATE_POSITIONS
            if column < frame.shape[1] and column not in role_columns and column > subtype_position
        ]
    date_columns = [column for column, _ in pruned]
    date_labels = [label for _, label in pruned]
    if not date_columns:
        warnings.append("No date columns could be identified; driver-days will have no dates.")

    explicit_years = [
        int(match.group(0))
        for cell in (header[column] if column < len(header) else None for column in date_columns)
        for match in [re.search(r"\b(19|20)\d{2}\b", str(cell or ""))]
        if match
    ]
    reference_year = max(set(explicit_years), key=explicit_years.count) if explicit_years else date.today().year

    resolved_dates: list[date | None] = []
    for column, label in zip(date_columns, date_labels):
        cell = header[column] if column < len(header) else None
        parsed = parse_header_date(cell, reference_year)
        if parsed is None and label:
            warnings.append(f"Header '{label}' in column {_column_letter(column)} is not a date; kept as a label.")
        resolved_dates.append(parsed)

    week_dates = [value for value in resolved_dates if value is not None]
    week_start = min(week_dates) if week_dates else None
    week_end = max(week_dates) if week_dates else None

    name_col = roles["name"]
    subtype_col = roles["subtype"]
    index_col = roles.get("index")
    truck_col = roles.get("truck")
    total_col = roles.get("total_revenue")
    miles_col = roles.get("total_miles")
    rpm_col = roles.get("rpm")
    comments_col = roles.get("comments")

    drivers: list[dict[str, Any]] = []
    skipped: list[str] = []
    fleet_totals: dict[str, Any] | None = None
    rollups: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    current_subtype: str | None = None

    def row_cell(row: Sequence[Any], column: int | None) -> Any:
        if column is None or column < 0 or column >= len(row):
            return None
        return row[column]

    for position in range(data_start, len(frame)):
        row = frame.iloc[position].tolist()
        raw_subtype = clean_text(row_cell(row, subtype_col))
        subtype = SUBTYPE_ALIASES.get(normalize_label(raw_subtype)) if raw_subtype else None

        name = clean_text(row_cell(row, name_col))
        index_value = coerce_identifier(row_cell(row, index_col)) if index_col is not None else None
        truck = coerce_identifier(row_cell(row, truck_col)) if truck_col is not None else None
        day_values = [row_cell(row, column) for column in date_columns]
        has_day_data = any(not is_blank(value) for value in day_values)
        tail = {
            "total_revenue": to_number(row_cell(row, total_col)) if total_col is not None else None,
            "total_miles": to_number(row_cell(row, miles_col)) if miles_col is not None else None,
            "reported_rpm": to_number(row_cell(row, rpm_col)) if rpm_col is not None else None,
            "comments": clean_text(row_cell(row, comments_col)) if comments_col is not None else None,
        }
        has_tail_numbers = any(tail[key] is not None for key in ("total_revenue", "total_miles", "reported_rpm"))

        # 1) A driver row without sub-types (single-row layout).
        if subtype is None and (name or index_value) and has_day_data:
            if name and _TOTAL_ROW_PATTERN.match(name):
                skipped.append(f"row {position + 1}: totals row '{name}'")
                continue
            subtype = "rate"
            warnings.append(
                f"row {position + 1}: no sub-type label; treated '{name or index_value}' as a single-row (rate-only) entry."
            )

        # 1b) A named rollup row: totals only, no daily cells (typically a
        # leftover of the fleet total). Not a driver block.
        if subtype is None and name and not has_day_data and has_tail_numbers:
            rollups.append({"name": name, "row": position + 1, **tail})
            skipped.append(f"row {position + 1}: totals-only rollup '{name}' (not counted as a driver)")
            continue

        # 2) Notes / banner / footer rows.
        if subtype is None:
            no_day_data = not has_day_data
            if not name and no_day_data and has_tail_numbers:
                fleet_totals = {**tail, "row": position + 1}
                skipped.append(f"row {position + 1}: unlabelled fleet totals (kept in meta, not counted as a driver)")
            elif not name and no_day_data and not has_tail_numbers:
                continue  # blank spacer
            else:
                skipped.append(f"row {position + 1}: {raw_subtype or name or 'unrecognised row'}")
            continue

        # 3) Start / continue a driver block.
        if subtype == "rate" or current is None:
            if subtype != "rate" and current is None:
                warnings.append(
                    f"row {position + 1}: '{raw_subtype}' appeared before any Rate row; "
                    "started a block from this row."
                )
            current = {
                "driver_index": index_value,
                "driver_name": name,
                "truck_number": truck,
                "source_rows": [position + 1],
                "days": {label or _column_letter(column): {"date": resolved_dates[i], "label": label or _column_letter(column)}
                         for i, (column, label) in enumerate(zip(date_columns, date_labels))},
                "reported": {"total_revenue": None, "total_miles": None, "reported_rpm": None, "comments": None},
                "subrow_values": {},
                "subtypes": [],
            }
            drivers.append(current)
        else:
            current["source_rows"].append(position + 1)

        current_subtype = subtype
        current["subtypes"].append(subtype)

        # Identity can be blank on the Mile/Load rows (merged cells) — fill, never overwrite.
        if current["driver_name"] is None and name:
            current["driver_name"] = name
        if current["driver_index"] is None and index_value is not None:
            current["driver_index"] = index_value
        if current["truck_number"] is None and truck is not None:
            current["truck_number"] = truck

        if subtype == "rate":
            for entry, value in zip(current["days"].values(), day_values):
                entry["rate_raw"], entry["rate_numeric"], status = classify_day_value(value)
                if status:
                    entry["status"] = normalize_status_text(status)
                    entry.setdefault("status_source", "rate")
        elif subtype == "mile":
            for entry, value in zip(current["days"].values(), day_values):
                miles = to_number(value)
                if miles is None and not is_blank(value):
                    _, _, status = classify_day_value(value)
                    if status:
                        entry["status"] = normalize_status_text(status)
                        entry.setdefault("status_source", "mile")
                    else:
                        warnings.append(
                            f"row {position + 1}: miles for "
                            f"'{current['driver_name'] or current['driver_index']}' on {entry['label']} "
                            f"are not numeric ({clean_text(value)!r}); left empty."
                        )
                entry["miles"] = miles
        elif subtype == "load":
            for entry, value in zip(current["days"].values(), day_values):
                load_id, status = classify_load_cell(value)
                if load_id is not None:
                    entry["load_number"] = load_id
                if status:
                    entry["status"] = normalize_status_text(status)
                    entry.setdefault("status_source", "load")

        # Tail metrics live on the Rate row, but accept them from any sub-row.
        for key in ("total_revenue", "total_miles", "reported_rpm", "comments"):
            if current["reported"][key] is None and tail[key] is not None:
                current["reported"][key] = tail[key]

    # ------------------------------------------------------------------ #
    # Flatten
    # ------------------------------------------------------------------ #
    daily_records: list[dict[str, Any]] = []
    summary_records: list[dict[str, Any]] = []

    for sequence, driver in enumerate(drivers, start=1):
        name_value = driver["driver_name"] or f"Driver {driver['driver_index'] or sequence}"
        truck_value = driver["truck_number"]
        driver_key = f"{driver['driver_index'] if driver['driver_index'] is not None else sequence}|{name_value}"

        subtypes_seen = set(driver["subtypes"])
        for missing in ("rate", "mile", "load"):
            if missing not in subtypes_seen and driver["subtypes"]:
                warnings.append(
                    f"driver '{name_value}': block has no '{missing.title()}' row "
                    f"({', '.join(sorted(subtypes_seen))})."
                )

        days = list(driver["days"].values())
        revenue_sum = 0.0
        miles_sum = 0.0
        statuses: list[str] = []
        worked = 0

        for entry in days:
            rate_raw = entry.get("rate_raw")
            rate_numeric = entry.get("rate_numeric")
            status = entry.get("status")
            miles = entry.get("miles")
            load = entry.get("load_number")
            the_date: date | None = entry["date"]

            if rate_numeric is not None:
                revenue_sum += rate_numeric
                if rate_numeric > 0:
                    worked += 1
            elif status:
                statuses.append(status)
            if miles is not None:
                miles_sum += miles

            daily_records.append(
                {
                    "driver_name": name_value,
                    "truck_number": truck_value,
                    "date": the_date,
                    "date_iso": the_date.isoformat() if the_date else None,
                    "rate_or_status": rate_raw,
                    "rate_numeric": rate_numeric,
                    "status": status,
                    "status_source": entry.get("status_source"),
                    "is_working_day": bool(rate_numeric is not None and rate_numeric > 0),
                    "miles": miles,
                    "load_number": load,
                    "driver_index": driver["driver_index"],
                    "driver_key": driver_key,
                    "day_of_week": day_name(the_date),
                    "date_label": entry["label"],
                    "week_start": week_start,
                    "week_end": week_end,
                    "source_row": driver["source_rows"][0],
                }
            )

        reported_total = driver["reported"]["total_revenue"]
        reported_miles = driver["reported"]["total_miles"]
        reported_rpm = driver["reported"]["reported_rpm"]

        revenue_check = "ok"
        if reported_total is not None and abs(revenue_sum - reported_total) > RECON_TOLERANCE:
            revenue_check = f"mismatch ({revenue_sum:.2f} vs {reported_total:.2f})"
            warnings.append(
                f"driver '{name_value}': daily rate cells add up to {revenue_sum:,.2f} but Total $ says "
                f"{reported_total:,.2f} (difference {revenue_sum - reported_total:,.2f})."
            )
        miles_check = "ok"
        if reported_miles is not None and abs(miles_sum - reported_miles) > RECON_TOLERANCE:
            miles_check = f"mismatch ({miles_sum:.2f} vs {reported_miles:.2f})"
            warnings.append(
                f"driver '{name_value}': daily miles add up to {miles_sum:,.2f} but Total Mile says "
                f"{reported_miles:,.2f} (difference {miles_sum - reported_miles:,.2f})."
            )

        computed_rpm = (revenue_sum / miles_sum) if miles_sum else None
        gross_per_day = (revenue_sum / worked) if worked else None
        miles_per_day = (miles_sum / worked) if worked else None
        if reported_rpm is not None and computed_rpm is not None and abs(reported_rpm - computed_rpm) > 0.02:
            warnings.append(
                f"driver '{name_value}': Per Mile says {reported_rpm:.4f} but Total $ ÷ Total Mile is "
                f"{computed_rpm:.4f}."
            )

        summary_records.append(
            {
                "driver_index": driver["driver_index"],
                "driver_name": name_value,
                "truck_number": truck_value,
                "driver_key": driver_key,
                "total_revenue_reported": reported_total,
                "total_miles_reported": reported_miles,
                "rate_per_mile_reported": reported_rpm,
                "manager_comments": driver["reported"]["comments"],
                "days_worked": worked,
                "daily_revenue_sum": round(revenue_sum, 2) if daily_records else None,
                "total_miles_sum": round(miles_sum, 2),
                "computed_rate_per_mile": round(computed_rpm, 4) if computed_rpm is not None else None,
                "gross_per_day_worked": round(gross_per_day, 2) if gross_per_day is not None else None,
                "miles_per_day_worked": round(miles_per_day, 1) if miles_per_day is not None else None,
                "status_flags": ", ".join(sorted(set(statuses))) or None,
                "revenue_check": revenue_check,
                "miles_check": miles_check,
                "subrows_found": ", ".join(driver["subtypes"]),
                "source_rows": ", ".join(str(row) for row in driver["source_rows"]),
            }
        )

    daily_columns = [
        "driver_name",
        "truck_number",
        "date",
        "date_iso",
        "rate_or_status",
        "rate_numeric",
        "status",
        "status_source",
        "is_working_day",
        "miles",
        "load_number",
        "driver_index",
        "driver_key",
        "day_of_week",
        "date_label",
        "week_start",
        "week_end",
        "source_row",
    ]
    summary_columns = [
        "driver_index",
        "driver_name",
        "truck_number",
        "driver_key",
        "total_revenue_reported",
        "total_miles_reported",
        "rate_per_mile_reported",
        "manager_comments",
        "days_worked",
        "daily_revenue_sum",
        "total_miles_sum",
        "computed_rate_per_mile",
        "gross_per_day_worked",
        "miles_per_day_worked",
        "status_flags",
        "revenue_check",
        "miles_check",
        "subrows_found",
        "source_rows",
    ]

    daily = pd.DataFrame(daily_records, columns=daily_columns)
    summary = pd.DataFrame(summary_records, columns=summary_columns)

    if not daily.empty:
        daily["rate_numeric"] = pd.to_numeric(daily["rate_numeric"], errors="coerce").astype("Float64")
        daily["miles"] = pd.to_numeric(daily["miles"], errors="coerce").astype("Float64")

    if skipped:
        warnings.append("Skipped non-driver rows: " + "; ".join(skipped) + ".")

    # Operator guidance printed above the header (e.g. "Dont use comments. Use notes.").
    instructions: list[str] = []
    for row in frame.iloc[: detected_header].itertuples(index=False, name=None):
        for cell in row:
            text = clean_text(cell)
            if not text or len(text) < 6:
                continue
            if text in {clean_text(value) for value in header}:
                continue
            instructions.append(text)
    comments_caveat = any(
        "comment" in text.lower() and any(word in text.lower() for word in ("not saved", "dont", "don't", "use notes", "archive"))
        for text in instructions
    )

    meta: dict[str, Any] = {
        "source": source,
        "instructions": instructions,
        "comments_caveat": comments_caveat,
        "sheet_name": sheet_name,
        "header_row_excel": detected_header + 1,
        "data_start_excel": data_start + 1,
        "date_columns": [
            {
                "column": _column_letter(column),
                "label": label if label is not None else _column_letter(column),
                "date": resolved_dates[i].isoformat() if resolved_dates[i] else None,
            }
            for i, (column, label) in enumerate(zip(date_columns, date_labels))
        ],
        "week_start": week_start.isoformat() if week_start else None,
        "week_end": week_end.isoformat() if week_end else None,
        "columns": {role: _column_letter(column) for role, column in roles.items()},
        "drivers": len(summary),
        "daily_rows": len(daily),
        "fleet_totals_seen": fleet_totals,
        "rollup_rows": rollups,
    }

    return GrossBoard(daily=daily, summary=summary, warnings=warnings, meta=meta)


# --------------------------------------------------------------------------- #
# File entry points
# --------------------------------------------------------------------------- #

def _read_workbook(filepath: str | Path, sheet_name: str | int | None) -> tuple[pd.DataFrame, str | None]:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Workbook not found: {path}")
    engine = "openpyxl" if path.suffix.lower() in {".xlsx", ".xlsm", ".xltx", ".xltm"} else None
    sheet: str | int = sheet_name if sheet_name is not None else 0
    frame = pd.read_excel(path, header=None, sheet_name=sheet, engine=engine)
    if isinstance(frame, dict):  # pandas returns a dict when sheet_name=None
        name, frame = next(iter(frame.items()))
        return frame, str(name)
    resolved_name = str(sheet) if isinstance(sheet, str) else None
    try:
        import openpyxl

        workbook = openpyxl.load_workbook(path, read_only=True)
        names = workbook.sheetnames
        workbook.close()
        if isinstance(sheet, int) and 0 <= sheet < len(names):
            resolved_name = names[sheet]
    except Exception:  # pragma: no cover - best effort metadata only
        pass
    return frame, resolved_name


def parse_gross_board_workbook(
    filepath: str | Path,
    *,
    sheet_name: str | int | None = None,
    header_row: int | None = None,
    start_row: int | None = None,
) -> GrossBoard:
    """Parse a workbook file and return the full :class:`GrossBoard` result."""
    frame, resolved_sheet = _read_workbook(filepath, sheet_name)
    return parse_gross_board_frame(
        frame,
        source=str(filepath),
        sheet_name=resolved_sheet,
        header_row=header_row,
        start_row=start_row,
    )


def parse_gross_board(
    filepath: str | Path,
    *,
    sheet_name: str | int | None = None,
    header_row: int | None = None,
    start_row: int | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    The requested convenience API:

        daily_df, summary_df = parse_gross_board("gross_board.xlsx")

    ``daily_df``   — one row per (driver, date)
    ``summary_df`` — one row per driver

    For warnings and metadata use :func:`parse_gross_board_workbook`.
    """
    result = parse_gross_board_workbook(
        filepath, sheet_name=sheet_name, header_row=header_row, start_row=start_row
    )
    return result.daily, result.summary


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _print_preview(result: GrossBoard) -> None:
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.width", 160)
    pd.set_option("display.max_colwidth", 24)
    meta = result.meta
    print(f"\nSource        : {meta.get('source')}  (sheet: {meta.get('sheet_name') or 'first'})")
    print(f"Header row    : Excel row {meta.get('header_row_excel')}")
    print(f"Data from     : Excel row {meta.get('data_start_excel')}")
    if meta.get("week_start"):
        print(f"Week          : {meta['week_start']} → {meta['week_end']}")
    print(f"Drivers       : {len(result.summary)}")
    print(f"Driver-days   : {len(result.daily)}")

    if not result.summary.empty:
        print("\nSummary (one row per driver)")
        print(
            result.summary[
                [
                    "driver_name",
                    "truck_number",
                    "days_worked",
                    "total_revenue_reported",
                    "total_miles_reported",
                    "rate_per_mile_reported",
                    "revenue_check",
                ]
            ].to_string(index=False)
        )
    if not result.daily.empty:
        print("\nDaily (one row per driver-day)")
        print(
            result.daily[
                ["driver_name", "date_iso", "rate_or_status", "miles", "load_number", "status"]
            ].head(10).to_string(index=False)
        )
    if result.warnings:
        print(f"\nWarnings ({len(result.warnings)})")
        for warning in result.warnings:
            print(f"  • {warning}")
    else:
        print("\nNo warnings — daily cells reconcile with the reported totals.")


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Parse a trucking Gross Board workbook (3-row blocks per driver).",
    )
    parser.add_argument("workbook", help="Path to the .xlsx/.xlsm Gross Board file.")
    parser.add_argument("--sheet", default=None, help="Sheet name or 0-based index (default: first sheet).")
    parser.add_argument("--header-row", type=int, default=None, help="0-based iloc row holding the headers.")
    parser.add_argument("--start-row", type=int, default=None, help="0-based iloc row where driver data begins.")
    parser.add_argument("--out", default=None, help="Directory for daily.csv / summary.csv / gross_board.json.")
    parser.add_argument("--json", dest="json_path", default=None, help="Write the full nested result to this JSON path.")
    parser.add_argument("--no-files", action="store_true", help="Only print a preview; write nothing.")
    parser.add_argument("--quiet", action="store_true", help="Do not print the preview tables.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        result = parse_gross_board_workbook(
            args.workbook,
            sheet_name=args.sheet if isinstance(args.sheet, str) else (int(args.sheet) if args.sheet not in (None, "") else None),
            header_row=args.header_row,
            start_row=args.start_row,
        )
    except (FileNotFoundError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if not args.quiet:
        _print_preview(result)

    if not args.no_files:
        out_dir = Path(args.out) if args.out else Path("out")
        out_dir.mkdir(parents=True, exist_ok=True)
        daily_path = out_dir / "driver_days.csv"
        summary_path = out_dir / "driver_summary.csv"
        result.daily.to_csv(daily_path, index=False)
        result.summary.to_csv(summary_path, index=False)
        json_path = Path(args.json_path) if args.json_path else out_dir / "gross_board.json"
        result.to_json(json_path)
        print(f"\nWrote {daily_path}, {summary_path}, {json_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
