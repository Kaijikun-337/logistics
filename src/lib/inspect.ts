import { detectField, parseDateParts, parseNumeric } from "./fields";
import { formatDate } from "./fields";
import {
  cleanMatrix,
  findHeaderRowIndex,
  isLooseDateLabel,
  matrixWidth,
  stripBannerColumns,
  stripBannerRows,
} from "./grid";
import { looksLikeMetricLabel } from "./orientation";
import type { Layout, RawRow } from "./types";

export type CellKind = "number" | "percent" | "date" | "text" | "empty";

export type MatrixCell = { raw: string; kind: CellKind; numeric: number | null };

export type MatrixRow = { label: string; cells: MatrixCell[]; total: number | null; isTotal: boolean; isBlank: boolean };

export type ColumnRole = "period" | "measure" | "note";

export type MatrixTable = {
  title: string | null;
  rowLabelHeading: string;
  columnLabels: string[];
  columnRoles: ColumnRole[];
  rows: MatrixRow[];
  columnTotals: (number | null)[];
  periodColumns: boolean;
  metricRows: boolean;
  totalsRowLabel: string | null;
  notes: string[];
  stats: { numbers: number; dates: number; texts: number; empties: number; numericTotal: number };
  source: "sheet" | "stored";
};

export type SheetInspection = {
  table: MatrixTable;
  /** Index (in the cleaned grid) of the row that supplied the column labels. */
  headerRowIndex: number | null;
  labelColumnIndex: number | null;
  bodyStart: number;
  bodyEnd: number;
  suggestedLayout: Layout;
  confidence: number;
  reasons: string[];
  raw: string[][];
};

const TOTAL_PATTERN =
  /^(grand\s+total|sub\s*-?\s*total|total|totals|sum|summary|report total|average|avg|mean)\b[:\s-]*/i;

function cellKind(raw: string): CellKind {
  const value = raw.trim();
  if (!value) return "empty";
  if (/^-?[$€£¥₹]?\s?\d[\d,.\s]*\s*%$/.test(value)) return "percent";
  if (parseDateParts(value)) return "date";
  if (/^\(?-?[$€£¥₹]?\s?\d[\d,.\s]*\)?$/.test(value) && parseNumeric(value) !== null) return "number";
  return "text";
}

function toCell(raw: string): MatrixCell {
  const kind = cellKind(raw);
  return { raw: raw.trim(), kind, numeric: kind === "number" || kind === "percent" ? parseNumeric(raw) : null };
}

function detectTitle(grid: string[][]): { title: string | null; consumed: number } {
  const chunks: string[] = [];
  let index = 0;
  while (index < Math.min(grid.length, 4)) {
    const filled = (grid[index] ?? []).filter((cell) => cell.trim().length > 0);
    if (filled.length === 0) {
      index += 1;
      continue;
    }
    if (filled.length > 1) break;
    chunks.push(filled[0]);
    index += 1;
  }
  return { title: chunks.length > 0 ? chunks.join(" · ") : null, consumed: index };
}

function detectHeaderRow(grid: string[][], from: number): number | null {
  const bodyRows = grid.slice(from);
  if (bodyRows.length < 2) return from < grid.length ? from : null;

  let best: { index: number; score: number } | null = null;
  const limit = Math.min(grid.length - 1, from + 8);

  for (let index = from; index <= limit; index += 1) {
    const row = grid[index] ?? [];
    const cells = row.filter((cell) => cell.trim().length > 0);
    const below = grid[index + 1] ?? [];
    const belowFilled = below.filter((cell) => cell.trim().length > 0);
    if (cells.length < 2 || belowFilled.length < 2) continue;

    const belowNumeric = below.filter((cell) => {
      const kind = cellKind(cell);
      return kind === "number" || kind === "percent" || kind === "date";
    }).length;

    if (belowNumeric / belowFilled.length < 0.5) continue;

    const labelish = cells.filter((cell) => {
      const kind = cellKind(cell);
      return kind === "text" || kind === "date" || isLooseDateLabel(cell) || looksLikeMetricLabel(cell);
    }).length;
    const numericHere = cells.filter((cell) => {
      const kind = cellKind(cell);
      return (kind === "number" || kind === "percent") && !isLooseDateLabel(cell);
    }).length;

    const score = (labelish / cells.length) * 4 - (numericHere / cells.length) * 3 - (index - from) * 0.15;
    if (!best || score > best.score) best = { index, score };
  }

  if (best && best.score > 0.8) return best.index;
  // Fall back to the general detector for tables whose data row is text-heavy.
  const fallback = findHeaderRowIndex(grid.slice(from));
  return fallback === null ? null : from + fallback;
}

function detectLabelColumns(grid: string[][], bodyStart: number, width: number, headerRow: number | null): number[] {
  const body = grid.slice(bodyStart);
  const headerCells = headerRow === null ? [] : (grid[headerRow] ?? []);
  const namedHeaders = headerCells.filter((cell) => cell.trim().length > 0);
  const headerPeriodShare =
    namedHeaders.length === 0 ? 0 : namedHeaders.filter((cell) => isLooseDateLabel(cell)).length / namedHeaders.length;
  const knownFields = headerCells.filter((cell) => detectField(cell) !== null).length;

  // A date-across-the-top grid usually has a couple of identifier columns on the left.
  const candidates = headerPeriodShare >= 0.4 ? 3 : knownFields >= 2 ? 1 : Math.min(2, Math.max(1, width - 1));
  const labels: number[] = [];

  for (let column = 0; column < candidates; column += 1) {
    const header = (headerCells[column] ?? "").trim();
    if (isLooseDateLabel(header) || MEASURE_LABEL.test(header)) break;
    const values = body.map((row) => (row[column] ?? "").trim()).filter((cell) => cell.length > 0);
    if (values.length === 0) continue;
    const texty = values.filter((value) => cellKind(value) === "text").length;
    const datey = values.filter((value) => isLooseDateLabel(value)).length;
    if (texty / values.length >= 0.6 && datey === 0) labels.push(column);
    else break;
  }

  return labels;
}

const MEASURE_LABEL = /(total|subtotal|sum|amount|rate|mile|miles|per mile|rpm|cpm|cost|pay|revenue|avg|average|hours|stops|loads?|fuel|%|percent)/i;
const NOTE_LABEL = /(comment|comments|note|notes|remark|remarks|description|instruction)/i;

function roleForColumn(label: string, cells: MatrixCell[]): ColumnRole {
  if (isLooseDateLabel(label)) return "period";
  if (NOTE_LABEL.test(label)) return "note";
  const filled = cells.filter((cell) => cell.kind !== "empty");
  const numeric = filled.filter((cell) => cell.kind === "number" || cell.kind === "percent").length;
  const text = filled.filter((cell) => cell.kind === "text").length;
  if (MEASURE_LABEL.test(label)) return "measure";
  if (filled.length > 0 && text > numeric) return "note";
  return "measure";
}

function labelHeading(grid: string[][], headerRow: number | null, labelColumns: number[]): string {
  if (labelColumns.length === 0) return "Label";
  const parts =
    headerRow === null
      ? []
      : labelColumns.map((column) => (grid[headerRow]?.[column] ?? "").trim()).filter((value) => value.length > 0);
  if (parts.length === 1) return parts[0];
  if (parts.length > 1) return parts.join(" · ");

  // Blank corner cell: name it from the values that sit underneath, like a human would.
  const values = grid
    .slice((headerRow ?? -1) + 1)
    .map((row) => (row[labelColumns[0]] ?? "").trim())
    .filter((value) => value.length > 0)
    .slice(0, 40);
  if (values.length === 0) return "Label";
  const dateShare = values.filter((value) => isLooseDateLabel(value)).length / values.length;
  const metricShare = values.filter((value) => looksLikeMetricLabel(value)).length / values.length;
  const numericShare = values.filter((value) => cellKind(value) === "number").length / values.length;
  const words = values.filter((value) => value.split(/\s+/).length <= 4 && value.length <= 28).length / values.length;
  if (dateShare >= 0.5) return "Date";
  if (metricShare >= 0.5) return "Metric";
  if (numericShare >= 0.5) return "Number";
  if (words >= 0.6) return "Name";
  return "Item";
}

export function inspectionFromGrid(input: unknown[][]): SheetInspection {
  const rawGrid = stripBannerColumns(cleanMatrix(input));
  const { title } = detectTitle(rawGrid);
  const stripped = stripBannerRows(rawGrid);
  const grid = stripped.length > 0 ? stripped : rawGrid;
  const width = matrixWidth(grid);
  const notes: string[] = [];

  const headerRowIndex = detectHeaderRow(grid, 0);
  const bodyStart = headerRowIndex === null ? 0 : headerRowIndex + 1;

  const labelColumns = detectLabelColumns(grid, bodyStart, width, headerRowIndex);
  let dataColumns: number[] = [];
  for (let column = 0; column < width; column += 1) {
    if (!labelColumns.includes(column)) dataColumns.push(column);
  }

  const headerCells = headerRowIndex === null ? [] : (grid[headerRowIndex] ?? []);
  const bodyCellsAll = grid.slice(bodyStart);
  const liveColumns = dataColumns.filter((column) =>
    bodyCellsAll.some((row) => (row[column] ?? "").trim().length > 0) ||
    (headerCells[column] ?? "").trim().length > 0,
  );
  if (liveColumns.length !== dataColumns.length) {
    notes.push(`${dataColumns.length - liveColumns.length} empty column(s) ignored.`);
  }
  dataColumns = liveColumns;

  let columnLabels = dataColumns.map((column, index) => {
    const value = (headerCells[column] ?? "").trim();
    if (value) return value;
    const above = grid.slice(0, headerRowIndex ?? 0).map((row) => (row[column] ?? "").trim()).filter(Boolean);
    return above[above.length - 1] ?? `Column ${index + 1}`;
  });

  // Merge a stacked header (e.g. "February 2026" above "Rate"/"Loads") with forward-fill.
  let outerPeriodShare = 0;
  if (headerRowIndex !== null && headerRowIndex > 0) {
    const aboveRow = grid[headerRowIndex - 1] ?? [];
    const aboveFilled = dataColumns.filter((column) => (aboveRow[column] ?? "").trim().length > 0).length;
    if (aboveFilled / Math.max(1, dataColumns.length) >= 0.4) {
      let carried = "";
      let periodHits = 0;
      const merged = columnLabels.map((label, index) => {
        const above = (aboveRow[dataColumns[index]] ?? "").trim();
        if (above) carried = above;
        if (carried && isLooseDateLabel(carried)) periodHits += 1;
        if (!carried || carried === label) return label;
        return `${carried} · ${label}`;
      });
      outerPeriodShare = periodHits / Math.max(1, merged.length);
      if (merged.some((label, index) => label !== columnLabels[index])) {
        columnLabels = merged;
        notes.push("A stacked header was combined into one label per column (outer heading carried across).");
      }
    }
  }

  const bodyRows = grid.slice(bodyStart);
  const columnRoles: ColumnRole[] = dataColumns.map((column) =>
    roleForColumn((headerCells[column] ?? "").trim(), bodyRows.map((row) => toCell(row[column] ?? ""))),
  );
  const totalsRowLabel: string | null = null;
  let totalsRow: { label: string; values: (number | null)[] } | null = null;

  const rows: MatrixRow[] = bodyRows.map((row) => {
    const label = labelColumns
      .map((column) => (row[column] ?? "").trim())
      .filter(Boolean)
      .join(" · ");
    const cells = dataColumns.map((column) => toCell(row[column] ?? ""));
    const numbers = cells.map((cell) => cell.numeric).filter((value): value is number => value !== null);
    const numericCells = cells.filter((cell) => cell.kind === "number" || cell.kind === "percent").length;
    const isBlank = label.length === 0 && cells.every((cell) => cell.kind === "empty");
    // A row with numbers but no row name, sitting right under the header, is a totals row.
    const isTotal = TOTAL_PATTERN.test(label) || (label.length === 0 && numericCells > 0);
    return {
      label: label || (isTotal ? "(totals)" : "(blank)"),
      cells,
      total: numbers.length > 1 ? numbers.reduce((sum, value) => sum + value, 0) : null,
      isTotal,
      isBlank,
    };
  });

  for (const row of rows) {
    if (row.isTotal) {
      const values = row.cells.map((cell) => cell.numeric);
      if (!totalsRow) totalsRow = { label: row.label, values };
    }
  }

  const dataRows = rows.filter((row) => !row.isBlank && !row.isTotal);
  const keptRows = rows.filter((row) => !row.isBlank);

  const columnTotals = dataColumns.map((_, index) => {
    const values = dataRows
      .map((row) => row.cells[index]?.numeric ?? null)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  });

  const periodColumns =
    columnLabels.length > 0 &&
    (columnLabels.filter((label) => isLooseDateLabel(label)).length / columnLabels.length >= 0.5 ||
      outerPeriodShare >= 0.5);
  const metricLabels = keptRows.filter((row) => looksLikeMetricLabel(row.label)).length;
  const metricRows = keptRows.length > 0 && metricLabels / keptRows.length >= 0.5;

  const allCells = keptRows.flatMap((row) => row.cells);
  const stats = {
    numbers: allCells.filter((cell) => cell.kind === "number" || cell.kind === "percent").length,
    dates: allCells.filter((cell) => cell.kind === "date").length,
    texts: allCells.filter((cell) => cell.kind === "text").length,
    empties: allCells.filter((cell) => cell.kind === "empty").length,
    numericTotal: allCells.reduce((sum, cell) => sum + (cell.numeric ?? 0), 0),
  };

  if (title) notes.push(`Title found above the table: “${title}”.`);
  if (headerRowIndex !== null && headerRowIndex > 0) {
    notes.push(`Column labels came from row ${headerRowIndex + 1} of the sheet.`);
  }
  const periods = columnLabels.filter((label) => isLooseDateLabel(label)).length;
  const measures = columnRoles.filter((role) => role === "measure").length;
  if (periods > 0 && measures > 0) {
    notes.push(`${periods} date column(s) kept in place, with ${measures} derived/measure column(s) after them.`);
  }
  if (labelColumns.length > 0) {
    notes.push(
      `${labelColumns.length === 1 ? "One label column on the left holds" : `${labelColumns.length} label columns on the left hold`} the row names.`,
    );
  }
  if (periodColumns) notes.push("The column headings read as dates or periods.");
  if (metricRows) notes.push("The row labels read as metrics (rate, miles, loads…).");
  if (totalsRow) notes.push(`A totals row (“${totalsRow.label}”) is shown separately so it doesn't skew column sums.`);
  const blank = rows.length - keptRows.length;
  if (blank > 0) notes.push(`${blank} empty row${blank === 1 ? "" : "s"} ignored.`);

  const matrixLike = periodColumns && (metricRows || dataRows.length <= 12);
  const suggestedLayout: Layout = matrixLike ? "matrix" : "records";
  const confidence = Math.min(
    0.97,
    0.4 + (headerRowIndex !== null ? 0.2 : 0) + (labelColumns.length > 0 ? 0.15 : 0) + (metricRows ? 0.15 : 0) + (periodColumns ? 0.1 : 0),
  );

  const reasons: string[] = [];
  if (periodColumns) reasons.push("the top row is dates or periods");
  if (metricRows) reasons.push("the left column holds metrics rather than records");
  if (labelColumns.length > 0 && !periodColumns) reasons.push(`column “${labelHeading(grid, headerRowIndex, labelColumns)}” is a name column`);
  if (headerRowIndex !== null && headerRowIndex > 0) reasons.push(`the real header sits on row ${headerRowIndex + 1}`);
  if (reasons.length === 0) reasons.push("each row looks like one record with its own fields");

  const table: MatrixTable = {
    title,
    rowLabelHeading: labelHeading(grid, headerRowIndex, labelColumns),
    columnLabels,
    columnRoles,
    rows: keptRows,
    columnTotals,
    periodColumns,
    metricRows,
    totalsRowLabel,
    notes,
    stats,
    source: "sheet",
  };

  return {
    table,
    headerRowIndex,
    labelColumnIndex: labelColumns.length > 0 ? labelColumns[0] : null,
    bodyStart,
    bodyEnd: grid.length - 1,
    suggestedLayout,
    confidence,
    reasons,
    raw: grid,
  };
}

/** Rebuilds a displayable matrix from a saved batch (already stored label-keyed). */
export function matrixFromStored(headers: string[], rows: RawRow[]): MatrixTable {
  const labelHeadingValue = headers[0] ?? "Label";
  const columnLabels = headers.slice(1);
  const matrixRows: MatrixRow[] = rows.map((row) => {
    const label = (row[labelHeadingValue] ?? "").trim();
    const cells = columnLabels.map((column) => toCell(row[column] ?? ""));
    const numbers = cells.map((cell) => cell.numeric).filter((value): value is number => value !== null);
    return {
      label: label || "(blank)",
      cells,
      total: numbers.length > 1 ? numbers.reduce((sum, value) => sum + value, 0) : null,
      isTotal: TOTAL_PATTERN.test(label),
      isBlank: false,
    };
  });
  const dataRows = matrixRows.filter((row) => !row.isTotal);
  const columnTotals = columnLabels.map((_, index) => {
    const values = dataRows
      .map((row) => row.cells[index]?.numeric ?? null)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  });
  const allCells = matrixRows.flatMap((row) => row.cells);
  return {
    title: null,
    rowLabelHeading: labelHeadingValue,
    columnLabels,
    columnRoles: columnLabels.map((label, index) =>
      roleForColumn(label, matrixRows.map((row) => row.cells[index])),
    ),
    rows: matrixRows,
    columnTotals,
    periodColumns: columnLabels.filter((label) => isLooseDateLabel(label)).length / Math.max(1, columnLabels.length) >= 0.5,
    metricRows: true,
    totalsRowLabel: null,
    notes: ["Reopened from saved history — layout restored exactly as imported."],
    stats: {
      numbers: allCells.filter((cell) => cell.kind === "number" || cell.kind === "percent").length,
      dates: allCells.filter((cell) => cell.kind === "date").length,
      texts: allCells.filter((cell) => cell.kind === "text").length,
      empties: allCells.filter((cell) => cell.kind === "empty").length,
      numericTotal: allCells.reduce((sum, cell) => sum + (cell.numeric ?? 0), 0),
    },
    source: "stored",
  };
}

/** Matrix → label-keyed records, so a matrix can be stored with the existing schema. */
export function matrixToRecords(table: MatrixTable): { headers: string[]; rows: RawRow[] } {
  const headers = [table.rowLabelHeading, ...table.columnLabels];
  const rows: RawRow[] = table.rows.map((row) => {
    const record: RawRow = { [table.rowLabelHeading]: row.label };
    table.columnLabels.forEach((column, index) => {
      record[column] = row.cells[index]?.raw ?? "";
    });
    return record;
  });
  return { headers, rows };
}

export function formatMatrixCell(cell: MatrixCell): string {
  if (cell.kind === "empty") return "";
  if (cell.kind === "date") return formatDate(cell.raw);
  if (cell.numeric !== null) {
    const suffix = cell.kind === "percent" ? "%" : "";
    const digits = Number.isInteger(cell.numeric) ? 0 : 2;
    return `${cell.numeric.toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`;
  }
  return cell.raw;
}
