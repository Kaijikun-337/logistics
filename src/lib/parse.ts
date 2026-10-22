import { FIELD_BY_KEY } from "./fields";
import {
  cleanMatrix,
  dedupeHeaders,
  findHeaderRowIndex,
  isLooseDateLabel,
  isRepeatedHeader,
  isTotalRow,
  looksLikeHeaderRow,
  matrixWidth,
  stripBannerColumns,
  stripBannerRows,
  transposeMatrix,
} from "./grid";
import { analyzeOrientation, type Orientation, type OrientationAnalysis } from "./orientation";
import { MAX_ROWS, type ParsedSheet, type RawRow, type SourceKind } from "./types";

const DELIMITERS = ["\t", ",", ";", "|"] as const;

export type SheetMeta = { fileName: string; source: SourceKind; sheetName?: string };

export type SheetOptions = {
  orientation?: "auto" | Orientation;
  headerRow?: "auto" | number | null;
};

export type BuiltSheet = {
  sheet: ParsedSheet;
  analysis: OrientationAnalysis;
  orientation: Orientation;
  headerRowIndex: number | null;
};

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Guesses the delimiter by looking at which candidate splits the first lines most consistently. */
export function detectDelimiter(text: string): string {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 12);

  if (lines.length === 0) return "\t";

  let best = { delimiter: "\t", score: -1 };
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => line.split(delimiter).length - 1);
    const first = counts[0] ?? 0;
    if (first <= 0) continue;
    const consistent = counts.filter((count) => count === first).length / counts.length;
    const score = first * 2 + consistent * 10;
    if (score > best.score) best = { delimiter, score };
  }

  return best.delimiter;
}

/** RFC-4180-ish reader that tolerates quotes, escaped quotes and embedded newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const input = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.trim() === "") {
      inQuotes = true;
      cell = "";
      continue;
    }

    if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  rows.push(row);

  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

export function textToMatrix(text: string): string[][] {
  const trimmed = stripBom(text).trim();
  if (!trimmed) return [];
  return parseDelimited(trimmed, detectDelimiter(trimmed));
}

const GENERIC_CORNER =
  /^(metric|metrics|measure|measures|field|fields|kpi|kpis|type|label|labels|item|items|description|category|row label|row labels|attribute|date range)$/i;

/** When a transposed table has a blank or generic corner cell, name the first column sensibly. */
function nameCornerColumn(headers: string[], data: string[][]): { headers: string[]; note: string | null } {
  if (headers.length === 0) return { headers, note: null };
  const current = headers[0] ?? "";
  if (!/^Column \d+$/.test(current) && !GENERIC_CORNER.test(current.trim())) return { headers, note: null };

  const values = data
    .slice(0, 60)
    .map((row) => (row[0] ?? "").trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) return { headers, note: null };

  const dateShare = values.filter((value) => isLooseDateLabel(value)).length / values.length;
  const numericShare = values.filter((value) => /^-?[\d.,]+$/.test(value)).length / values.length;
  const guess = dateShare >= 0.5 ? "Date" : numericShare >= 0.5 ? "Record" : "Item";
  const next = [...headers];
  next[0] = guess;
  const wasBlank = /^Column \d+$/.test(current);
  return {
    headers: next,
    note: wasBlank
      ? `The blank top-left cell was labelled “${guess}” from its values.`
      : `The generic corner label “${current}” was renamed “${guess}” from its values.`,
  };
}

export function buildSheet(matrix: unknown[][], meta: SheetMeta, options: SheetOptions = {}): BuiltSheet {
  const grid = stripBannerRows(stripBannerColumns(cleanMatrix(matrix)));
  const analysis = analyzeOrientation(grid);

  if (grid.length === 0) {
    return {
      sheet: {
        fileName: meta.fileName,
        source: meta.source,
        sheetName: meta.sheetName,
        headers: [],
        rows: [],
        warnings: ["The source did not contain any readable cells."],
        truncated: false,
      },
      analysis,
      orientation: "rows",
      headerRowIndex: null,
    };
  }

  const orientation: Orientation =
    options.orientation && options.orientation !== "auto" ? options.orientation : analysis.orientation;
  const working = orientation === "cols" ? transposeMatrix(grid) : grid;
  const width = matrixWidth(working);
  const warnings: string[] = [];

  if (orientation === "cols") {
    const forced = options.orientation === "cols" && analysis.orientation !== "cols";
    warnings.push(
      forced
        ? "The table was flipped as you asked: the left column became the field names and each column became a row."
        : "The table was read sideways: the first column held the metrics and the top row held dates, so it was flipped into one row per date.",
    );
    const fields = analysis.rowLabelFields.filter((entry) => entry.field);
    if (fields.length > 0) {
      warnings.push(
        `Row labels treated as fields: ${fields
          .map((entry) => `${entry.label} → ${FIELD_BY_KEY[entry.field as keyof typeof FIELD_BY_KEY]?.label ?? entry.field}`)
          .join(", ")}.`,
      );
    }
  }

  let headerIndex: number | null;
  if (options.headerRow === null) {
    headerIndex = null;
  } else if (typeof options.headerRow === "number") {
    headerIndex = Math.min(Math.max(0, options.headerRow), working.length - 1);
  } else if (orientation === "cols") {
    const auto = findHeaderRowIndex(working);
    headerIndex = auto ?? (looksLikeHeaderRow(working[0] ?? [], working[1]) ? 0 : 0);
  } else {
    headerIndex = findHeaderRowIndex(working);
    if (headerIndex === null && looksLikeHeaderRow(working[0] ?? [], working[1])) headerIndex = 0;
  }

  let headers: string[];
  let dataStart: number;

  if (headerIndex !== null) {
    const extracted = dedupeHeaders(working[headerIndex], width);
    headers = extracted.headers;
    warnings.push(...extracted.warnings);
    dataStart = headerIndex + 1;
    if (headerIndex > 0 && options.headerRow === "auto") {
      warnings.push(
        `Found the header row ${headerIndex + 1} row${headerIndex === 1 ? "" : "s"} down — skipped the title/preamble above it.`,
      );
    } else if (headerIndex > 0) {
      warnings.push(`${headerIndex} row${headerIndex === 1 ? "" : "s"} above the chosen header were ignored.`);
    }
  } else {
    headers = dedupeHeaders(
      Array.from({ length: width }, (_, index) => `Column ${index + 1}`),
      width,
    ).headers;
    dataStart = 0;
    warnings.push("No header row detected, so columns were auto-numbered.");
  }

  const rawBody = working.slice(dataStart);
  const withoutRepeats = rawBody.filter((row) => !isRepeatedHeader(row, headers));
  const repeatedHeaders = rawBody.length - withoutRepeats.length;
  const body = withoutRepeats.filter((row) => {
    if (!isTotalRow(row)) return true;
    const filled = row.filter((cell) => cell.length > 0).length;
    const numerics = row.filter((cell) => /^-?[$€£¥₹]?\s?[\d.,]+$/.test(cell.trim())).length;
    return !(filled <= Math.max(2, Math.ceil(headers.length / 2)) && numerics >= 1);
  });
  const totalRows = withoutRepeats.length - body.length;

  if (repeatedHeaders > 0) warnings.push(`${repeatedHeaders} repeated header row${repeatedHeaders === 1 ? "" : "s"} skipped.`);
  if (totalRows > 0) warnings.push(`${totalRows} total/summary row${totalRows === 1 ? "" : "s"} skipped so they don't skew the numbers.`);

  if (orientation === "cols") {
    const corner = nameCornerColumn(headers, body);
    headers = corner.headers;
    if (corner.note) warnings.push(corner.note);
  }

  const ragged = body.filter((row) => row.length !== headers.length).length;
  if (ragged > 0) warnings.push(`${ragged} row${ragged === 1 ? "" : "s"} had a different cell count than the header.`);

  const truncated = body.length > MAX_ROWS;
  if (truncated) warnings.push(`Only the first ${MAX_ROWS.toLocaleString()} rows were imported.`);

  const rows: RawRow[] = body.slice(0, MAX_ROWS).map((row) => {
    const record: RawRow = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? "").trim();
    });
    return record;
  });

  return {
    sheet: {
      fileName: meta.fileName,
      source: meta.source,
      sheetName: meta.sheetName,
      headers,
      rows,
      warnings,
      truncated,
    },
    analysis,
    orientation,
    headerRowIndex: headerIndex,
  };
}

export function parsedFromMatrix(matrix: unknown[][], meta: SheetMeta): ParsedSheet {
  return buildSheet(matrix, meta).sheet;
}

export function parseText(text: string, meta: SheetMeta): ParsedSheet {
  const matrix = textToMatrix(text);
  if (matrix.length === 0) {
    return {
      fileName: meta.fileName,
      source: meta.source,
      headers: [],
      rows: [],
      warnings: ["Nothing to parse — paste some spreadsheet rows first."],
      truncated: false,
    };
  }
  return parsedFromMatrix(matrix, meta);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(headers: string[], rows: RawRow[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
