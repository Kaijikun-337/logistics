import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import type { CanonicalField, ColumnMapping, RawRow, SourceKind } from "@/lib/types";

/**
 * A parsed spreadsheet saved by an operator. Rows are stored as JSONB because
 * every manifest has a different shape — the mapping records how the columns
 * were resolved against our canonical logistics fields.
 */
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  source: text("source").$type<SourceKind>().notNull().default("paste"),
  layout: text("layout").$type<"records" | "matrix" | "grossboard">().notNull().default("records"),
  sheetName: text("sheet_name"),
  rowCount: integer("row_count").notNull(),
  columnCount: integer("column_count").notNull(),
  headers: jsonb("headers").$type<string[]>().notNull(),
  mapping: jsonb("mapping").$type<ColumnMapping>().notNull(),
  rows: jsonb("rows").$type<RawRow[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ImportBatchRow = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;

/**
 * Header names the team has confirmed by hand. Next time the same header shows
 * up — in any file — it is mapped automatically, which is how the parser gets
 * better at a company's particular spreadsheet dialect without config files.
 */
export const columnAliases = pgTable("column_aliases", {
  id: serial("id").primaryKey(),
  aliasKey: text("alias_key").notNull().unique(),
  header: text("header").notNull(),
  field: text("field").$type<CanonicalField>().notNull(),
  hits: integer("hits").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ColumnAliasRow = typeof columnAliases.$inferSelect;
