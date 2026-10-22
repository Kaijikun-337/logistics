"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, ArrowRight, Check, Compass, FileSheet, Grid, Layers, Sliders, Table as TableIcon, X } from "@/components/icons";
import { LayoutSwitch, MatrixView } from "@/components/matrix-view";
import { FIELD_BY_KEY } from "@/lib/fields";
import { inspectionFromGrid, type MatrixTable } from "@/lib/inspect";
import type { BuiltSheet, SheetMeta, SheetOptions } from "@/lib/parse";
import { buildSheet } from "@/lib/parse";
import type { Layout, SourceKind } from "@/lib/types";

type Props = {
  matrix: string[][];
  meta: SheetMeta & { sheetNames?: string[] };
  options: SheetOptions;
  onOptionsChange: (options: SheetOptions) => void;
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  onCancel: () => void;
  onConfirm: (payload: { built: BuiltSheet; layout: Layout; table: MatrixTable }) => void;
  hasExistingBoard: boolean;
};

const RAW_ROW_LIMIT = 9;
const RAW_COL_LIMIT = 10;

function sourceLabel(source: SourceKind): string {
  if (source === "file") return "File upload";
  if (source === "sample") return "Demo manifest";
  return "Pasted";
}

export function TablePreview({
  matrix,
  meta,
  options,
  onOptionsChange,
  layout,
  onLayoutChange,
  onCancel,
  onConfirm,
  hasExistingBoard,
}: Props) {
  const built = useMemo(() => buildSheet(matrix, meta, options), [matrix, meta, options]);
  const inspection = useMemo(() => inspectionFromGrid(matrix), [matrix]);
  const [headerChoice, setHeaderChoice] = useState<string>(
    options.headerRow === null ? "none" : options.headerRow === "auto" || options.headerRow === undefined ? "auto" : String(options.headerRow),
  );

  useEffect(() => {
    setHeaderChoice(
      options.headerRow === null
        ? "none"
        : options.headerRow === "auto" || options.headerRow === undefined
          ? "auto"
          : String(options.headerRow),
    );
  }, [matrix, options.headerRow]);

  const analysis = built.analysis;
  const orientation = built.orientation;
  const isTransposed = orientation === "cols";

  const rawWidth = Math.min(RAW_COL_LIMIT, Math.max(...matrix.map((row) => row.length), 1));
  const rawRows = matrix.slice(0, RAW_ROW_LIMIT);
  const detectedHeaderIndex = built.headerRowIndex;

  const labelledFields = analysis.rowLabelFields.filter((entry) => entry.field);
  const previewHeaders = built.sheet.headers.slice(0, 8);
  const previewRows = built.sheet.rows.slice(0, 4);
  const empty = built.sheet.rows.length === 0;

  const applyHeaderChoice = (choice: string) => {
    setHeaderChoice(choice);
    onOptionsChange({
      ...options,
      headerRow: choice === "none" ? null : choice === "auto" ? "auto" : Number(choice),
    });
  };

  const headerRowOptions = Array.from({ length: Math.min(matrix.length, 8) }, (_, index) => index);

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pr-3 pl-1.5 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
            <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-white">02</span>
            Check the shape
          </div>
          <h1 className="mt-4 text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink">
            Here&apos;s how we read it
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
            Nothing is saved yet. Confirm how the rows and columns should be interpreted — this is the only step that
            still needs a human eye on unusual sheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LayoutSwitch layout={layout} onLayoutChange={onLayoutChange} compact />
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-medium text-ink-soft transition hover:border-ink/20 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ built, layout, table: inspection.table })}
            disabled={empty && layout === "records"}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-line-strong"
          >
            <Check className="h-4 w-4" strokeWidth={2.2} />
            {layout === "matrix"
              ? `Open sheet · ${inspection.table.rows.length} rows × ${inspection.table.columnLabels.length}`
              : empty
                ? "No rows to import"
                : `Open board · ${built.sheet.rows.length} rows`}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-soft">
          <FileSheet className="h-3.5 w-3.5 text-brand" />
          {meta.fileName}
        </span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-muted">{sourceLabel(meta.source)}</span>
        {meta.sheetName ? (
          <span className="rounded-full border border-brand/25 bg-brand-soft px-2.5 py-1 text-[11.5px] font-medium text-brand">
            {meta.sheetName}
          </span>
        ) : null}
        {meta.sheetNames && meta.sheetNames.length > 1 ? (
          <span className="text-[11.5px] text-muted">workbook has {meta.sheetNames.length} sheets</span>
        ) : null}
        <span className="num text-[11.5px] text-muted">
          {matrix.length} raw rows · {rawWidth}+ columns
        </span>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          {/* What we detected */}
          <div
            className={`rounded-2xl border p-4 ${
              layout === "matrix" ? "border-indigo-200 bg-indigo-50/60" : "border-brand/20 bg-brand-soft/50"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className={`h-4 w-4 ${layout === "matrix" ? "text-indigo-600" : "text-brand"}`} />
                <p className="text-[13px] font-semibold text-ink">How this sheet reads</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium tracking-wide text-muted uppercase">
                inspected · {Math.round(inspection.confidence * 100)}% sure
              </span>
            </div>

            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface/80 px-2.5 py-2">
                <dt className="text-[9.5px] font-semibold tracking-[0.1em] text-muted uppercase">Title</dt>
                <dd className="truncate text-[11.5px] font-medium text-ink" title={inspection.table.title ?? undefined}>
                  {inspection.table.title ?? "none above the table"}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface/80 px-2.5 py-2">
                <dt className="text-[9.5px] font-semibold tracking-[0.1em] text-muted uppercase">Column labels from</dt>
                <dd className="text-[11.5px] font-medium text-ink">
                  {inspection.headerRowIndex === null ? "no header row — auto-named" : `row ${inspection.headerRowIndex + 1}`}
                  <span className="ml-1.5 font-normal text-muted">({inspection.table.columnLabels.length} columns)</span>
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface/80 px-2.5 py-2">
                <dt className="text-[9.5px] font-semibold tracking-[0.1em] text-muted uppercase">Row names from</dt>
                <dd className="truncate text-[11.5px] font-medium text-ink">
                  {inspection.labelColumnIndex === null ? "no name column" : `“${inspection.table.rowLabelHeading}” column`}
                  <span className="ml-1.5 font-normal text-muted">({inspection.table.rows.length} rows)</span>
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface/80 px-2.5 py-2">
                <dt className="text-[9.5px] font-semibold tracking-[0.1em] text-muted uppercase">Values</dt>
                <dd className="num text-[11.5px] font-medium text-ink">
                  {inspection.table.stats.numbers} numbers · {inspection.table.stats.texts} text
                  {inspection.table.stats.dates > 0 ? ` · ${inspection.table.stats.dates} dates` : ""}
                </dd>
              </div>
            </dl>

            <ul className="mt-2 space-y-1">
              {inspection.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ink-soft">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                  {reason}
                </li>
              ))}
            </ul>

            <p className="mt-2 rounded-lg border border-line bg-white/70 px-2.5 py-1.5 text-[11px] leading-snug text-ink-soft">
              {layout === "matrix" ? (
                <>
                  <span className="font-semibold">Keeping the sheet as it is:</span> rows stay rows and columns stay
                  columns. Nothing is transposed — you get the same table, cleanly typed, with totals.
                </>
              ) : (
                <>
                  <span className="font-semibold">Reshaping into records:</span> rows become shipments and fields become
                  columns{inspection.suggestedLayout === "matrix" ? " — this flips your metric table, so the original layout may be what you want." : "."}
                </>
              )}
            </p>
          </div>

          {/* Raw grid */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <Grid className="h-3.5 w-3.5 text-brand" />
                <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Raw sheet</p>
              </div>
              <p className="text-[11px] text-muted">first {rawRows.length} rows · {rawWidth} columns</p>
            </div>
            <div className="scroll-thin overflow-x-auto">
              <table className="border-collapse text-[11.5px]">
                <thead>
                  <tr className="bg-canvas/80">
                    <th className="w-8 border-r border-b border-line px-1.5 py-1 font-mono text-[9.5px] font-normal text-muted" />
                    {Array.from({ length: rawWidth }, (_, index) => (
                      <th
                        key={index}
                        className={`border-r border-b border-line px-2 py-1 font-mono text-[9.5px] font-normal ${
                          isTransposed && index === 0 ? "bg-indigo-100/70 text-indigo-700" : "text-muted"
                        }`}
                      >
                        {String.fromCharCode(65 + index)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.map((row, rowIndex) => {
                    const isHeaderRow = !isTransposed && detectedHeaderIndex === rowIndex;
                    return (
                      <tr
                        key={rowIndex}
                        className={
                          isHeaderRow
                            ? "bg-emerald-50/80"
                            : isTransposed && rowIndex === 0
                              ? "bg-indigo-50/60"
                              : "bg-surface"
                        }
                      >
                        <td className="border-r border-b border-line px-1.5 py-1 text-center font-mono text-[9.5px] text-muted">
                          {rowIndex + 1}
                        </td>
                        {Array.from({ length: rawWidth }, (_, colIndex) => {
                          const value = row[colIndex] ?? "";
                          const isLabelColumn = isTransposed && colIndex === 0;
                          return (
                            <td
                              key={colIndex}
                              className={`max-w-[150px] truncate border-r border-b border-line px-2 py-1 ${
                                isHeaderRow ? "font-semibold text-emerald-900" : isLabelColumn ? "font-medium text-indigo-900" : "text-ink-soft"
                              }`}
                              title={value}
                            >
                              {value || <span className="text-muted/40">·</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-muted">
              {!isTransposed ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-emerald-200" />
                  detected header row {detectedHeaderIndex === null ? "— none" : detectedHeaderIndex + 1}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-indigo-200" />
                  label column · top row becomes fields
                </span>
              )}
              <span>Rows below the header become shipments.</span>
            </div>
          </div>

          {layout === "matrix" ? (
            <MatrixView table={inspection.table} layout={layout} onLayoutChange={onLayoutChange} />
          ) : null}

          {/* Resulting table */}
          <div className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${layout === "matrix" ? "hidden" : ""}`}>
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <TableIcon className="h-3.5 w-3.5 text-brand" />
                <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Resulting table</p>
              </div>
              <p className="num text-[11px] text-muted">
                {built.sheet.rows.length} rows × {built.sheet.headers.length} columns
              </p>
            </div>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="bg-canvas/80">
                    {previewHeaders.map((header) => (
                      <th key={header} className="border-r border-b border-line px-2.5 py-1.5 font-semibold whitespace-nowrap text-ink last:border-r-0">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-b border-line/70 last:border-0">
                      {previewHeaders.map((header) => (
                        <td key={header} className="max-w-[170px] truncate border-r border-line/70 px-2.5 py-1.5 text-ink-soft last:border-r-0">
                          {row[header] || <span className="text-muted/40">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {previewRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-[12px] text-muted">No rows with this interpretation.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-brand" />
              <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">Record interpretation</p>
            </div>
            <p className="mt-1 text-[10.5px] leading-snug text-muted">
              Only used when reshaping into records. “Original layout” keeps the sheet untouched.
            </p>

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => onOptionsChange({ ...options, orientation: "rows", headerRow: "auto" })}
                className={`rounded-xl border p-2.5 text-left transition ${
                  orientation === "rows" ? "border-brand bg-brand-soft/70" : "border-line bg-canvas/40 hover:border-line-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink">Rows are records</p>
                  {analysis.orientation === "rows" ? (
                    <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-brand uppercase">
                      detected
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                  One shipment per row, fields across the top.
                </p>
              </button>

              <button
                type="button"
                onClick={() => onOptionsChange({ ...options, orientation: "cols", headerRow: 0 })}
                className={`rounded-xl border p-2.5 text-left transition ${
                  orientation === "cols" ? "border-indigo-400 bg-indigo-50/80" : "border-line bg-canvas/40 hover:border-line-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink">Columns are records</p>
                  {analysis.orientation === "cols" ? (
                    <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-indigo-600 uppercase">
                      detected
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                  Flip it — dates across the top, metrics like Rate/Miles down the side.
                </p>
              </button>
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <label className="text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase" htmlFor="header-row">
                Header row
              </label>
              <select
                id="header-row"
                value={headerChoice}
                onChange={(event) => applyHeaderChoice(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-canvas/60 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-brand/50"
              >
                <option value="auto">Auto-detect</option>
                {headerRowOptions.map((index) => (
                  <option key={index} value={index}>
                    Row {index + 1} — {matrix[index]?.filter(Boolean).slice(0, 2).join(" · ").slice(0, 34) || "blank"}
                  </option>
                ))}
                <option value="none">No header (auto-number columns)</option>
              </select>
              <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
                {isTransposed
                  ? "For a sideways table this is the row that becomes the field names (usually the top row)."
                  : "Pick the row that holds your field names if auto-detect guessed wrong."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOptionsChange({ orientation: "auto", headerRow: "auto" })}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas/60 px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
            >
              <Layers className="h-3.5 w-3.5" />
              Re-run auto-detect
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Alert className="h-3.5 w-3.5 text-accent" />
              <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">Notes before import</p>
            </div>
            {built.sheet.warnings.length === 0 ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                Nothing unusual found. Everything below the header will become a shipment row.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {built.sheet.warnings.slice(0, 6).map((warning) => (
                  <li key={warning} className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
            {built.sheet.rows.length === 0 ? (
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                This interpretation produces no rows — try another orientation or header row.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line bg-canvas-deep/40 p-4">
            <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">What happens next</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              We save this parsed version to your import history{hasExistingBoard ? ", replacing the board on screen" : ""}.
              Column meanings are then inferred automatically, and anything you correct is remembered for future files.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
