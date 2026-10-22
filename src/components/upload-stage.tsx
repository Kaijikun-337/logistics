"use client";

import { useRef, useState } from "react";

import { Alert, ArrowRight, Bolt, Check, Clipboard, FileSheet, Sparkle, Upload } from "@/components/icons";
import { FIELDS } from "@/lib/fields";
import type { SourceKind } from "@/lib/types";

type Props = {
  onText: (text: string, source: SourceKind) => void;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onSidewaysSample: () => void;
  onGrossSample: () => void;
  busy: boolean;
  error: string | null;
};

const STEPS = [
  {
    title: "Drop any layout",
    body: "No template to fill in. Excel, CSV, TSV or a pasted block — even with a title banner, totals rows, or dates running across the top.",
  },
  {
    title: "Keep the layout you want",
    body: "Before anything is saved, a preview reads the sheet like a person would and lets you keep the original rows/columns, or reshape it into records.",
  },
  {
    title: "Your dialect is remembered",
    body: "Confirm a column once and that header name maps automatically in every future import — for the whole team.",
  },
];

export function UploadStage({ onText, onFiles, onSample, onSidewaysSample, onGrossSample, busy, error }: Props) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFiles(Array.from(files).slice(0, 1));
  };

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pr-3 pl-1.5 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
            <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-white">01</span>
            Excel intake
          </div>
          <h1 className="mt-5 text-[clamp(2.1rem,4.4vw,3.3rem)] leading-[1.03] font-semibold tracking-[-0.03em] text-ink">
            Drop the manifest.
            <span className="block text-brand">Get a clean shipment board.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Paste rows straight out of Excel or drop the file itself. Waypoint reads the sheet the way a person would —
            title, headers, label column, data block, totals — then shows you the parsed table before saving anything.
            Keep it exactly as laid out, or let it become one row per shipment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 font-medium text-ink-soft">
            <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.2} />
            CSV · XLSX · XLS · TSV
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Paste anywhere with ⌘V
          </span>
        </div>
      </div>

      {error ? (
        <div className="animate-fade mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <Alert className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          <div>
            <p className="font-medium">That import didn&apos;t parse</p>
            <p className="mt-0.5 text-rose-700">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop an Excel file here or browse"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
            className={`group relative flex h-full min-h-[266px] cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-dashed p-2 transition ${
              dragging ? "border-brand bg-brand-soft/60" : "border-line-strong/80 bg-surface hover:border-brand/50"
            }`}
          >
            <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative flex items-center justify-between px-4 pt-4">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Drop zone
              </span>
              <span className="rounded-full border border-line bg-canvas px-2.5 py-1 font-mono text-[10px] tracking-tight text-muted">
                .xlsx / .csv / .tsv
              </span>
            </div>

            <div className="relative flex flex-col items-center px-6 pb-4 text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-canvas text-brand shadow-[0_10px_24px_-18px_rgba(18,86,74,0.9)] transition group-hover:-translate-y-0.5">
                <FileSheet className="h-7 w-7" />
                <span className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
                  <Upload className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
              </div>
              <p className="mt-4 text-lg font-semibold tracking-[-0.01em] text-ink">
                {dragging ? "Let it go — we'll take it from here" : busy ? "Parsing your file…" : "Drop your Excel file here"}
              </p>
              <p className="mt-1 max-w-sm text-[13px] text-muted">
                Or click to browse. We read the first sheet of a workbook, up to 5,000 rows and 12&nbsp;MB.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white transition group-hover:bg-brand-deep">
                Browse files
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.txt,text/csv"
              className="hidden"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              <Clipboard className="h-3.5 w-3.5" />
              Paste from Excel
            </span>
            <button
              type="button"
              onClick={() => setText("")}
              className="text-[11px] font-medium text-muted transition hover:text-ink disabled:opacity-40"
              disabled={!text}
            >
              Clear
            </button>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            placeholder={"Shipment ID\tCustomer\tOrigin\tDestination\tStatus\tFreight Cost\nSHP-1042\tNorthwind\tRotterdam\tLeeds\tDelivered\t8420"}
            className="scroll-thin mt-3 h-[132px] w-full resize-none rounded-xl border border-line bg-canvas/60 p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft outline-none transition placeholder:text-muted/60 focus:border-brand/50 focus:bg-surface"
          />

          <div className="mt-auto flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={() => onText(text, "paste")}
              disabled={!text.trim() || busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-white/80"
            >
              {busy ? "Parsing…" : "Parse pasted rows"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.readText()
                  .then((value) => setText(value))
                  .catch(() => setText((current) => current));
              }}
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line text-muted transition hover:border-brand/40 hover:text-brand"
              title="Read from clipboard"
            >
              <Clipboard className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={onSample}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand transition hover:text-brand-deep disabled:opacity-50"
            >
              <Sparkle className="h-3.5 w-3.5" />
              Demo manifest
            </button>
            <span className="text-line-strong">|</span>
            <button
              type="button"
              onClick={onGrossSample}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent transition hover:text-brand-deep disabled:opacity-50"
              title="Rate / Mile / Load # blocks with dates across the top — opens the leaderboard dashboard"
            >
              <Sparkle className="h-3.5 w-3.5" />
              Gross board demo
            </button>
            <span className="text-line-strong">|</span>
            <button
              type="button"
              onClick={onSidewaysSample}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand transition hover:text-brand-deep disabled:opacity-50"
              title="Dates across the top, metrics down the side — shows the orientation step"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Sideways rate sheet
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-line bg-surface/60 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-canvas font-mono text-[11px] text-brand">
                {index + 1}
              </span>
              <p className="text-[13px] font-semibold text-ink">{step.title}</p>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bolt className="h-4 w-4 text-accent" />
            <p className="text-sm font-semibold text-ink">Fields we recognise out of the box</p>
          </div>
          <p className="text-[12px] text-muted">{FIELDS.length} logistics fields · names, values and your corrections</p>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Don&apos;t see your layout? You don&apos;t need to rename anything before importing — any extra columns are kept
          as raw data, and anything we guess wrong takes one click to fix.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {FIELDS.map((field) => (
            <span
              key={field.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11.5px] font-medium text-ink-soft"
            >
              <span className="h-1 w-1 rounded-full bg-brand/50" />
              {field.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[11.5px] text-muted">
            + anything else, kept as raw columns
          </span>
        </div>
      </div>
    </div>
  );
}
