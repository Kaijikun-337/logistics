"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DataWorkbench } from "@/components/data-workbench";
import {
  Alert,
  ArrowRight,
  Bolt,
  Building,
  Check,
  Clock,
  Compass,
  FileSheet,
  History,
  Layers,
  Plus,
  RouteMark,
  Sparkle,
  Trash,
  Truck,
  Upload,
  X,
} from "@/components/icons";
import { GrossBoardDashboard } from "@/components/gross-board-dashboard";
import { TablePreview } from "@/components/table-preview";
import { UploadStage } from "@/components/upload-stage";
import { inferColumns, type AliasMap, type ColumnMeta } from "@/lib/infer";
import { normalizeText } from "@/lib/fields";
import { buildSheet, textToMatrix, type BuiltSheet, type SheetMeta, type SheetOptions } from "@/lib/parse";
import { inspectionFromGrid, matrixFromStored, matrixToRecords, type MatrixTable } from "@/lib/inspect";
import {
  detectGrossBoard,
  grossBoardFromRecords,
  grossBoardToRecords,
  parseGrossBoard,
  type GrossBoard,
} from "@/lib/gross-board";
import { GROSS_BOARD_SAMPLE, GROSS_BOARD_SAMPLE_FILE } from "@/lib/gross-board-sample";
import {
  SAMPLE_FILE_NAME,
  SAMPLE_MANIFEST_MATRIX,
  SIDEWAYS_SAMPLE_FILE_NAME,
  SIDEWAYS_SAMPLE_MATRIX,
} from "@/lib/sample-data";
import { formatTimestamp, sourceLabel } from "@/lib/time";
import type {
  Batch,
  BatchSummary,
  CanonicalField,
  ColumnMapping,
  Layout,
  ParsedSheet,
  SourceKind,
} from "@/lib/types";

type Props = { initialHistory: BatchSummary[]; initialAliases: AliasMap; demoMode: boolean };
type SaveState = "idle" | "saving" | "saved" | "error" | "demo";
type Toast = { tone: "ok" | "error"; message: string };

const NAV_ITEMS = [
  { label: "Intake", icon: Upload, active: true, hint: "Parsing workspace" },
  { label: "Shipments", icon: Truck, active: false, hint: "Next milestone" },
  { label: "Lanes", icon: Compass, active: false, hint: "Next milestone" },
  { label: "Carriers", icon: Building, active: false, hint: "Next milestone" },
  { label: "Exceptions", icon: Alert, active: false, hint: "Next milestone" },
];

type StagedImport = {
  matrix: string[][];
  meta: SheetMeta & { sheetNames?: string[] };
};

const DEFAULT_OPTIONS: SheetOptions = { orientation: "auto", headerRow: "auto" };

export function ImportWorkspace({ initialHistory, initialAliases, demoMode }: Props) {
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<string, CanonicalField | "">>>({});
  const [aliases, setAliases] = useState<AliasMap>(initialAliases);
  const [history, setHistory] = useState<BatchSummary[]>(initialHistory);
  const [savedBatch, setSavedBatch] = useState<BatchSummary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState<number | null>(null);
  const [mobileHistory, setMobileHistory] = useState(false);
  const [staged, setStaged] = useState<StagedImport | null>(null);
  const [previewOptions, setPreviewOptions] = useState<SheetOptions>(DEFAULT_OPTIONS);
  const [lastImport, setLastImport] = useState<StagedImport | null>(null);
  const [reopenedPreview, setReopenedPreview] = useState(false);
  const [grossBoard, setGrossBoard] = useState<GrossBoard | null>(null);
  const [layout, setLayout] = useState<Layout>("records");
  const [matrix, setMatrix] = useState<MatrixTable | null>(null);
  const [stagedLayout, setStagedLayout] = useState<Layout | null>(null);

  const inference = useMemo(
    () => (sheet ? inferColumns(sheet.headers, sheet.rows, aliases) : null),
    [sheet, aliases],
  );

  const mapping: ColumnMapping = useMemo(() => {
    if (!sheet || !inference) return {};
    const merged: ColumnMapping = { ...inference.mapping };
    for (const [header, field] of Object.entries(overrides)) {
      if (!(header in merged)) continue;
      if (field) {
        for (const other of sheet.headers) {
          if (other !== header && merged[other] === field) merged[other] = "";
        }
      }
      merged[header] = field ?? "";
    }
    return merged;
  }, [sheet, inference, overrides]);

  const mappingMeta = useMemo<Record<string, ColumnMeta>>(() => {
    if (!sheet || !inference) return {};
    const meta: Record<string, ColumnMeta> = {};
    for (const header of sheet.headers) {
      const manual = overrides[header];
      const base = inference.meta[header] ?? { field: "", source: "none" as const, confidence: 0, reason: "" };
      if (manual !== undefined) {
        meta[header] = manual
          ? { field: manual, source: "manual", confidence: 1, reason: "set by you — Waypoint will remember this column name" }
          : { field: "", source: "manual", confidence: 1, reason: "left unmapped by you" };
      } else {
        meta[header] = { ...base, field: mapping[header] ?? "" };
      }
    }
    return meta;
  }, [sheet, inference, overrides, mapping]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/imports", { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; history?: BatchSummary[] };
      if (data.ok && Array.isArray(data.history)) setHistory(data.history);
    } catch {
      /* history is a nice-to-have; keep the current list */
    }
  }, []);

  const persist = useCallback(
    async (target: ParsedSheet, layoutOverride?: Layout) => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/imports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: target.fileName,
            source: target.source,
            sheetName: target.sheetName ?? null,
            headers: target.headers,
            rows: target.rows,
            layout: layoutOverride ?? "records",
            mapping: inferColumns(target.headers, target.rows, aliases).mapping,
          }),
        });
        const data = (await response.json()) as { ok: boolean; demo?: boolean; batch?: BatchSummary; error?: string };
        if (data.demo) {
          setSavedBatch(null);
          setSaveState("demo");
          setToast({ tone: "ok", message: "Parsed. Demo mode — nothing was saved to a database." });
          return;
        }
        if (!response.ok || !data.ok || !data.batch) throw new Error(data.error ?? "Save failed");
        setSavedBatch(data.batch);
        setSaveState("saved");
        setToast({ tone: "ok", message: `Parsed and saved ${data.batch.rowCount} shipments.` });
        void refreshHistory();
      } catch (saveError) {
        setSaveState("error");
        setToast({
          tone: "error",
          message: saveError instanceof Error ? saveError.message : "Could not save the import. Your data is still on screen.",
        });
      }
    },
    [refreshHistory, aliases],
  );

  const applySheet = useCallback(
    (next: ParsedSheet, save: boolean, nextLayout: Layout = "records") => {
      setSheet(next);
      setOverrides({});
      setSavedBatch(null);
      setSaveState("idle");
      setError(null);
      setMobileHistory(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (save) void persist(next, nextLayout);
    },
    [persist],
  );

  const stage = useCallback((matrix: string[][], meta: StagedImport["meta"]) => {
    if (matrix.length === 0) {
      setError("We couldn't find any rows. Copy the cells from Excel including the header row, then try again.");
      return;
    }
    setStaged({ matrix, meta });
    setPreviewOptions(DEFAULT_OPTIONS);
    setStagedLayout(detectGrossBoard(matrix) ? "grossboard" : inspectionFromGrid(matrix).suggestedLayout);
    setReopenedPreview(false);
    setError(null);
    setMobileHistory(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const confirmPreview = useCallback(
    ({ built, layout: chosenLayout, table }: { built: BuiltSheet; layout: Layout; table: MatrixTable }) => {
      if (!staged) return;
      setLastImport(staged);
      setStaged(null);
      setLayout(chosenLayout);
      setMatrix(chosenLayout === "matrix" ? table : null);

      if (chosenLayout === "grossboard") {
        const board = parseGrossBoard(staged.matrix, {
          fileName: staged.meta.fileName,
          sheetName: staged.meta.sheetName,
        });
        if (board) {
          const stored = grossBoardToRecords(board);
          const boardSheet: ParsedSheet = {
            fileName: staged.meta.fileName,
            source: staged.meta.source,
            sheetName: staged.meta.sheetName,
            headers: stored.headers,
            rows: stored.rows,
            warnings: staged.matrix.length > 0 ? board.warnings : [],
            truncated: false,
          };
          setGrossBoard(board);
          setMatrix(null);
          applySheet(boardSheet, !reopenedPreview, "grossboard");
          setReopenedPreview(false);
          return;
        }
      }

      setGrossBoard(null);
      if (chosenLayout === "matrix") {
        // Keep the original orientation: persist the matrix as label-keyed rows.
        const stored = matrixToRecords(table);
        const matrixSheet: ParsedSheet = {
          fileName: staged.meta.fileName,
          source: staged.meta.source,
          sheetName: staged.meta.sheetName,
          headers: stored.headers,
          rows: stored.rows,
          warnings: built.sheet.warnings,
          truncated: false,
        };
        applySheet(matrixSheet, !reopenedPreview, "matrix");
      } else {
        applySheet(built.sheet, !reopenedPreview, "records");
      }
      setReopenedPreview(false);
    },
    [staged, applySheet, reopenedPreview],
  );

  const reopenPreview = useCallback(() => {
    if (!lastImport) return;
    setStaged(lastImport);
    setPreviewOptions(DEFAULT_OPTIONS);
    setStagedLayout(layout);
    setReopenedPreview(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [lastImport, layout]);

  const cancelPreview = useCallback(() => {
    setStaged(null);
    setReopenedPreview(false);
  }, []);

  const handleText = useCallback(
    (text: string, source: SourceKind) => {
      try {
        if (source === "sample") {
          stage(SAMPLE_MANIFEST_MATRIX, {
            fileName: SAMPLE_FILE_NAME,
            source: "sample",
            sheetName: "February manifest",
          });
          return;
        }
        stage(textToMatrix(text), { fileName: "Pasted manifest", source: "paste" });
      } catch {
        setError("That pasted text could not be parsed. Try copying the cells again, including headers.");
      }
    },
    [stage],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/parse", { method: "POST", body: form });
        const data = (await response.json()) as {
          ok: boolean;
          matrix?: string[][];
          meta?: { fileName: string; source: SourceKind; sheetName: string | null; sheetNames?: string[] };
          error?: string;
        };
        if (!response.ok || !data.ok || !Array.isArray(data.matrix) || !data.meta) {
          throw new Error(data.error ?? "That file could not be parsed.");
        }
        stage(data.matrix, {
          fileName: data.meta.fileName,
          source: "file",
          sheetName: data.meta.sheetName ?? undefined,
          sheetNames: data.meta.sheetNames,
        });
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : "That file could not be parsed.");
        setToast({ tone: "error", message: parseError instanceof Error ? parseError.message : "Import failed." });
      } finally {
        setBusy(false);
      }
    },
    [stage],
  );

  const loadSidewaysSample = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      stage(SIDEWAYS_SAMPLE_MATRIX, {
        fileName: SIDEWAYS_SAMPLE_FILE_NAME,
        source: "sample",
        sheetName: "Lane scorecard",
      });
      setBusy(false);
    }, 180);
  }, [stage]);

  const loadGrossBoardSample = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      stage(GROSS_BOARD_SAMPLE, { fileName: GROSS_BOARD_SAMPLE_FILE, source: "sample", sheetName: "Sheet1" });
      setBusy(false);
    }, 180);
  }, [stage]);

  const loadSample = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      handleText("", "sample");
      setBusy(false);
    }, 180);
  }, [handleText]);

  const openBatch = useCallback(async (id: number) => {
    setLoadingBatch(id);
    try {
      const response = await fetch(`/api/imports/${id}`, { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; batch?: Batch; error?: string };
      if (!response.ok || !data.ok || !data.batch) throw new Error(data.error ?? "Could not open that import.");
      const batch = data.batch;
      const stored: ParsedSheet = {
        fileName: batch.fileName,
        source: batch.source,
        sheetName: batch.sheetName ?? undefined,
        headers: batch.headers,
        rows: batch.rows,
        warnings: [],
        truncated: false,
      };
      setSheet(stored);
      setOverrides(batch.mapping ?? {});
      setLayout(batch.layout === "matrix" ? "matrix" : batch.layout === "grossboard" ? "grossboard" : "records");
      setMatrix(batch.layout === "matrix" ? matrixFromStored(batch.headers, batch.rows) : null);
      setGrossBoard(
        batch.layout === "grossboard"
          ? grossBoardFromRecords(batch.headers, batch.rows, { fileName: batch.fileName, sheetName: batch.sheetName ?? undefined })
          : null,
      );
      setLastImport(null);
      setStaged(null);
      setSavedBatch({
        id: batch.id,
        fileName: batch.fileName,
        source: batch.source,
        layout: batch.layout === "matrix" ? "matrix" : "records",
        sheetName: batch.sheetName,
        rowCount: batch.rowCount,
        columnCount: batch.columnCount,
        createdAt: batch.createdAt,
      });
      setSaveState("saved");
      setError(null);
      setMobileHistory(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (openError) {
      setToast({ tone: "error", message: openError instanceof Error ? openError.message : "Could not open that import." });
    } finally {
      setLoadingBatch(null);
    }
  }, []);

  const deleteBatch = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/imports/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Delete failed");
        setHistory((current) => current.filter((batch) => batch.id !== id));
        if (savedBatch?.id === id) {
          setSavedBatch(null);
          setSaveState("idle");
        }
        setToast({ tone: "ok", message: "Import removed from history." });
      } catch {
        setToast({ tone: "error", message: "Could not delete that import." });
      }
    },
    [savedBatch],
  );

  const updateMapping = useCallback(
    (header: string, field: CanonicalField | "") => {
      setOverrides((current) => {
        const next = { ...current };
        if (field) {
          for (const other of sheet?.headers ?? []) {
            if (other !== header && mapping[other] === field) next[other] = "";
          }
        }
        next[header] = field;
        return next;
      });

      const key = normalizeText(header);
      if (field) {
        setAliases((current) => ({ ...current, [key]: field }));
        setToast({ tone: "ok", message: `Got it — “${header}” will map to ${field} in future imports.` });
        void fetch("/api/aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ header, field }),
        }).catch(() => undefined);
      } else if (aliases[key]) {
        setAliases((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setToast({ tone: "ok", message: `Forgot the saved meaning of “${header}”.` });
        void fetch(`/api/aliases?header=${encodeURIComponent(header)}`, { method: "DELETE" }).catch(() => undefined);
      }
    },
    [mapping, sheet, aliases],
  );

  const resetMapping = useCallback(() => {
    setOverrides({});
    setToast({ tone: "ok", message: "Automatic detection re-applied to every column." });
  }, []);

  const clearSheet = useCallback(() => {
    setSheet(null);
    setOverrides({});
    setSavedBatch(null);
    setSaveState("idle");
    setError(null);
    setStaged(null);
    setLastImport(null);
    setReopenedPreview(false);
    setLayout("records");
    setMatrix(null);
    setGrossBoard(null);
    setStagedLayout(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Paste anywhere to import while the intake screen is showing.
  useEffect(() => {
    if (sheet) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const text = event.clipboardData?.getData("text/plain");
      if (text && text.trim().length > 0) {
        event.preventDefault();
        handleText(text, "paste");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sheet, handleText]);

  // Drag a file anywhere over the window.
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (event.defaultPrevented) return;
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        void handleFiles(Array.from(files).slice(0, 1));
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFiles]);

  const historyList = (compact = false) => (
    <div className={compact ? "space-y-1.5" : "space-y-1"}>
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong/70 px-3 py-4 text-[11.5px] leading-relaxed text-muted">
          Saved imports show up here so your team can reopen a manifest without the original file.
        </div>
      ) : null}
      {history.map((batch) => {
        const active = savedBatch?.id === batch.id;
        return (
          <div
            key={batch.id}
            className={`group flex items-start gap-2 rounded-xl border px-2.5 py-2 transition ${
              active ? "border-brand/30 bg-brand-soft/60" : "border-transparent hover:border-line hover:bg-canvas/70"
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                active ? "border-brand/25 bg-surface text-brand" : "border-line bg-surface text-muted"
              }`}
            >
              <FileSheet className="h-3.5 w-3.5" />
            </span>
            <button
              type="button"
              onClick={() => void openBatch(batch.id)}
              className="min-w-0 flex-1 text-left"
              title={`Open ${batch.fileName}`}
            >
              <p className="truncate text-[12px] font-medium text-ink">{batch.fileName}</p>
              <p className="num mt-0.5 flex flex-wrap items-center gap-1 truncate text-[10.5px] text-muted">
                <span>{batch.rowCount} rows</span>
                <span>·</span>
                <span>{sourceLabel(batch.source)}</span>
                {batch.layout === "matrix" ? (
                  <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-indigo-700 uppercase">
                    matrix
                  </span>
                ) : null}
                <span>·</span>
                <span>{formatTimestamp(batch.createdAt)}</span>
              </p>
            </button>
            {loadingBatch === batch.id ? (
              <span className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border border-line-strong border-t-brand" />
            ) : (
              <button
                type="button"
                onClick={() => void deleteBatch(batch.id)}
                className="mt-0.5 rounded-md p-1 text-muted/60 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100"
                aria-label={`Delete ${batch.fileName}`}
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[266px] flex-col border-r border-line bg-surface/80 backdrop-blur lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-soft">
            <RouteMark className="h-7 w-7" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Waypoint</p>
            <p className="text-[10.5px] tracking-[0.12em] text-muted uppercase">Freight ops desk</p>
          </div>
        </div>

        <div className="px-3">
          <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Workspace</p>
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  aria-current={item.active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] ${
                    item.active ? "bg-brand text-white shadow-[0_8px_20px_-16px_rgba(10,53,45,0.9)]" : "text-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={item.active ? "font-medium" : ""}>{item.label}</span>
                  {!item.active ? (
                    <span className="ml-auto rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[9px] tracking-wide text-muted/80 uppercase">
                      soon
                    </span>
                  ) : (
                    <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
          <div className="flex items-center justify-between px-2 pb-1.5">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Recent imports</p>
            <span className="num rounded-full bg-canvas px-1.5 py-0.5 text-[10px] text-muted">{history.length}</span>
          </div>
          <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">{historyList()}</div>
        </div>

        <div className="border-t border-line px-3 py-3">
          <div className="rounded-xl border border-line bg-canvas/70 p-3">
            <div className="flex items-center gap-1.5">
              <Bolt className="h-3.5 w-3.5 text-accent" />
              <p className="text-[11px] font-semibold text-ink">Milestone 01 · intake</p>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              Preview, orientation, mapping and export are live. Anything the parser gets wrong takes one click to
              correct — and it&apos;s remembered.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5">
                <History className="h-3 w-3" /> Postgres history
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5">
                <Layers className="h-3 w-3" /> {history.length} saved
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-[266px]">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-soft">
              <RouteMark className="h-5.5 w-5.5" />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold leading-tight text-ink">Waypoint</p>
              <p className="text-[9.5px] tracking-[0.12em] text-muted uppercase">Freight ops intake</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileHistory(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-medium text-ink-soft"
            >
              <History className="h-3.5 w-3.5" />
              History
              <span className="num rounded-full bg-canvas px-1.5 text-[10px] text-muted">{history.length}</span>
            </button>
            {sheet ? (
              <button
                type="button"
                onClick={clearSheet}
                className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[11.5px] font-medium text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            ) : null}
          </div>
        </header>

        {demoMode ? (
          <div className="border-b border-amber-200 bg-amber-50/80">
            <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-[11.5px] text-amber-900 sm:px-6 lg:px-8">
              <Bolt className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="font-semibold">Demo mode</span>
              <span>
                No database is connected, so parsing, dashboards and exports all work but imports aren&apos;t saved to
                history. Set <code className="rounded bg-amber-100 px-1 font-mono text-[10.5px]">DATABASE_URL</code> to
                enable saving.
              </span>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          {staged ? (
            <TablePreview
              matrix={staged.matrix}
              meta={staged.meta}
              options={previewOptions}
              onOptionsChange={setPreviewOptions}
              layout={stagedLayout ?? "records"}
              onLayoutChange={setStagedLayout}
              onCancel={cancelPreview}
              onConfirm={confirmPreview}
              hasExistingBoard={Boolean(sheet)}
            />
          ) : grossBoard && layout === "grossboard" ? (
            <GrossBoardDashboard
              board={grossBoard}
              layout={layout}
              onLayoutChange={setLayout}
              currentBatchId={savedBatch?.id ?? null}
            />
          ) : sheet ? (
            <DataWorkbench
              sheet={sheet}
              mapping={mapping}
              mappingMeta={mappingMeta}
              onMappingChange={updateMapping}
              onResetMapping={resetMapping}
              onClear={clearSheet}
              saveState={saveState}
              savedBatch={savedBatch}
              demoMode={demoMode}
              onRetrySave={() => void persist(sheet)}
              onReopenPreview={lastImport ? reopenPreview : undefined}
              layout={layout}
              matrix={matrix}
              onLayoutChange={setLayout}
            />
          ) : (
            <UploadStage
              onText={handleText}
              onFiles={(files) => void handleFiles(files)}
              onSample={loadSample}
              onSidewaysSample={loadSidewaysSample}
              onGrossSample={loadGrossBoardSample}
              busy={busy}
              error={error}
            />
          )}
        </main>

        <footer className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[11px] text-muted sm:px-6 lg:px-8">
          <p className="flex items-center gap-1.5">
            <RouteMark className="h-4 w-4 text-brand" />
            Waypoint · Excel intake for logistics teams
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Preview before saving · corrections remembered in Postgres
          </p>
        </footer>
      </div>

      {/* Mobile history drawer */}
      {mobileHistory ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Import history</p>
              <p className="text-[13.5px] font-semibold text-ink">{history.length} saved manifests</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileHistory(false)}
              className="rounded-full border border-line p-1.5 text-muted"
              aria-label="Close history"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-3 py-3">{historyList(true)}</div>
          <div className="border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={() => setMobileHistory(false)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-medium text-white"
            >
              Back to intake
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Full-window drop overlay when a board is already open */}
      {dragging && sheet ? (
        <div className="animate-fade fixed inset-0 z-[60] flex items-center justify-center bg-brand-deep/60 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/25 bg-surface px-10 py-8 text-center shadow-lift">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Upload className="h-6 w-6" />
            </span>
            <p className="text-[15px] font-semibold text-ink">Drop to replace this manifest</p>
            <p className="text-[12px] text-muted">The current import stays saved in history.</p>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="animate-rise fixed bottom-5 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lift ${
              toast.tone === "ok" ? "border-brand/25 bg-brand-deep text-white" : "border-rose-300 bg-rose-600 text-white"
            }`}
          >
            <span className="mt-0.5">
              {toast.tone === "ok" ? <Check className="h-4 w-4" /> : <Alert className="h-4 w-4" />}
            </span>
            <p className="flex-1 text-[12.5px] leading-snug">{toast.message}</p>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="text-white/70 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* subtle guided hint on first load */}
      {!sheet && history.length === 0 && !busy ? (
        <button
          type="button"
          onClick={loadSample}
          className="fixed right-4 bottom-4 z-20 hidden items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[11.5px] font-medium text-ink-soft shadow-card transition hover:border-brand/40 hover:text-brand sm:inline-flex"
        >
          <Sparkle className="h-3.5 w-3.5 text-accent" />
          Try the demo manifest
        </button>
      ) : null}
    </div>
  );
}
