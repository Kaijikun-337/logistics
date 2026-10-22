"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Banknote,
  Building,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Download,
  FileSheet,
  Filter,
  Grid,
  Layers,
  Pin,
  Plus,
  Search,
  Sliders,
  Sparkle,
  Table as TableIcon,
  Truck,
  Weight,
  X,
} from "@/components/icons";
import { buildInsights } from "@/lib/analytics";
import {
  classifyMode,
  classifyStatus,
  FIELD_BY_KEY,
  FIELDS,
  formatDate,
  formatMoney,
  formatNumber,
  headerForField,
  kindForField,
  normalizeCurrency,
  parseDateParts,
  parseNumeric,
  STATUS_LABEL,
  toneClasses,
  type StatusInfo,
} from "@/lib/fields";
import { sourceLabelFor, type ColumnMeta } from "@/lib/infer";
import type { MatrixTable } from "@/lib/inspect";
import { LayoutSwitch, MatrixView } from "@/components/matrix-view";
import { toCsv } from "@/lib/parse";
import { formatTimestamp, sourceLabel } from "@/lib/time";
import type { BatchSummary, CanonicalField, ColumnMapping, Layout, ParsedSheet, RawRow } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error" | "demo";

type Props = {
  sheet: ParsedSheet;
  mapping: ColumnMapping;
  mappingMeta: Record<string, ColumnMeta>;
  onMappingChange: (header: string, field: CanonicalField | "") => void;
  onResetMapping: () => void;
  onClear: () => void;
  saveState: SaveState;
  savedBatch: BatchSummary | null;
  onRetrySave: () => void;
  onReopenPreview?: () => void;
  demoMode?: boolean;
  layout: Layout;
  matrix: MatrixTable | null;
  onLayoutChange: (layout: Layout) => void;
};

const PAGE_SIZES = [10, 25, 50, 100];
const GROUP_ORDER: FieldGroup[] = ["Identity", "Route", "Timing", "Cargo", "Commercial"];
type FieldGroup = "Identity" | "Route" | "Timing" | "Cargo" | "Commercial";

function StatusPill({ info, compact = false }: { info: StatusInfo; compact?: boolean }) {
  const tone = toneClasses(info.tone);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${tone.border} ${tone.bg} ${tone.text} ${
        compact ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]"
      } font-medium whitespace-nowrap`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {info.label}
    </span>
  );
}

function ModeChip({ value }: { value: string }) {
  const label = classifyMode(value) || value;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide text-ink-soft uppercase">
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  progress,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  progress?: number | null;
  accent?: "brand" | "accent" | "plain";
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">{label}</p>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
            accent === "accent" ? "border-accent/20 bg-accent-soft text-accent" : "border-brand/15 bg-brand-soft text-brand"
          }`}
        >
          {icon}
        </span>
      </div>
      <p className="num mt-2.5 text-[22px] leading-none font-semibold tracking-[-0.02em] break-words text-ink sm:text-[24px]">{value}</p>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">{hint}</p>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-deep">
          <div
            className="h-full origin-left rounded-full bg-brand animate-bar"
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Drawer({
  open,
  onClose,
  label,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close panel" onClick={onClose} className="animate-fade absolute inset-0 cursor-default bg-ink/35 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`animate-slide-in relative flex h-full w-full ${width} flex-col border-l border-line bg-surface shadow-lift`}
      >
        {children}
      </div>
    </div>
  );
}

function formatFieldValue(field: CanonicalField | "", value: string, currency: string): string {
  if (!value) return "—";
  switch (kindForField(field)) {
    case "currency": {
      const numeric = parseNumeric(value);
      return numeric === null ? value : formatMoney(numeric, currency);
    }
    case "number": {
      const numeric = parseNumeric(value);
      return numeric === null ? value : formatNumber(numeric, 1);
    }
    case "date":
      return formatDate(value);
    default:
      return value;
  }
}

export function DataWorkbench({
  sheet,
  mapping,
  mappingMeta,
  onMappingChange,
  onResetMapping,
  onClear,
  saveState,
  savedBatch,
  onRetrySave,
  onReopenPreview,
  demoMode,
  layout,
  matrix,
  onLayoutChange,
}: Props) {
  const insights = useMemo(() => buildInsights(sheet.headers, sheet.rows, mapping), [sheet.headers, sheet.rows, mapping]);
  const statusHeader = insights.statusHeader;
  const currencyHeader = headerForField(sheet.headers, mapping, "currency");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusInfo["key"] | "all">("all");
  const [sortHeader, setSortHeader] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [allColumns, setAllColumns] = useState(false);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [hideInferred, setHideInferred] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [query, statusFilter, sortHeader, sortDir, pageSize, sheet]);

  useEffect(() => {
    setHideInferred(false);
  }, [sheet]);

  const inferredCount = sheet.headers.filter((header) => mappingMeta[header]?.source === "values").length;
  const learnedCount = sheet.headers.filter((header) => mappingMeta[header]?.source === "learned").length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let entries = sheet.rows.map((row, index) => ({ row, index }));

    if (statusFilter !== "all" && statusHeader) {
      entries = entries.filter((entry) => classifyStatus(entry.row[statusHeader]).key === statusFilter);
    }

    if (needle) {
      entries = entries.filter((entry) => sheet.headers.some((header) => (entry.row[header] ?? "").toLowerCase().includes(needle)));
    }

    if (sortHeader) {
      const kind = kindForField(mapping[sortHeader]);
      const direction = sortDir === "asc" ? 1 : -1;
      entries = [...entries].sort((a, b) => {
        const left = a.row[sortHeader] ?? "";
        const right = b.row[sortHeader] ?? "";
        if (left === right) return a.index - b.index;
        if (left === "") return 1;
        if (right === "") return -1;
        if (kind === "currency" || kind === "number") {
          const ln = parseNumeric(left);
          const rn = parseNumeric(right);
          if (ln !== null && rn !== null) return (ln - rn) * direction;
        }
        if (kind === "date") {
          const lp = parseDateParts(left);
          const rp = parseDateParts(right);
          if (lp && rp) {
            const lv = lp.y * 10000 + lp.m * 100 + lp.d;
            const rv = rp.y * 10000 + rp.m * 100 + rp.d;
            return (lv - rv) * direction;
          }
        }
        return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * direction;
      });
    }

    return entries;
  }, [sheet.rows, sheet.headers, query, statusFilter, statusHeader, sortHeader, sortDir, mapping]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const mappedUniqueHeaders = useMemo(
    () =>
      FIELDS.map((field) => headerForField(sheet.headers, mapping, field.key)).filter(
        (header): header is string => Boolean(header),
      ),
    [sheet.headers, mapping],
  );

  const rawHeaders = useMemo(() => sheet.headers.filter((header) => !mapping[header]), [sheet.headers, mapping]);

  const visibleHeaders = useMemo(() => {
    if (allColumns) return sheet.headers;
    if (mappedUniqueHeaders.length > 0) return [...mappedUniqueHeaders, ...rawHeaders.slice(0, 2)];
    return sheet.headers.slice(0, 8);
  }, [allColumns, mappedUniqueHeaders, rawHeaders, sheet.headers]);

  const rowCurrency = useCallback(
    (row: RawRow) => normalizeCurrency(currencyHeader ? row[currencyHeader] : "") || insights.currency,
    [currencyHeader, insights.currency],
  );

  const statusBuckets = insights.statusBuckets.filter((bucket) => bucket.key !== "unknown" || statusFilter === "unknown");
  const exceptionCount =
    (insights.statusBuckets.find((bucket) => bucket.key === "exception")?.count ?? 0) +
    (insights.statusBuckets.find((bucket) => bucket.key === "delayed")?.count ?? 0);

  const detailPosition = detailIndex === null ? -1 : filtered.findIndex((entry) => entry.index === detailIndex);
  const detailRow = detailIndex === null ? null : sheet.rows[detailIndex];
  const detailRowNumber = detailIndex === null ? 0 : detailIndex + 1;

  const goPrev = useCallback(() => {
    if (detailPosition > 0) setDetailIndex(filtered[detailPosition - 1].index);
  }, [detailPosition, filtered]);

  const goNext = useCallback(() => {
    if (detailPosition >= 0 && detailPosition < filtered.length - 1) setDetailIndex(filtered[detailPosition + 1].index);
  }, [detailPosition, filtered]);

  const closeDetail = useCallback(() => setDetailIndex(null), []);
  const closeMapping = useCallback(() => setMappingOpen(false), []);

  useEffect(() => {
    if (detailIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailIndex, goNext, goPrev]);

  const toggleSort = (header: string) => {
    if (sortHeader === header) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortHeader(null);
        setSortDir("asc");
      }
    } else {
      setSortHeader(header);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const csv = toCsv(sheet.headers, filtered.map((entry) => entry.row));
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const base = sheet.fileName.replace(/\.[^.]+$/, "") || "waypoint-export";
    link.href = url;
    link.download = `${base}-parsed.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderCell = (header: string, row: RawRow) => {
    const value = row[header] ?? "";
    if (!value) return <span className="text-muted/50">—</span>;
    const field = mapping[header];

    switch (kindForField(field)) {
      case "status":
        return <StatusPill info={classifyStatus(value)} compact />;
      case "currency": {
        const numeric = parseNumeric(value);
        if (numeric === null) return <span>{value}</span>;
        return <span className="num font-medium text-ink">{formatMoney(numeric, rowCurrency(row))}</span>;
      }
      case "number": {
        const numeric = parseNumeric(value);
        return <span className="num">{numeric === null ? value : formatNumber(numeric, 1)}</span>;
      }
      case "date":
        return <span className="num whitespace-nowrap text-ink-soft">{formatDate(value)}</span>;
      case "mode":
        return <ModeChip value={value} />;
      default:
        if (field === "shipmentId") return <span className="font-mono text-[12px] font-medium tracking-tight text-ink">{value}</span>;
        if (field === "customer") return <span className="font-medium text-ink">{value}</span>;
        if (field === "notes")
          return (
            <span className="block max-w-[240px] truncate text-ink-soft" title={value}>
              {value}
            </span>
          );
        return <span className="text-ink-soft">{value}</span>;
    }
  };

  const saveChip = () => {
    if (saveState === "saving") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-muted">
          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-line-strong border-t-brand" />
          Saving…
        </span>
      );
    }
    if (saveState === "saved" && savedBatch) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <Check className="h-3 w-3" strokeWidth={2.4} />
          Saved · #{savedBatch.id}
        </span>
      );
    }
    if (saveState === "demo") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
          <Alert className="h-3 w-3" />
          Demo mode · not saved
        </span>
      );
    }
    if (saveState === "error") {
      return (
        <button
          type="button"
          onClick={onRetrySave}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
        >
          <Alert className="h-3 w-3" />
          Not saved · retry
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-muted">
        {demoMode ? "Not persisted (demo)" : "Local only"}
      </span>
    );
  };

  return (
    <div className="animate-rise">
      {/* Import identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brand shadow-card">
            <FileSheet className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="max-w-[46ch] truncate text-lg font-semibold tracking-[-0.01em] text-ink" title={sheet.fileName}>
                {sheet.fileName}
              </h1>
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium tracking-wide text-muted uppercase">
                {sourceLabel(sheet.source)}
              </span>
              {sheet.sheetName ? (
                <span className="hidden rounded-full border border-line bg-brand-soft px-2 py-0.5 text-[10.5px] font-medium text-brand sm:inline">
                  {sheet.sheetName}
                </span>
              ) : null}
              {saveChip()}
            </div>
            <p className="mt-1 truncate text-[12px] text-muted">
              {formatNumber(sheet.rows.length)} rows · {sheet.headers.length} columns ·{" "}
              {savedBatch ? `imported ${formatTimestamp(savedBatch.createdAt)}` : "parsed just now"}
              {sheet.truncated ? " · truncated at 5,000 rows" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {matrix ? <LayoutSwitch layout={layout} onLayoutChange={onLayoutChange} compact /> : null}
          {onReopenPreview ? (
            <button
              type="button"
              onClick={onReopenPreview}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
              title="Look at the raw sheet and change how rows and columns are read"
            >
              <Grid className="h-3.5 w-3.5" />
              Table shape
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMappingOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand ${
              layout === "matrix" && matrix ? "hidden" : ""
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Columns
            <span className="rounded-full bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] text-brand">
              {insights.mappedColumns}/{insights.totalColumns}
            </span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
          >
            <Download className="h-3.5 w-3.5" />
            {layout === "matrix" && matrix ? "Export layout" : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-brand-deep"
          >
            <Plus className="h-3.5 w-3.5" />
            New import
          </button>
        </div>
      </div>

      {inferredCount > 0 && !hideInferred ? (
        <div className="animate-fade mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/25 bg-brand-soft/70 px-3.5 py-2.5">
          <Sparkle className="h-4 w-4 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-brand-deep">
            <span className="font-semibold">{inferredCount} column{inferredCount === 1 ? "" : "s"}</span> had no
            recognisable name, so they were inferred from the values. Confirm them once and Waypoint will remember the
            names for every future file.
          </p>
          <button
            type="button"
            onClick={() => setMappingOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-brand-deep"
          >
            <Sliders className="h-3.5 w-3.5" />
            Confirm mapping
          </button>
          <button
            type="button"
            onClick={() => setHideInferred(true)}
            aria-label="Dismiss"
            className="text-brand/60 transition hover:text-brand"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {sheet.warnings.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 text-[12px] text-amber-900">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            <Sparkle className="h-3.5 w-3.5" />
            {sheet.warnings.length} parsing note{sheet.warnings.length === 1 ? "" : "s"} — worth a quick look
            <ChevronRight className="ml-auto h-3.5 w-3.5 transition group-open:rotate-90" />
          </summary>
          <ul className="mt-2 space-y-1 pl-5">
            {sheet.warnings.map((warning) => (
              <li key={warning} className="list-disc text-amber-800">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Shipments"
          icon={<Truck className="h-4 w-4" />}
          value={formatNumber(insights.total)}
          hint={`${insights.mappedColumns} of ${insights.totalColumns} columns mapped to fields`}
        />
        <StatCard
          label="On-track rate"
          icon={<Compass className="h-4 w-4" />}
          value={insights.onTrackRate === null ? "—" : `${insights.onTrackRate}%`}
          hint="Delivered or moving, excluding cancellations"
          progress={insights.onTrackRate}
        />
        <StatCard
          label="Freight spend"
          icon={<Banknote className="h-4 w-4" />}
          value={insights.costTotal === null ? "—" : formatMoney(insights.costTotal, insights.currency)}
          hint={
            insights.costTotal === null
              ? "No cost column recognised"
              : insights.currencyCount > 1
                ? `${insights.currencyCount} currencies summed as-is · avg ${formatMoney(insights.costAverage ?? 0, insights.currency)}`
                : `Avg ${formatMoney(insights.costAverage ?? 0, insights.currency)} per shipment`
          }
        />
        <StatCard
          label="Needs attention"
          icon={<Alert className="h-4 w-4" />}
          accent="accent"
          value={formatNumber(exceptionCount)}
          hint={`Delayed + exceptions${insights.duplicateShipments ? ` · ${insights.duplicateShipments} duplicate IDs` : ""}`}
        />
      </div>

      {layout === "matrix" && matrix ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <MatrixView table={matrix} layout={layout} onLayoutChange={onLayoutChange} />
          <div className="space-y-3">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <p className="text-[10.5px] font-semibold tracking-[0.13em] text-indigo-700 uppercase">Original layout kept</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-indigo-900">
                This sheet is a matrix: <span className="font-semibold">{matrix.rows.length} rows</span> by{" "}
                <span className="font-semibold">{matrix.columnLabels.length} columns</span>, exactly as it appears in
                Excel. Switch to <span className="font-semibold">One row per record</span> if you want shipments,
                fields and lane analytics instead.
              </p>
              <button
                type="button"
                onClick={() => onLayoutChange("records")}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-indigo-700"
              >
                <TableIcon className="h-3.5 w-3.5" />
                Try the records view
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <p className="text-[10.5px] font-semibold tracking-[0.13em] text-muted uppercase">Row profile</p>
              <ul className="mt-2 space-y-1.5">
                {matrix.rows.slice(0, 8).map((row) => {
                  const numbers = row.cells.map((cell) => cell.numeric).filter((value): value is number => value !== null);
                  const min = numbers.length > 0 ? Math.min(...numbers) : null;
                  const max = numbers.length > 0 ? Math.max(...numbers) : null;
                  return (
                    <li key={row.label} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="truncate text-ink-soft" title={row.label}>{row.label}</span>
                      <span className="num shrink-0 text-muted">
                        {numbers.length === 0
                          ? `${row.cells.filter((cell) => cell.kind === "text").length} text`
                          : min === max
                            ? formatNumber(min ?? 0, 2)
                            : `${formatNumber(min ?? 0, 2)}–${formatNumber(max ?? 0, 2)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <p className="text-[10.5px] font-semibold tracking-[0.13em] text-muted uppercase">Reading notes</p>
              <ul className="mt-2 space-y-1.5">
                {matrix.notes.slice(0, 6).map((note) => (
                  <li key={note} className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/60" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className={layout === "matrix" && matrix ? "hidden" : ""}>
      {/* Status pipeline */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand" />
            <p className="text-[13px] font-semibold text-ink">Status pipeline</p>
            <span className="text-[11.5px] text-muted">
              {statusHeader ? `from “${statusHeader}”` : "no status column detected"}
            </span>
          </div>
          {insights.deliveryWindow ? (
            <p className="num text-[11.5px] text-muted">
              ETA window {formatDate(insights.deliveryWindow.from)} – {formatDate(insights.deliveryWindow.to)}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-canvas-deep">
          {statusBuckets.length === 0 ? <div className="h-full w-full bg-line-strong/60" /> : null}
          {statusBuckets.map((bucket) => (
            <div
              key={bucket.key}
              className={`${toneClasses(bucket.tone).dot} animate-bar h-full origin-left`}
              style={{ width: `${Math.max(bucket.percent, 1.5)}%` }}
              title={`${bucket.label}: ${bucket.count}`}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {insights.statusBuckets.map((bucket) => {
            const tone = toneClasses(bucket.tone);
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => setStatusFilter((current) => (current === bucket.key ? "all" : bucket.key))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] transition ${
                  statusFilter === bucket.key ? "border-ink/20 bg-canvas" : "border-transparent hover:bg-canvas/70"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                <span className="text-ink-soft">{bucket.label}</span>
                <span className="num font-medium text-ink">{bucket.count}</span>
              </button>
            );
          })}
          {insights.statusBuckets.length === 0 ? (
            <p className="text-[12px] text-muted">Map a column to “Status” to unlock the pipeline.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        {/* Table */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <div className="relative min-w-[190px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search any cell, customer, ID…"
                className="w-full rounded-full border border-line bg-canvas/60 py-1.5 pr-8 pl-8 text-[12.5px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/40 focus:bg-surface"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted transition hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1.5 text-[11px] text-muted">
                <Filter className="h-3 w-3" />
                {statusFilter === "all" ? "All statuses" : STATUS_LABEL[statusFilter]}
              </span>
              <button
                type="button"
                onClick={() => setAllColumns((current) => !current)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium transition ${
                  allColumns ? "border-brand/30 bg-brand-soft text-brand" : "border-line bg-surface text-ink-soft hover:border-brand/30"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                {allColumns ? "All columns" : "Key columns"}
              </button>
            </div>
          </div>

          <div className="scroll-thin max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-canvas/95 backdrop-blur">
                  <th className="w-10 border-b border-line px-2 py-2 font-mono text-[10px] font-normal text-muted">#</th>
                  {visibleHeaders.map((header) => {
                    const field = mapping[header];
                    const active = sortHeader === header;
                    const align = kindForField(field) === "currency" ? "text-right" : "text-left";
                    return (
                      <th key={header} className={`border-b border-line px-3 py-2 align-bottom ${align}`}>
                        <button
                          type="button"
                          onClick={() => toggleSort(header)}
                          className="group inline-flex max-w-[220px] flex-col items-start gap-0.5 text-left"
                          title={`Sort by ${header}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`truncate text-[11px] font-semibold tracking-[0.02em] ${active ? "text-brand" : "text-ink"}`}>
                              {header}
                            </span>
                            <ArrowUpDown
                              className={`h-3 w-3 shrink-0 transition ${active ? "text-brand" : "text-muted/40 group-hover:text-muted"}`}
                            />
                          </span>
                          <span className="text-[9.5px] font-medium tracking-[0.1em] text-muted/80 uppercase">
                            {field ? FIELD_BY_KEY[field].label : "raw"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((entry) => (
                  <tr
                    key={entry.index}
                    onClick={() => setDetailIndex(entry.index)}
                    className="group cursor-pointer border-b border-line/70 transition last:border-0 hover:bg-brand-soft/40"
                  >
                    <td className="px-2 py-2 font-mono text-[10.5px] text-muted/70">{entry.index + 1}</td>
                    {visibleHeaders.map((header) => (
                      <td key={header} className={`max-w-[280px] px-3 py-2 whitespace-nowrap ${kindForField(mapping[header]) === "currency" ? "text-right" : ""}`}>
                        {renderCell(header, entry.row)}
                      </td>
                    ))}
                  </tr>
                ))}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleHeaders.length + 1} className="px-4 py-14 text-center">
                      <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-canvas text-muted">
                          <Search className="h-4 w-4" />
                        </span>
                        <p className="text-[13px] font-medium text-ink">No shipments match those filters</p>
                        <p className="text-[12px] text-muted">Try a different search term, or clear the status filter.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setStatusFilter("all");
                          }}
                          className="mt-1 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
                        >
                          Reset filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <p className="num text-[11.5px] text-muted">
              {filtered.length === 0
                ? "0 shipments"
                : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${formatNumber(
                    filtered.length,
                  )} shipments`}
              {query || statusFilter !== "all" ? ` · filtered from ${formatNumber(sheet.rows.length)}` : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <label className="mr-1 flex items-center gap-1 text-[11px] text-muted">
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-soft outline-none"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-soft transition hover:border-brand/40 hover:text-brand disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="num px-1 text-[11px] text-muted">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-soft transition hover:border-brand/40 hover:text-brand disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Rail */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">Data quality</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  insights.qualityScore >= 80
                    ? "bg-emerald-50 text-emerald-700"
                    : insights.qualityScore >= 50
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-700"
                }`}
              >
                {insights.qualityScore >= 80 ? "Strong" : insights.qualityScore >= 50 ? "Workable" : "Check it"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-[68px] w-[68px] shrink-0">
                <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-canvas-deep)" strokeWidth="7" />
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    stroke="var(--color-brand)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${(insights.qualityScore / 100) * 188.5} 188.5`}
                  />
                </svg>
                <span className="num absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-ink">
                  {insights.qualityScore}
                </span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted">
                Based on mapped columns, missing values and duplicate shipment IDs across this import.
              </p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {insights.qualityIssues.slice(0, 5).map((issue) => (
                <li key={issue.label} className="flex items-start gap-2 text-[11.5px] leading-snug text-ink-soft">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      issue.tone === "red" ? "bg-rose-500" : issue.tone === "amber" ? "bg-amber-500" : "bg-stone-400"
                    }`}
                  />
                  {issue.label}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setMappingOpen(true)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
            >
              <Sliders className="h-3.5 w-3.5" />
              Review column mapping
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Pin className="h-3.5 w-3.5 text-brand" />
              <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">Top lanes</p>
            </div>
            {insights.topLanes.length === 0 ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                Map origin and destination columns to see your busiest lanes.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {insights.topLanes.map((lane) => (
                  <li key={lane.label}>
                    <div className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="truncate text-ink-soft" title={lane.label}>
                        {lane.label}
                      </span>
                      <span className="num shrink-0 font-medium text-ink">{lane.count}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas-deep">
                      <div className="h-full rounded-full bg-brand/70" style={{ width: `${Math.max(4, lane.percent)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-3.5 w-3.5 text-brand" />
                <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">Carriers</p>
              </div>
              <span className="num text-[11px] text-muted">{insights.carriers.length}</span>
            </div>
            {insights.carriers.length === 0 ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">No carrier column recognised yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {insights.carriers.map((carrier) => (
                  <li key={carrier.label} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="truncate text-ink-soft">{carrier.label}</span>
                    <span className="num shrink-0 text-muted">
                      {carrier.count} · {carrier.percent}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-canvas-deep/40 p-4">
            <div className="flex items-center gap-2">
              <Weight className="h-3.5 w-3.5 text-brand" />
              <p className="text-[11px] font-semibold tracking-[0.13em] text-muted uppercase">Cargo</p>
            </div>
            <p className="num mt-2 text-[22px] leading-none font-semibold text-ink">
              {insights.weightTotal === null ? "—" : `${formatNumber(insights.weightTotal)} ${insights.weightUnit}`}
            </p>
            <p className="mt-1 text-[11.5px] text-muted">
              Total declared weight across {insights.total} shipments
              {insights.costTotal !== null ? ` · ${formatMoney(insights.costTotal, insights.currency)} billed` : ""}
            </p>
          </div>
        </div>
      </div>

      </div>

      {/* Row inspector */}
      <Drawer open={detailRow !== null} onClose={closeDetail} label="Shipment detail">
        {detailRow ? (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">
                  Row {detailRowNumber} of {sheet.rows.length}
                  {detailPosition >= 0 ? ` · ${detailPosition + 1} in view` : ""}
                </p>
                <h2 className="mt-1 truncate font-mono text-lg font-semibold tracking-tight text-ink">
                  {headerForField(sheet.headers, mapping, "shipmentId")
                    ? detailRow[headerForField(sheet.headers, mapping, "shipmentId") as string] || `Row ${detailRowNumber}`
                    : `Row ${detailRowNumber}`}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {statusHeader ? <StatusPill info={classifyStatus(detailRow[statusHeader])} /> : null}
                  {headerForField(sheet.headers, mapping, "mode") && detailRow[headerForField(sheet.headers, mapping, "mode") as string] ? (
                    <ModeChip value={detailRow[headerForField(sheet.headers, mapping, "mode") as string]} />
                  ) : null}
                  <span className="text-[11.5px] text-muted">{sheet.fileName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full border border-line p-1.5 text-muted transition hover:border-ink/20 hover:text-ink"
                aria-label="Close detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
              {(() => {
                const lane = (() => {
                  const originHeader = headerForField(sheet.headers, mapping, "origin");
                  const destinationHeader = headerForField(sheet.headers, mapping, "destination");
                  const origin = originHeader ? detailRow[originHeader] : "";
                  const destination = destinationHeader ? detailRow[destinationHeader] : "";
                  if (!origin && !destination) return null;
                  return (
                    <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">Origin</p>
                        <p className="truncate text-[13px] font-medium text-ink">{origin || "—"}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1 text-right">
                        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">Destination</p>
                        <p className="truncate text-[13px] font-medium text-ink">{destination || "—"}</p>
                      </div>
                    </div>
                  );
                })();

                return (
                  <>
                    {lane}
                    {GROUP_ORDER.map((group) => {
                      const rows = sheet.headers
                        .map((header) => ({ header, field: mapping[header] }))
                        .filter((entry) => entry.field && FIELD_BY_KEY[entry.field].group === group);
                      const visible = rows.filter((entry) => entry.field !== "shipmentId" || group !== "Identity");
                      if (visible.length === 0) return null;
                      return (
                        <section key={group} className="mt-5">
                          <h3 className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">{group}</h3>
                          <dl className="mt-2 divide-y divide-line/70 overflow-hidden rounded-xl border border-line">
                            {visible.map(({ header, field }) => (
                              <div key={header} className="flex items-start justify-between gap-4 bg-surface px-3 py-2">
                                <dt className="text-[11.5px] text-muted">
                                  {FIELD_BY_KEY[field as CanonicalField].label}
                                  {header !== FIELD_BY_KEY[field as CanonicalField].label ? (
                                    <span className="block font-mono text-[10px] text-muted/60">{header}</span>
                                  ) : null}
                                </dt>
                                <dd className="max-w-[62%] text-right text-[12.5px] font-medium break-words text-ink">
                                  {formatFieldValue(field as CanonicalField, detailRow[header] ?? "", rowCurrency(detailRow))}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      );
                    })}

                    {rawHeaders.length > 0 ? (
                      <section className="mt-5">
                        <h3 className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">Unmapped columns</h3>
                        <dl className="mt-2 divide-y divide-line/70 overflow-hidden rounded-xl border border-line border-dashed">
                          {rawHeaders.map((header) => (
                            <div key={header} className="flex items-start justify-between gap-4 bg-surface px-3 py-2">
                              <dt className="font-mono text-[11px] text-muted">{header}</dt>
                              <dd className="max-w-[58%] text-right text-[12.5px] break-words text-ink-soft">
                                {detailRow[header] || "—"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailIndex(null);
                            setMappingOpen(true);
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand hover:text-brand-deep"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                          Map these columns
                        </button>
                      </section>
                    ) : null}
                  </>
                );
              })()}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={detailPosition <= 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-[11px] text-muted">Use ← → to move</span>
              <button
                type="button"
                onClick={goNext}
                disabled={detailPosition < 0 || detailPosition >= filtered.length - 1}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-brand-deep disabled:opacity-40"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : null}
      </Drawer>

      {/* Mapping panel */}
      <Drawer open={mappingOpen} onClose={closeMapping} label="Column mapping" width="max-w-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">Column mapping</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-ink">Teach Waypoint your headers</h2>
            <p className="mt-1 text-[12px] text-muted">
              {insights.mappedColumns} of {insights.totalColumns} columns are mapped
              {inferredCount > 0 ? ` · ${inferredCount} inferred from values` : ""}
              {learnedCount > 0 ? ` · ${learnedCount} remembered` : ""}. Unmapped columns stay as raw data.
            </p>
          </div>
          <button
            type="button"
            onClick={closeMapping}
            className="rounded-full border border-line p-1.5 text-muted transition hover:border-ink/20 hover:text-ink"
            aria-label="Close mapping"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-2">
            {sheet.headers.map((header) => {
              const field = mapping[header];
              const meta = mappingMeta[header];
              const sample = sheet.rows.find((row) => (row[header] ?? "").trim())?.[header] ?? "";
              const duplicate = field
                ? sheet.headers.filter((other) => other !== header && mapping[other] === field).length > 0
                : false;
              return (
                <li
                  key={header}
                  className="rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong/80"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-mono text-[12px] font-medium text-ink" title={header}>
                          {header}
                        </p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase ${
                            meta?.source === "learned"
                              ? "bg-emerald-50 text-emerald-700"
                              : meta?.source === "values"
                                ? "bg-indigo-50 text-indigo-700"
                                : meta?.source === "manual"
                                  ? "bg-amber-50 text-amber-700"
                                  : meta?.source === "header"
                                    ? "bg-brand-soft text-brand"
                                    : "bg-canvas-deep text-muted"
                          }`}
                          title={meta?.reason ?? undefined}
                        >
                          {sourceLabelFor(meta?.source ?? "none")}
                        </span>
                        {meta?.source === "values" ? (
                          <span className="num text-[9.5px] text-muted">{Math.round((meta.confidence ?? 0) * 100)}%</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted" title={sample}>
                        {sample ? `e.g. ${sample}` : "no sample value"}
                      </p>
                      {meta?.reason ? <p className="mt-0.5 text-[10.5px] leading-snug text-muted/80">{meta.reason}</p> : null}
                    </div>
                    <select
                      value={field ?? ""}
                      onChange={(event) => onMappingChange(header, event.target.value as CanonicalField | "")}
                      className={`w-full max-w-[220px] rounded-lg border bg-canvas/60 px-2 py-1.5 text-[12px] text-ink outline-none transition sm:w-auto ${
                        field ? "border-brand/30" : "border-line-strong/70"
                      }`}
                    >
                      <option value="">Leave unmapped</option>
                      {GROUP_ORDER.map((group) => (
                        <optgroup key={group} label={group}>
                          {FIELDS.filter((definition) => definition.group === group).map((definition) => (
                            <option key={definition.key} value={definition.key}>
                              {definition.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {duplicate ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
                      <Alert className="h-3 w-3" />
                      Another column already maps to this field — only the first is used in the board.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onResetMapping}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
          >
            <Clock className="h-3.5 w-3.5" />
            Re-run auto-detect
          </button>
          <button
            type="button"
            onClick={closeMapping}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-brand-deep"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        </div>
      </Drawer>
    </div>
  );
}
