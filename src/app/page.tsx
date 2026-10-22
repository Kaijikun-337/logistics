import { desc } from "drizzle-orm";

import { ImportWorkspace } from "@/components/import-workspace";
import { getDb, isDatabaseConfigured } from "@/db";
import { columnAliases, importBatches } from "@/db/schema";
import { FIELDS } from "@/lib/fields";
import type { AliasMap } from "@/lib/infer";
import type { BatchSummary, CanonicalField, Layout, SourceKind } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadHistory(): Promise<BatchSummary[]> {
  const db = getDb();
  if (!db) return [];

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

    return batches.map((batch) => ({
      ...batch,
      source: batch.source as SourceKind,
      layout: (batch.layout === "matrix" || batch.layout === "grossboard" ? batch.layout : "records") as Layout,
      createdAt: batch.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("Could not load import history", error);
    return [];
  }
}

async function loadAliases(): Promise<AliasMap> {
  const db = getDb();
  if (!db) return {};

  try {
    const rows = await db.select({ aliasKey: columnAliases.aliasKey, field: columnAliases.field }).from(columnAliases);
    const valid = new Set<string>(FIELDS.map((field) => field.key));
    const aliases: AliasMap = {};
    for (const row of rows) {
      if (valid.has(row.field)) aliases[row.aliasKey] = row.field as CanonicalField;
    }
    return aliases;
  } catch (error) {
    console.error("Could not load learned column names", error);
    return {};
  }
}

export default async function HomePage() {
  const [history, aliases] = await Promise.all([loadHistory(), loadAliases()]);

  return (
    <ImportWorkspace
      initialHistory={history}
      initialAliases={aliases}
      demoMode={!isDatabaseConfigured}
    />
  );
}
