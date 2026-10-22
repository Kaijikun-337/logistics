import { detectField, normalizeText } from "./fields";
import {
  cleanMatrix,
  findHeaderRowIndex,
  isDateLike,
  isLooseDateLabel,
  matrixWidth,
  stripBannerColumns,
  stripBannerRows,
} from "./grid";

export type Orientation = "rows" | "cols";

export type OrientationAnalysis = {
  /** "rows" = each row is one record (normal). "cols" = each column is one record (transposed). */
  orientation: Orientation;
  headerRowIndex: number | null;
  /** Confidence 0–1 for the chosen orientation. */
  confidence: number;
  reasons: string[];
  rowLabelFields: { label: string; field: string }[];
  scores: { rows: number; cols: number };
};

/** Row-label words that describe a metric rather than a record. */
const METRIC_WORDS = new Set([
  "rate", "rates", "mile", "miles", "mileage", "distance", "load", "loads", "load count", "revenue", "cost", "costs",
  "spend", "weight", "pallets", "pieces", "stops", "drops", "fuel", "fuel cost", "fuel surcharge", "detention",
  "linehaul", "line haul", "accessorials", "accessorial", "shipments", "orders", "bookings", "invoices", "tonnage",
  "volume", "driver pay", "empty miles", "total miles", "per mile", "rpm", "cpm", "transit days", "count", "qty",
  "quantity", "utilization", "on time", "otif", "margin", "profit", "total", "average", "avg", "units", "trips",
  "containers", "teu", "trailer", "truck", "trucks", "vans", "drivers", "hours", "drive hours", "idle hours",
]);

function isIdLike(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return /^[A-Z]{1,8}[-_/]?\d{3,}[A-Z0-9-]*$/i.test(compact) || /^\d{5,}$/.test(compact);
}

function isNumericLike(value: string): boolean {
  return /^\(?-?[$€£¥₹]?\s?\d[\d,.\s]*\)?\s*(kg|kgs|lbs|lb|t|tons?|pcs|mi|km|%)?$/i.test(value.trim());
}

/** A label reads like a metric ("Rate", "Miles", "Load") rather than a record ID. */
export function looksLikeMetricLabel(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (METRIC_WORDS.has(normalized)) return true;
  if (detectField(value) !== null) return true;
  const firstWord = normalized.split(" ")[0];
  return METRIC_WORDS.has(firstWord);
}

function share(values: string[], predicate: (value: string) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(predicate).length / values.length;
}

/**
 * Decides whether a sheet is a normal record table or a matrix that has been
 * laid out sideways (dates across the top, metrics down the left column).
 */
export function analyzeOrientation(matrix: string[][]): OrientationAnalysis {
  const grid = stripBannerRows(stripBannerColumns(cleanMatrix(matrix)));
  const width = matrixWidth(grid);
  const empty: OrientationAnalysis = {
    orientation: "rows",
    headerRowIndex: null,
    confidence: 0,
    reasons: [],
    rowLabelFields: [],
    scores: { rows: 0, cols: 0 },
  };

  if (grid.length < 3 || width < 3) {
    return { ...empty, headerRowIndex: findHeaderRowIndex(grid), confidence: 0.2, reasons: ["Too small to re-orient."] };
  }

  const bodyRows = grid.slice(1);
  const topRow = (grid[0] ?? []).slice(1).filter((cell) => cell.length > 0);
  const leftColumn = bodyRows.map((row) => (row[0] ?? "").trim()).filter((cell) => cell.length > 0);
  const numericBody = bodyRows.slice(0, 40).flatMap((row) => row.slice(1).filter((cell) => cell.length > 0));

  const topDateShare = share(topRow, isLooseDateLabel);
  const leftMetricHits = leftColumn.filter(looksLikeMetricLabel).length;
  const leftMetricShare = share(leftColumn, looksLikeMetricLabel);
  const leftIdLike = leftColumn.filter(isIdLike).length;
  const bodyNumericShare = share(numericBody, isNumericLike);
  const bodyDateShare = share(numericBody, isDateLike);

  // --- Evidence that this is a sideways metric matrix -----------------------
  let colsScore = 0;
  const colReasons: string[] = [];

  if (topDateShare >= 0.5) {
    colsScore += 3.5;
    colReasons.push(`the top row is ${Math.round(topDateShare * 100)}% dates or periods`);
  }
  if (leftMetricShare >= 0.6 && leftColumn.length >= 2) {
    colsScore += 3;
    colReasons.push(`the left column is ${Math.round(leftMetricShare * 100)}% metric names`);
  }
  if (bodyNumericShare >= 0.6) {
    colsScore += 1.5;
    colReasons.push("the body is mostly numeric measurements");
  }
  if (leftIdLike > 0) {
    colsScore -= leftIdLike >= 1 ? 2.5 : 0;
  }
  if (leftColumn.length >= 2 && topRow.length >= 2 && grid.length <= 12 && width >= 6) {
    colsScore += 0.5;
  }

  // --- Evidence that this is a normal record table --------------------------
  const headerIndex = findHeaderRowIndex(grid);
  const headerRow = headerIndex !== null ? grid[headerIndex] : [];
  const knownHeaderFields = headerRow.filter((cell) => detectField(cell) !== null).length;
  let rowsScore = 0;
  const rowReasons: string[] = [];

  if (knownHeaderFields >= 2) {
    rowsScore += 4;
    rowReasons.push(`the header row names ${knownHeaderFields} known logistics fields`);
  } else if (knownHeaderFields === 1) {
    rowsScore += 1.5;
  }
  if (leftMetricShare < 0.3) rowsScore += 1;
  if (leftIdLike > 0) {
    rowsScore += 1.5;
    rowReasons.push("the left column looks like record identifiers");
  }
  if (bodyDateShare >= 0.5) rowsScore += 1;
  if (topDateShare < 0.3) rowsScore += 0.5;

  const orientation: Orientation = colsScore > rowsScore + 1 ? "cols" : "rows";
  const total = Math.max(1, colsScore + rowsScore);
  const confidence = orientation === "cols" ? colsScore / total : rowsScore / total;

  const reasons = orientation === "cols" ? colReasons : rowReasons;

  const rowLabelFields = leftColumn
    .slice(0, 20)
    .filter((label) => looksLikeMetricLabel(label))
    .map((label) => ({ label, field: detectField(label) ?? "" }));

  if (orientation === "cols" && reasons.length === 0) reasons.push("the layout matched a metric matrix");

  return {
    orientation,
    headerRowIndex: orientation === "cols" ? 0 : headerIndex,
    confidence: Math.min(0.98, Math.max(0.3, confidence)),
    reasons,
    rowLabelFields,
    scores: { rows: rowsScore, cols: colsScore },
  };
}
