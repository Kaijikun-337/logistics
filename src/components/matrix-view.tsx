"use client";

import { useState } from "react";

import { Banknote, Download, Grid, Layers, Table as TableIcon } from "@/components/icons";
import { formatMatrixCell, matrixToRecords, type MatrixTable } from "@/lib/inspect";
import { formatNumber } from "@/lib/fields";
import { toCsv } from "@/lib/parse";
import type { Layout } from "@/lib/types";

type Props = {
  table: MatrixTable;
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
};

function downloadCsv(table: MatrixTable) {
  const { headers, rows } = matrixToRecords(table);
  const csv = toCsv(headers, rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "waypoint-matrix.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function LayoutSwitch({ layout, onLayoutChange, compact = false }: { layout: Layout; onLayoutChange: (layout: Layout) => void } & { compact?: boolean }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-canvas/70 p-0.5">
      <button
        type="button"
        onClick={() => onLayoutChange("matrix")}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
          layout === "matrix" ? "bg-surface text-brand shadow-[0_1px_2px_rgba(19,26,23,0.08)]" : "text-muted hover:text-ink"
        }`}
        title="Keep the sheet's own orientation"
      >
        <Grid className="h-3.5 w-3.5" />
        Original layout
      </button>
      <button
        type="button"
        onClick={() => onLayoutChange("records")}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
          layout === "records" ? "bg-surface text-brand shadow-[0_1px_2px_rgba(19,26,23,0.08)]" : "text-muted hover:text-ink"
        }`}
        title="One row per shipment"
      >
        <TableIcon className="h-3.5 w-3.5" />
        {compact ? "Records" : "One row per record"}
      </button>
    </div>
  );
}

export function MatrixView({ table, layout, onLayoutChange }: Props) {
  const [showTotals, setShowTotals] = useState(true);
  const numericRows = table.rows.filter((row) => !row.isTotal && row.total !== null);
  const rowMax = Math.max(1, ...numericRows.map((row) => Math.abs(row.total ?? 0)));

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-ink">
              {table.title ?? `${table.rowLabelHeading} × ${table.periodColumns ? "period" : "column"}`}
            </p>
            <p className="num text-[10.5px] text-muted">
              {table.rows.length} rows × {table.columnLabels.length} columns kept as-is
              {table.periodColumns ? " · columns are dates" : ""}
              {table.metricRows ? " · rows are metrics" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTotals((current) => !current)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
              showTotals ? "border-brand/30 bg-brand-soft text-brand" : "border-line bg-surface text-ink-soft hover:border-brand/30"
            }`}
            title="Show row and column totals"
          >
            <Banknote className="h-3.5 w-3.5" />
            Totals
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(table)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <LayoutSwitch layout={layout} onLayoutChange={onLayoutChange} />
        </div>
      </div>

      <div className="scroll-thin max-h-[600px] overflow-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-canvas/95 backdrop-blur">
              <th className="sticky left-0 z-20 min-w-[160px] border-r border-b border-line bg-canvas/95 px-3 py-2 text-[10.5px] font-semibold tracking-[0.08em] text-muted uppercase backdrop-blur">
                {table.rowLabelHeading}
              </th>
              {table.columnLabels.map((label) => (
                <th key={label} className="min-w-[92px] border-b border-line px-2.5 py-2 text-right">
                  <span className="block text-[10.5px] font-semibold whitespace-nowrap text-ink">{label}</span>
                </th>
              ))}
              {showTotals ? (
                <th className="min-w-[92px] border-b border-l border-line bg-canvas px-2.5 py-2 text-right text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                  Total
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr
                key={`${row.label}-${rowIndex}`}
                className={`border-b border-line/70 last:border-0 ${
                  row.isTotal ? "bg-brand-soft/40 font-medium" : "hover:bg-brand-soft/25"
                }`}
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[240px] border-r border-line bg-surface px-3 py-2 text-left text-[12px] font-medium text-ink"
                >
                  <span className="flex items-center gap-1.5">
                    {row.label}
                    {row.isTotal ? (
                      <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-brand uppercase">
                        total
                      </span>
                    ) : null}
                  </span>
                  {showTotals && row.total !== null ? (
                    <span className="mt-1 block h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-canvas-deep">
                      <span
                        className="block h-full rounded-full bg-brand/60"
                        style={{ width: `${Math.max(3, (Math.abs(row.total) / rowMax) * 100)}%` }}
                      />
                    </span>
                  ) : null}
                </th>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={`${row.label}-${cellIndex}`}
                    className={`px-2.5 py-2 text-right whitespace-nowrap ${
                      cell.kind === "number" || cell.kind === "percent"
                        ? "num font-medium text-ink"
                        : cell.kind === "date"
                          ? "num text-ink-soft"
                          : cell.kind === "empty"
                            ? "text-muted/40"
                            : "text-ink-soft"
                    }`}
                  >
                    {cell.kind === "empty" ? "—" : formatMatrixCell(cell)}
                  </td>
                ))}
                {showTotals ? (
                  <td className="num border-l border-line bg-canvas/50 px-2.5 py-2 text-right font-semibold text-ink">
                    {row.total === null ? <span className="text-muted/50">—</span> : formatNumber(row.total, 2)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          {showTotals ? (
            <tfoot>
              <tr className="border-t border-line bg-canvas/80">
                <th scope="row" className="sticky left-0 z-10 border-r border-line bg-canvas/80 px-3 py-2 text-left text-[11px] font-semibold text-ink">
                  Column total
                </th>
                {table.columnTotals.map((total, index) => (
                  <td key={`col-total-${index}`} className="num px-2.5 py-2 text-right text-[11.5px] font-semibold text-ink">
                    {total === null ? <span className="text-muted/50">—</span> : formatNumber(total, 2)}
                  </td>
                ))}
                <td className="num border-l border-line px-2.5 py-2 text-right text-[11.5px] font-semibold text-brand">
                  {formatNumber(table.stats.numericTotal, 2)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-muted">
        <span className="num">{table.stats.numbers} numeric cells</span>
        <span className="num">{table.stats.texts} text cells</span>
        {table.stats.dates > 0 ? <span className="num">{table.stats.dates} date cells</span> : null}
        {table.totalsRowLabel ? <span>totals row “{table.totalsRowLabel}” kept in place</span> : null}
        <span className="ml-auto">Cells are stored exactly as they appear — no reshaping.</span>
      </div>
    </div>
  );
}
