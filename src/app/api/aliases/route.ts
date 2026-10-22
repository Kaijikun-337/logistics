import { sql } from "drizzle-orm";

import { DEMO_MODE_MESSAGE, getDb } from "@/db";
import { columnAliases } from "@/db/schema";
import { FIELDS, normalizeText } from "@/lib/fields";
import type { CanonicalField } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_FIELDS = new Set<string>(FIELDS.map((field) => field.key));

export async function GET() {
  const db = getDb();
  if (!db) return Response.json({ ok: true, aliases: {}, demo: true });

  try {
    const rows = await db
      .select({ aliasKey: columnAliases.aliasKey, field: columnAliases.field, hits: columnAliases.hits })
      .from(columnAliases);

    const aliases: Record<string, CanonicalField> = {};
    for (const row of rows) {
      if (VALID_FIELDS.has(row.field)) aliases[row.aliasKey] = row.field;
    }

    return Response.json({ ok: true, aliases });
  } catch (error) {
    console.error("Failed to load column aliases", error);
    return Response.json({ ok: true, aliases: {} });
  }
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) return Response.json({ ok: false, demo: true, error: DEMO_MODE_MESSAGE }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const header = typeof record.header === "string" ? record.header.trim() : "";
  const field = typeof record.field === "string" ? record.field.trim() : "";

  if (!header) return Response.json({ ok: false, error: "A column header is required." }, { status: 400 });
  if (!VALID_FIELDS.has(field)) return Response.json({ ok: false, error: "Unknown logistics field." }, { status: 400 });

  const aliasKey = normalizeText(header);
  if (!aliasKey) return Response.json({ ok: false, error: "That header has no usable characters." }, { status: 400 });

  try {
    const [saved] = await db
      .insert(columnAliases)
      .values({ aliasKey, header: header.slice(0, 180), field: field as CanonicalField })
      .onConflictDoUpdate({
        target: columnAliases.aliasKey,
        set: {
          field: field as CanonicalField,
          header: header.slice(0, 180),
          hits: sql`${columnAliases.hits} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ aliasKey: columnAliases.aliasKey, field: columnAliases.field, hits: columnAliases.hits });

    return Response.json({ ok: true, alias: saved });
  } catch (error) {
    console.error("Failed to save column alias", error);
    return Response.json({ ok: false, error: "Could not remember that column name." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const db = getDb();
  if (!db) return Response.json({ ok: false, demo: true, error: DEMO_MODE_MESSAGE }, { status: 503 });

  const url = new URL(request.url);
  const header = url.searchParams.get("header");
  if (!header) return Response.json({ ok: false, error: "A header is required." }, { status: 400 });

  try {
    await db.delete(columnAliases).where(sql`${columnAliases.aliasKey} = ${normalizeText(header)}`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete column alias", error);
    return Response.json({ ok: false, error: "Could not forget that column name." }, { status: 500 });
  }
}
