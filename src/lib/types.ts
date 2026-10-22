export type SourceKind = "paste" | "file" | "sample";

export type RawRow = Record<string, string>;

export type ParsedSheet = {
  fileName: string;
  source: SourceKind;
  headers: string[];
  rows: RawRow[];
  warnings: string[];
  sheetName?: string;
  truncated: boolean;
};

export type CanonicalField =
  | "shipmentId"
  | "reference"
  | "customer"
  | "carrier"
  | "driver"
  | "mode"
  | "origin"
  | "destination"
  | "status"
  | "pickupDate"
  | "deliveryDate"
  | "weight"
  | "pieces"
  | "distance"
  | "cost"
  | "currency"
  | "notes";

export type FieldKind = "text" | "number" | "currency" | "date" | "status" | "mode";

/** Keyed by the original spreadsheet header. An empty string means "leave unmapped". */
export type ColumnMapping = Record<string, CanonicalField | "">;

export type Layout = "records" | "matrix" | "grossboard";

export type BatchSummary = {
  id: number;
  fileName: string;
  source: SourceKind;
  layout: Layout;
  sheetName: string | null;
  rowCount: number;
  columnCount: number;
  createdAt: string;
};

export type Batch = BatchSummary & {
  headers: string[];
  rows: RawRow[];
  mapping: ColumnMapping;
};

export const MAX_ROWS = 5000;
