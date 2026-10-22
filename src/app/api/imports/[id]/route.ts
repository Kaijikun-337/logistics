import { eq } from "drizzle-orm";

import { DEMO_MODE_MESSAGE, getDb } from "@/db";
import { importBatches } from "@/db/schema";
import type { Batch, Layout, SourceKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const db = getDb();
  if (!db) return Response.json({ ok: false, demo: true, error: DEMO_MODE_MESSAGE }, { status: 503 });

  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return Response.json({ ok: false, error: "Invalid import id." }, { status: 400 });

  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (!batch) return Response.json({ ok: false, error: "Import not found." }, { status: 404 });

    const payload: Batch = {
      id: batch.id,
      fileName: batch.fileName,
      source: batch.source as SourceKind,
      layout: (batch.layout === "matrix" || batch.layout === "grossboard" ? batch.layout : "records") as Layout,
      sheetName: batch.sheetName,
      rowCount: batch.rowCount,
      columnCount: batch.columnCount,
      createdAt: batch.createdAt.toISOString(),
      headers: batch.headers,
      rows: batch.rows,
      mapping: batch.mapping,
    };

    return Response.json({ ok: true, batch: payload });
  } catch (error) {
    console.error("Failed to load import", error);
    return Response.json({ ok: false, error: "Could not load this import." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const db = getDb();
  if (!db) return Response.json({ ok: false, demo: true, error: DEMO_MODE_MESSAGE }, { status: 503 });

  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return Response.json({ ok: false, error: "Invalid import id." }, { status: 400 });

  try {
    const deleted = await db.delete(importBatches).where(eq(importBatches.id, id)).returning({ id: importBatches.id });
    if (deleted.length === 0) return Response.json({ ok: false, error: "Import not found." }, { status: 404 });
    return Response.json({ ok: true, id });
  } catch (error) {
    console.error("Failed to delete import", error);
    return Response.json({ ok: false, error: "Could not delete this import." }, { status: 500 });
  }
}
