import { desc } from "drizzle-orm";

import { DEMO_MODE_MESSAGE, getDb } from "@/db";
import { importBatches } from "@/db/schema";
import { detectMapping } from "@/lib/fields";
import { MAX_ROWS, type BatchSummary, type ColumnMapping, type Layout, type RawRow, type SourceKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOURCES: SourceKind[] = ["paste", "file", "sample"];

type Payload = {
  layout: "records" | "matrix" | "grossboard";
  fileName: string;
  source: SourceKind;
  sheetName: string | null;
  headers: string[];
  rows: RawRow[];
  mapping: ColumnMapping;
};

function badRequest(message: string) {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

function parsePayload(body: unknown): Payload | string {
  if (!body || typeof body !== "object") return "Expected a JSON body.";
  const record = body as Record<string, unknown>;

  const headers = Array.isArray(record.headers)
    ? record.headers.filter((header): header is string => typeof header === "string" && header.trim().length > 0)
    : null;
  if (!headers || headers.length === 0) return "At least one column is required.";
  if (headers.length > 200) return "Too many columns (max 200).";

  if (!Array.isArray(record.rows) || record.rows.length === 0) return "At least one data row is required.";
  if (record.rows.length > MAX_ROWS) return `Too many rows (max ${MAX_ROWS}).`;

  const rows: RawRow[] = [];
  for (const raw of record.rows) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const row: RawRow = {};
    for (const header of headers) {
      const value = source[header];
      row[header] = typeof value === "string" ? value.slice(0, 4000) : value === null || value === undefined ? "" : String(value).slice(0, 4000);
    }
    rows.push(row);
  }
  if (rows.length === 0) return "No readable rows were supplied.";

  const mappingInput = record.mapping && typeof record.mapping === "object" ? (record.mapping as Record<string, unknown>) : {};
  const mapping: ColumnMapping = detectMapping(headers);
  for (const header of headers) {
    const value = mappingInput[header];
    if (typeof value === "string" && value.trim() === "") mapping[header] = "";
    else if (typeof value === "string" && mapping[header] !== value) {
      const claimed = Object.entries(mapping).find(([key, field]) => key !== header && field === value);
      if (claimed) mapping[claimed[0]] = "";
      mapping[header] = value as ColumnMapping[string];
    }
  }

  const layout: "records" | "matrix" | "grossboard" =
    record.layout === "matrix" ? "matrix" : record.layout === "grossboard" ? "grossboard" : "records";
  const fileName = typeof record.fileName === "string" && record.fileName.trim() ? record.fileName.trim().slice(0, 180) : "Pasted manifest";
  const source: SourceKind = SOURCES.includes(record.source as SourceKind) ? (record.source as SourceKind) : "paste";
  const sheetName = typeof record.sheetName === "string" && record.sheetName.trim() ? record.sheetName.trim().slice(0, 120) : null;

  return { layout, fileName, source, sheetName, headers: headers.slice(0, 200), rows, mapping };
}

export async function GET() {
  const db = getDb();
  if (!db) return Response.json({ ok: true, history: [], demo: true });

  try {
    const batches = await db
      .select({
        id: importBatches.id,
        fileName: importBatches.fileName,
        source: importBatches.source,
        layout: importBatches.layout,
        sheetName: importBatches.sheetName,
        rowCount: importBatches.rowCount,
        columnCount: importBatches.columnCount,
        createdAt: importBatches.createdAt,
      })
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(12);

    const history: BatchSummary[] = batches.map((batch) => ({
      ...batch,
      source: batch.source as SourceKind,
      layout: (batch.layout === "matrix" || batch.layout === "grossboard" ? batch.layout : "records") as Layout,
      createdAt: batch.createdAt.toISOString(),
    }));

    return Response.json({ ok: true, history });
  } catch (error) {
    console.error("Failed to load import history", error);
    return Response.json({ ok: true, history: [], warning: "Import history is unavailable right now." });
  }
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) {
    return Response.json({ ok: false, demo: true, error: DEMO_MODE_MESSAGE }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const payload = parsePayload(body);
  if (typeof payload === "string") return badRequest(payload);

  try {
    const [saved] = await db
      .insert(importBatches)
      .values({
        fileName: payload.fileName,
        source: payload.source,
        layout: payload.layout,
        sheetName: payload.sheetName,
        rowCount: payload.rows.length,
        columnCount: payload.headers.length,
        headers: payload.headers,
        mapping: payload.mapping,
        rows: payload.rows,
      })
      .returning({
        id: importBatches.id,
        fileName: importBatches.fileName,
        source: importBatches.source,
        layout: importBatches.layout,
        sheetName: importBatches.sheetName,
        rowCount: importBatches.rowCount,
        columnCount: importBatches.columnCount,
        createdAt: importBatches.createdAt,
      });

    const summary: BatchSummary = {
      ...saved,
      source: saved.source as SourceKind,
      layout: (saved.layout === "matrix" || saved.layout === "grossboard" ? saved.layout : "records") as Layout,
      createdAt: saved.createdAt.toISOString(),
    };

    return Response.json({ ok: true, batch: summary }, { status: 201 });
  } catch (error) {
    console.error("Failed to save import", error);
    return Response.json({ ok: false, error: "Could not save this import. The parsed data is still on screen." }, { status: 500 });
  }
}
