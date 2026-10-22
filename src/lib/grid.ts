import { detectField } from "./fields";

export function isDateLike(value: string): boolean {
  return (
    /^\d{4}-\d{1,2}-\d{1,2}/.test(value) ||
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(value) ||
    /^\d{1,2}\s+[A-Za-z]{3,}/.test(value)
  );
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
];

const WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Month, quarter, week, weekday or ISO-month headings that appear above date columns. */
export function isLooseDateLabel(value: string): boolean {
  let normalized = value
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  if (isDateLike(normalized)) return true;

  // "Mon 02 Feb", "Monday, 2 Feb", "w/c 02 Feb"
  if (normalized.startsWith("w c ") || normalized.startsWith("wc ") || normalized.startsWith("week of ")) {
    normalized = normalized.replace(/^(w c|wc|week of)\s+/, "");
  }
  const firstToken = normalized.split(" ")[0];
  if (WEEKDAY_NAMES.includes(firstToken)) {
    normalized = normalized.split(" ").slice(1).join(" ").trim();
    if (!normalized) return false;
  }

  if (MONTH_NAMES.includes(normalized)) return true;
  if (/^\d{1,2}\s+[a-z]{3,}/.test(normalized)) return true;
  if (normalized.split(" ")[0] && MONTH_NAMES.includes(normalized.split(" ")[0])) return true;
  if (/^\d{4}$/.test(normalized) && Number(normalized) >= 1990 && Number(normalized) <= 2100) return true;
  if (/^\d{4}[-/ ]?(0?[1-9]|1[0-2])$/.test(normalized)) return true;
  if (/^(q[1-4]|h[12]|w\d{1,2}|wk\s?\d{1,2}|week\s?\d{1,2})(\s?\d{2,4})?$/.test(normalized)) return true;
  if (/^(fy|cy)\s?\d{2,4}$/.test(normalized)) return true;
  if (/^\d{1,2}[-/]\d{4}$/.test(normalized)) return true;
  return false;
}

export function cleanMatrix(matrix: unknown[][]): string[][] {
  return matrix
    .map((row) =>
      Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())) : [],
    )
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function matrixWidth(matrix: string[][]): number {
  return matrix.reduce((width, row) => Math.max(width, row.length), 0);
}

/** Drops leading/trailing columns that are empty in every row. */
export function stripBannerColumns(matrix: string[][]): string[][] {
  if (matrix.length === 0) return matrix;
  const width = matrixWidth(matrix);
  const filled = (column: number) => matrix.some((row) => (row[column] ?? "").trim().length > 0);
  let start = 0;
  let end = width;
  while (start < end && !filled(start)) start += 1;
  while (end > start && !filled(end - 1)) end -= 1;
  return matrix.map((row) => Array.from({ length: Math.max(0, end - start) }, (_, index) => row[start + index] ?? ""));
}

/**
 * Drops leading/trailing rows that hold a single cell — report titles, export
 * timestamps, footers — so they don't become a fake first column when a
 * sideways table is flipped.
 */
export function stripBannerRows(matrix: string[][]): string[][] {
  const filled = (row: string[]) => row.filter((cell) => cell.trim().length > 0).length;
  let start = 0;
  let end = matrix.length;
  while (start < end - 2 && filled(matrix[start]) <= 1) start += 1;
  while (end - start > 2 && filled(matrix[end - 1]) <= 1) end -= 1;
  return matrix.slice(start, end);
}

export function padMatrix(matrix: string[][]): string[][] {
  const width = matrixWidth(matrix);
  return matrix.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
}

export function transposeMatrix(matrix: string[][]): string[][] {
  const padded = padMatrix(matrix);
  if (padded.length === 0) return [];
  const width = padded[0].length;
  return Array.from({ length: width }, (_, column) => padded.map((row) => row[column] ?? ""));
}

function looksLikeHeaderRow(cells: string[], nextRow?: string[]): boolean {
  const values = cells.filter((cell) => cell.trim().length > 0);
  if (values.length < 2) return false;

  const knownFields = values.filter((value) => detectField(value) !== null).length;
  if (knownFields >= 2) return true;

  const idLike = /^[A-Z]{1,6}[-_/ ]?\d{2,}[A-Z0-9-]*$/i.test(values[0] ?? "");
  const numericLike = values.filter((value) => /^-?[\d.,$%\s]+$/.test(value) || isDateLike(value)).length;
  if (knownFields === 0 && (idLike || numericLike > 0)) return false;

  const texty = values.filter((value) => !/^-?[\d.,$%\s]+$/.test(value) && !isDateLike(value)).length;
  const mostlyText = texty / values.length >= 0.7;
  if (!mostlyText) return false;

  const nextTexty = nextRow
    ? nextRow.filter((cell) => cell.trim().length > 0 && !/^-?[\d.,$%\s]+$/.test(cell) && !isDateLike(cell)).length
    : 0;

  const unique = new Set(values.map((value) => value.toLowerCase())).size === values.length;
  const short = values.every((value) => value.length <= 48);
  return unique && short && (nextTexty < values.length || knownFields > 0);
}

/**
 * Real spreadsheets often carry a title, a date, a blank line or an export
 * banner above the actual headings. Score the first rows and pick the one that
 * behaves like a header instead of assuming row 1.
 */
export function findHeaderRowIndex(matrix: string[][]): number | null {
  const limit = Math.min(matrix.length - 1, 15);
  let best: { index: number; score: number } | null = null;

  for (let index = 0; index <= limit; index += 1) {
    const row = matrix[index] ?? [];
    const values = row.filter((cell) => cell.length > 0);
    if (values.length < 2) continue;

    const known = values.filter((value) => detectField(value) !== null).length;
    const texty = values.filter((value) => !/^-?[\d.,$%\s]+$/.test(value) && !isDateLike(value)).length;
    const dataLike = values.filter((value) => /^-?[\d.,$%\s]+$/.test(value) || isDateLike(value)).length;

    const fill = values.length / Math.max(1, row.length);
    const score = known * 4 + (texty / values.length) * 3 + fill * 2 - (dataLike / values.length) * 3;

    const next = matrix[index + 1] ?? [];
    const nextFilled = next.filter((cell) => cell.length > 0).length;
    if (nextFilled === 0) continue;
    if (known === 0 && dataLike > 0) continue;

    if (!best || score > best.score) best = { index, score };
  }

  if (!best) return null;
  return best.score >= 2 ? best.index : null;
}

export function dedupeHeaders(rawHeaders: string[], width: number): { headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const used = new Map<string, number>();
  const headers: string[] = [];

  for (let index = 0; index < width; index += 1) {
    const base = (rawHeaders[index] ?? "").replace(/\s+/g, " ").trim() || `Column ${index + 1}`;
    const seen = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), seen + 1);
    const header = seen === 0 ? base : `${base} (${seen + 1})`;
    if (seen > 0) warnings.push(`Duplicate column "${base}" was renamed to "${header}".`);
    headers.push(header);
  }

  return { headers, warnings };
}

export function isRepeatedHeader(row: string[], headers: string[]): boolean {
  const cells = row.filter((cell) => cell.trim().length > 0);
  if (cells.length < 2) return false;
  const matches = cells.filter((cell) => {
    const normalized = cell.trim().toLowerCase();
    return headers.some((header) => header.trim().toLowerCase() === normalized);
  }).length;
  return matches / cells.length >= 0.6;
}

export function isTotalRow(row: string[]): boolean {
  const first = row.find((cell) => cell.trim().length > 0)?.trim() ?? "";
  if (!first || first.length > 32) return false;
  return /^(grand\s+total|sub\s*-?\s*total|total|totals|sum|summary|report total)\b[:\s-]*/i.test(first);
}

export { looksLikeHeaderRow };
