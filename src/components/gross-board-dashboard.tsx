"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  ArrowRight,
  ArrowUpDown,
  Banknote,
  Clock,
  Compass,
  Download,
  Grid,
  History,
  Layers,
  Pin,
  Table as TableIcon,
  Truck,
  X,
} from "@/components/icons";
import { formatMoney, formatNumber } from "@/lib/fields";
import { grossBoardFromRecords, statusTone, type GrossBoard, type GrossDriver } from "@/lib/gross-board";
import type { Layout } from "@/lib/types";

type Props = {
  board: GrossBoard;
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  currentBatchId?: number | null;
};

type BatchOption = { id: number; fileName: string; createdAt: string };

type DriverDelta = { gross: number | null; miles: number | null; rpm: number | null; days: number | null };

type Tab = "leaderboard" | "heatmap" | "audit";
type SortKey = "gross" | "rpm" | "days" | "miles";

const DAY_TONE: Record<ReturnType<typeof statusTone>, string> = {
  work: "bg-brand-soft/80 text-brand-deep border-brand/15",
  home: "bg-amber-100 text-amber-900 border-amber-200",
  enroute: "bg-sky-100 text-sky-900 border-sky-200",
  oos: "bg-rose-100 text-rose-900 border-rose-200",
  note: "bg-orange-100 text-orange-900 border-orange-200",
  empty: "bg-canvas/60 text-muted/50 border-line/60",
};

function money(value: number | null): string {
  return value === null ? "—" : formatMoney(value, "USD");
}

function compactMoney(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function Sparkline({ driver, max }: { driver: GrossDriver; max: number }) {
  const values = driver.days.map((day) => day.rate ?? 0);
  const width = 104;
  const height = 26;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 2 - (max > 0 ? (value / max) * (height - 6) : 0);
    return { x, y, value, day: driver.days[index] };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[26px] w-[104px] overflow-visible" role="img" aria-label={`${driver.name} daily revenue trend`}>
      <path d={area} fill="url(#spark)" opacity="0.5" />
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12564a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#12564a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="#12564a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => {
        const tone = statusTone(point.day.status, point.value > 0);
        const fill = tone === "home" ? "#eab308" : tone === "enroute" ? "#3b82f6" : tone === "oos" ? "#ef4444" : tone === "note" ? "#f97316" : point.value > 0 ? "#12564a" : "#d6d1c4";
        return <circle key={`${driver.name}-${index}`} cx={point.x} cy={point.y} r={2.1} fill={fill} />;
      })}
    </svg>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "brand" | "accent" | "plain";
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</p>
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md border ${
            tone === "accent" ? "border-accent/20 bg-accent-soft text-accent" : "border-brand/15 bg-brand-soft text-brand"
          }`}
        >
          {icon}
        </span>
      </div>
      <p className="num mt-2 text-[21px] leading-none font-semibold tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

export function GrossBoardDashboard({ board, layout, onLayoutChange, currentBatchId }: Props) {
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [sort, setSort] = useState<SortKey>("gross");
  const [priorOptions, setPriorOptions] = useState<BatchOption[]>([]);
  const [priorId, setPriorId] = useState<number | null>(null);
  const [prior, setPrior] = useState<GrossBoard | null>(null);
  const [priorLoading, setPriorLoading] = useState(false);
  const [detail, setDetail] = useState<GrossDriver | null>(null);

  // Other saved Gross Boards, so a week can be compared with the week before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/imports", { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; history?: (BatchOption & { layout: string })[] };
        if (cancelled || !data.ok || !Array.isArray(data.history)) return;
        setPriorOptions(
          data.history.filter((batch) => batch.layout === "grossboard" && batch.id !== currentBatchId).slice(0, 8),
        );
      } catch {
        /* comparison is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentBatchId]);

  useEffect(() => {
    if (priorId === null || priorId === currentBatchId) {
      setPrior(null);
      return;
    }
    let cancelled = false;
    setPriorLoading(true);
    (async () => {
      try {
        const response = await fetch(`/api/imports/${priorId}`, { cache: "no-store" });
        const data = (await response.json()) as {
          ok: boolean;
          batch?: { fileName: string; sheetName: string | null; headers: string[]; rows: Record<string, string>[] };
        };
        if (cancelled || !data.ok || !data.batch) return;
        const rebuilt = grossBoardFromRecords(data.batch.headers, data.batch.rows, {
          fileName: data.batch.fileName,
          sheetName: data.batch.sheetName ?? undefined,
        });
        if (!cancelled) setPrior(rebuilt);
      } catch {
        if (!cancelled) setPrior(null);
      } finally {
        if (!cancelled) setPriorLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [priorId, currentBatchId]);

  const deltas = useMemo(() => {
    const map = new Map<string, DriverDelta>();
    if (!prior) return map;
    const key = (name: string) => name.trim().toUpperCase();
    const lookup = new Map(prior.drivers.map((driver) => [key(driver.name), driver]));
    for (const driver of board.drivers) {
      const match = lookup.get(key(driver.name));
      if (!match) continue;
      map.set(driver.name, {
        gross: (driver.reportedRevenue ?? driver.revenue) - (match.reportedRevenue ?? match.revenue),
        miles: (driver.reportedMiles ?? driver.miles) - (match.reportedMiles ?? match.miles),
        rpm: (driver.rpm ?? 0) - (match.rpm ?? 0),
        days: driver.daysWorked - match.daysWorked,
      });
    }
    return map;
  }, [prior, board.drivers]);

  const fleetDelta = prior ? board.fleetRevenue - prior.fleetRevenue : null;
  const newDrivers = prior
    ? board.drivers.filter((driver) => !prior.drivers.some((other) => other.name.trim().toUpperCase() === driver.name.trim().toUpperCase())).length
    : 0;
  const missingDrivers = prior
    ? prior.drivers.filter((driver) => !board.drivers.some((other) => other.name.trim().toUpperCase() === driver.name.trim().toUpperCase())).length
    : 0;

  const ranked = useMemo(() => {
    const copy = [...board.drivers];
    copy.sort((a, b) => {
      if (sort === "gross") return (b.reportedRevenue ?? b.revenue) - (a.reportedRevenue ?? a.revenue);
      if (sort === "rpm") return (b.rpm ?? 0) - (a.rpm ?? 0);
      if (sort === "days") return b.daysWorked - a.daysWorked;
      return (b.reportedMiles ?? b.miles) - (a.reportedMiles ?? a.miles);
    });
    return copy;
  }, [board.drivers, sort]);

  const maxGross = Math.max(1, ...ranked.map((driver) => driver.reportedRevenue ?? driver.revenue));
  const maxDay = Math.max(1, ...ranked.flatMap((driver) => driver.days.map((day) => day.rate ?? 0)));
  const noRevenueDays = board.drivers.reduce((sum, driver) => sum + driver.days.filter((day) => !day.rate && !day.status).length, 0);
  const statusDayCount = board.drivers.reduce((sum, driver) => sum + driver.statusDays, 0);
  const activeDrivers = board.drivers.filter((driver) => driver.daysWorked > 0).length;
  const bestDriver = ranked[0];

  const exportCsv = () => {
    const header = ["Driver", "Truck", "Days worked", "Total $", "Total mile", "Per mile", "Gross/day", ...board.dates.map((date) => date.label)];
    const lines = [header.join(",")];
    for (const driver of board.drivers) {
      lines.push(
        [
          `"${driver.name}"`,
          `"${driver.truck ?? ""}"`,
          driver.daysWorked,
          driver.reportedRevenue ?? driver.revenue,
          driver.reportedMiles ?? driver.miles,
          driver.rpm?.toFixed(2) ?? "",
          driver.grossPerDay?.toFixed(2) ?? "",
          ...driver.days.map((day) => `"${day.rate ?? day.status ?? ""}"`),
        ].join(","),
      );
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${board.fileName.replace(/\.[^.]+$/, "")}-gross-board.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-[-0.01em] text-ink">Gross board · week 42</h1>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted uppercase">
              {board.source === "stored" ? "saved import" : "parsed sheet"}
            </span>
          </div>
          <p className="num mt-1 text-[12px] text-muted">
            {board.drivers.length} drivers · {board.dates.length} days
            {board.weekStart ? ` · ${board.weekStart} → ${board.weekEnd}` : ""} · Rate / Mile / Load # blocks read as one row per driver-day
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {priorOptions.length > 0 ? (
            <label className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-soft">
              <History className="h-3.5 w-3.5 text-brand" />
              <span className="text-muted">Compare</span>
              <select
                value={priorId ?? ""}
                onChange={(event) => setPriorId(event.target.value ? Number(event.target.value) : null)}
                className="max-w-[150px] bg-transparent text-[11.5px] font-medium text-ink outline-none"
              >
                <option value="">this week only</option>
                {priorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.fileName} · #{option.id}
                  </option>
                ))}
              </select>
              {priorLoading ? <span className="h-2.5 w-2.5 animate-spin rounded-full border border-line-strong border-t-brand" /> : null}
            </label>
          ) : null}
          <div className="inline-flex items-center rounded-full border border-line bg-canvas/70 p-0.5">
            {([
              { key: "leaderboard", label: "Leaderboard", icon: Compass },
              { key: "heatmap", label: "Week heatmap", icon: Grid },
              { key: "audit", label: "Audit grid", icon: TableIcon },
            ] as const).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setTab(option.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                    tab === option.key ? "bg-surface text-brand shadow-[0_1px_2px_rgba(19,26,23,0.08)]" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange("records")}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand"
            title="One row per driver-day instead of the dashboard"
          >
            <Layers className="h-3.5 w-3.5" />
            Driver-days
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Fleet gross"
          icon={<Banknote className="h-3.5 w-3.5" />}
          value={money(board.fleetRevenue)}
          hint={bestDriver ? `Top: ${bestDriver.name.split(" ")[0]} ${money(bestDriver.reportedRevenue ?? bestDriver.revenue)}` : "—"}
        />
        <Kpi label="Total miles" icon={<Truck className="h-3.5 w-3.5" />} value={formatNumber(board.fleetMiles)} hint={`${board.dates.length}-day week`} />
        <Kpi
          label="Blended RPM"
          icon={<Compass className="h-3.5 w-3.5" />}
          value={board.fleetRpm === null ? "—" : `$${board.fleetRpm.toFixed(2)}`}
          hint={board.fleetReported?.rpm ? `Sheet says $${board.fleetReported.rpm.toFixed(2)}` : "Total $ ÷ total miles"}
        />
        <Kpi
          label="Active drivers"
          icon={<Truck className="h-3.5 w-3.5" />}
          value={`${activeDrivers}/${board.drivers.length}`}
          hint={`${board.drivers.reduce((sum, driver) => sum + driver.daysWorked, 0)} driver-days worked`}
        />
        <Kpi
          label="Idle / marked days"
          icon={<Clock className="h-3.5 w-3.5" />}
          tone="accent"
          value={formatNumber(noRevenueDays + statusDayCount)}
          hint={`${statusDayCount} status days · ${noRevenueDays} blank`}
        />
      </div>

      {prior ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand/25 bg-brand-soft/50 px-3.5 py-2.5">
          <p className="text-[11.5px] font-semibold text-brand-deep">
            Compared with {prior.fileName}
          </p>
          <p className="num text-[11.5px] text-ink-soft">
            Fleet gross{" "}
            <span className={fleetDelta && fleetDelta >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
              {fleetDelta === null ? "—" : `${fleetDelta >= 0 ? "+" : "−"}${money(Math.abs(fleetDelta))}`}
            </span>
            {prior.fleetRevenue > 0 ? ` (${((board.fleetRevenue / prior.fleetRevenue - 1) * 100).toFixed(1)}%)` : ""}
          </p>
          <p className="num text-[11.5px] text-ink-soft">
            Miles <span className="font-medium">{formatNumber(board.fleetMiles - prior.fleetMiles)}</span>
          </p>
          <p className="num text-[11.5px] text-ink-soft">
            RPM{" "}
            <span className="font-medium">
              {board.fleetRpm !== null && prior.fleetRpm !== null
                ? `${board.fleetRpm - prior.fleetRpm >= 0 ? "+" : "−"}$${Math.abs(board.fleetRpm - prior.fleetRpm).toFixed(2)}`
                : "—"}
            </span>
          </p>
          {newDrivers > 0 ? <span className="text-[11px] text-emerald-700">+{newDrivers} new driver{newDrivers === 1 ? "" : "s"}</span> : null}
          {missingDrivers > 0 ? <span className="text-[11px] text-rose-700">{missingDrivers} driver{missingDrivers === 1 ? "" : "s"} absent vs prior</span> : null}
          <button
            type="button"
            onClick={() => setPriorId(null)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-deep"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      ) : null}

      {board.instructions.length > 0 ? (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[11.5px] ${
            board.commentsCaveat ? "border-rose-200 bg-rose-50 text-rose-900" : "border-line bg-canvas/60 text-ink-soft"
          }`}
        >
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-semibold">Note printed on the sheet</p>
            <p className="mt-0.5">{board.instructions.join(" · ")}</p>
            {board.commentsCaveat ? (
              <p className="mt-1 text-[11px]">
                The Manager&apos;s Comments column is still read and shown below, but this board says it isn&apos;t
                archived — treat those cells as unverified until dispatch confirms where notes are stored.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {board.warnings.length > 0 ? (
        <details className="group mt-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 text-[11.5px] text-amber-900">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            {board.warnings.length} reconciliation note{board.warnings.length === 1 ? "" : "s"} — the daily grid doesn&apos;t match the sheet totals
          </summary>
          <ul className="mt-2 space-y-1">
            {board.warnings.map((warning) => (
              <li key={warning} className="list-disc pl-4">{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* Leaderboard */}
      {tab === "leaderboard" ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <div>
              <p className="text-[12.5px] font-semibold text-ink">Driver leaderboard</p>
              <p className="text-[10.5px] text-muted">Sorted by {sort === "gross" ? "gross" : sort === "rpm" ? "rate per mile" : sort === "days" ? "days worked" : "miles"} — sparkline shows the 7-day shape.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(["gross", "rpm", "days", "miles"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-medium transition ${
                    sort === key ? "border-brand/30 bg-brand-soft text-brand" : "border-line bg-surface text-muted hover:border-brand/30"
                  }`}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {key === "gross" ? "Gross" : key === "rpm" ? "RPM" : key === "days" ? "Days" : "Miles"}
                </button>
              ))}
            </div>
          </div>

          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="bg-canvas/90">
                  <th className="w-8 px-2 py-2 text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">#</th>
                  <th className="px-3 py-2 text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Driver</th>
                  <th className="px-3 py-2 text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Week shape</th>
                  <th className="px-3 py-2 text-right text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Total $</th>
                  <th className="px-3 py-2 text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Share of fleet</th>
                  <th className="px-3 py-2 text-right text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Miles</th>
                  <th className="px-3 py-2 text-right text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">RPM</th>
                  <th className="px-3 py-2 text-right text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Gross/day</th>
                  {prior ? (
                    <th className="px-3 py-2 text-right text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Δ gross</th>
                  ) : null}
                  <th className="px-3 py-2 text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((driver, index) => {
                  const gross = driver.reportedRevenue ?? driver.revenue;
                  const miles = driver.reportedMiles ?? driver.miles;
                  const rpm = driver.rpm ?? driver.reportedRpm;
                  const fleetRpm = board.fleetRpm ?? 0;
                  const delta = rpm !== null && fleetRpm > 0 ? rpm - fleetRpm : null;
                  return (
                    <tr
                      key={`${driver.index}-${driver.name}`}
                      onClick={() => setDetail(driver)}
                      className="cursor-pointer border-t border-line/70 hover:bg-brand-soft/25"
                      title="Open driver drill-down"
                    >
                      <td className="px-2 py-2 font-mono text-[10.5px] text-muted">{driver.index ?? index + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink">{driver.name}</p>
                        <p className="num text-[10.5px] text-muted">
                          {driver.truck ?? "no truck"} · {driver.daysWorked} day{driver.daysWorked === 1 ? "" : "s"}
                          {driver.revenueCheck === "mismatch" ? " · total mismatch" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <Sparkline driver={driver} max={maxDay} />
                      </td>
                      <td className="num px-3 py-2 text-right font-semibold text-ink">{money(gross)}</td>
                      <td className="px-3 py-2">
                        <div className="h-1.5 w-full min-w-[80px] overflow-hidden rounded-full bg-canvas-deep">
                          <div className="h-full rounded-full bg-brand/70" style={{ width: `${Math.max(3, (gross / maxGross) * 100)}%` }} />
                        </div>
                        <p className="num mt-0.5 text-[9.5px] text-muted">{board.fleetRevenue > 0 ? `${Math.round((gross / board.fleetRevenue) * 100)}%` : "—"}</p>
                      </td>
                      <td className="num px-3 py-2 text-right text-ink-soft">{formatNumber(miles)}</td>
                      <td className="num px-3 py-2 text-right">
                        <span className="font-medium text-ink">{rpm === null ? "—" : `$${rpm.toFixed(2)}`}</span>
                        {delta !== null ? (
                          <span className={`ml-1 text-[10px] ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(2)}
                          </span>
                        ) : null}
                      </td>
                      <td className="num px-3 py-2 text-right text-ink-soft">{compactMoney(driver.grossPerDay)}</td>
                      {prior ? (
                        <td className="num px-3 py-2 text-right">
                          {(() => {
                            const delta = deltas.get(driver.name);
                            if (!delta || delta.gross === null) return <span className="text-[10.5px] text-muted">new</span>;
                            return (
                              <span className={`text-[11px] font-medium ${delta.gross >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {delta.gross >= 0 ? "+" : "−"}
                                {compactMoney(Math.abs(delta.gross))}
                              </span>
                            );
                          })()}
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <div className="flex max-w-[150px] flex-wrap gap-1">
                          {driver.statuses.length === 0 ? (
                            <span className="text-[10px] text-muted">—</span>
                          ) : (
                            driver.statuses.slice(0, 3).map((status) => {
                              const tone = statusTone(status, false);
                              const days = driver.days.filter((day) => day.status === status).length;
                              return (
                                <span key={status} className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${DAY_TONE[tone]}`}>
                                  {status} ×{days}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Heatmap */}
      {tab === "heatmap" ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <div>
              <p className="text-[12.5px] font-semibold text-ink">Week heatmap</p>
              <p className="text-[10.5px] text-muted">Same colours as the board: yellow HOME, blue ENROUTE, red OOS, orange notes.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: "Ran", tone: "work" as const },
                { label: "HOME", tone: "home" as const },
                { label: "ENROUTE", tone: "enroute" as const },
                { label: "OOS", tone: "oos" as const },
                { label: "Note", tone: "note" as const },
              ].map((entry) => (
                <span key={entry.label} className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${DAY_TONE[entry.tone]}`}>
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="bg-canvas/90">
                  <th className="sticky left-0 z-10 bg-canvas/90 px-3 py-2 text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Driver</th>
                  {board.dates.map((date) => (
                    <th key={date.label} className="px-2 py-2 text-center text-[9.5px] font-semibold text-ink">
                      <span className="block">{date.weekday}</span>
                      <span className="num block text-[9px] font-normal text-muted">{date.label.replace(/\s+\d{4}$/, "")}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right text-[9.5px] font-semibold tracking-[0.08em] text-muted uppercase">Total</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((driver) => (
                  <tr key={`heat-${driver.index}-${driver.name}`} className="border-t border-line/70">
                    <th scope="row" className="sticky left-0 z-10 max-w-[190px] truncate border-r border-line bg-surface px-3 py-2 text-left font-medium text-ink">
                      {driver.name}
                      <span className="num ml-1 text-[9.5px] font-normal text-muted">{driver.truck}</span>
                    </th>
                    {driver.days.map((day) => {
                      const tone = statusTone(day.status, (day.rate ?? 0) > 0);
                      const content = day.rate !== null ? compactMoney(day.rate) : day.status ? day.status : "—";
                      return (
                        <td key={`${driver.name}-${day.label}`} className="px-1 py-1">
                          <div
                            className={`flex h-9 min-w-[62px] items-center justify-center rounded-md border px-1 text-center text-[10px] font-medium ${DAY_TONE[tone]}`}
                            title={`${driver.name} · ${day.label}${day.load ? ` · load ${day.load}` : ""}${day.miles ? ` · ${day.miles} mi` : ""}`}
                          >
                            <span className="truncate">{content}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="num px-2 py-2 text-right font-semibold text-ink">{money(driver.reportedRevenue ?? driver.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Audit grid */}
      {tab === "audit" ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <div>
              <p className="text-[12.5px] font-semibold text-ink">Audit grid</p>
              <p className="text-[10.5px] text-muted">The sheet&apos;s own three rows per driver, so figures can be traced back to the file.</p>
            </div>
            {board.skipped.length > 0 ? <p className="text-[10px] text-muted">Skipped: {board.skipped.join(" · ")}</p> : null}
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-canvas/90">
                  <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted uppercase">#</th>
                  <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted uppercase">Driver</th>
                  <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted uppercase">Truck</th>
                  <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted uppercase">Row</th>
                  {board.dates.map((date) => (
                    <th key={`audit-${date.label}`} className="px-2 py-1.5 text-center text-[9px] font-semibold text-muted uppercase">
                      {date.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-muted uppercase">Total $</th>
                  <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-muted uppercase">Total mile</th>
                  <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-muted uppercase">Per mile</th>
                </tr>
              </thead>
              <tbody>
                {board.drivers.map((driver) =>
                  (["rate", "mile", "load"] as const).map((rowKind, rowIndex) => (
                    <tr key={`${driver.name}-${rowKind}`} className={rowIndex === 0 ? "border-t border-line-strong" : "border-t border-line/50"}>
                      {rowIndex === 0 ? (
                        <>
                          <td rowSpan={3} className="border-r border-line/60 px-2 py-1 text-center align-middle font-mono text-[10.5px] text-muted">
                            {driver.index ?? ""}
                          </td>
                          <td rowSpan={3} className="max-w-[170px] border-r border-line/60 px-2 py-1 align-middle font-medium text-ink">
                            {driver.name}
                          </td>
                          <td rowSpan={3} className="border-r border-line/60 px-2 py-1 align-middle text-muted">
                            {driver.truck ?? "—"}
                          </td>
                        </>
                      ) : null}
                      <td className="px-2 py-1 text-[10px] font-medium tracking-wide text-muted uppercase">
                        {rowKind === "rate" ? "Rate" : rowKind === "mile" ? "Mile" : "Load #"}
                      </td>
                      {driver.days.map((day) => {
                        const value =
                          rowKind === "rate" ? (day.rate !== null ? `$${formatNumber(day.rate)}` : day.status ?? "") : rowKind === "mile" ? (day.miles !== null ? formatNumber(day.miles) : "") : day.load ?? "";
                        const tone = statusTone(day.status, (day.rate ?? 0) > 0);
                        const isStatusCell = Boolean(day.status) && (rowKind === "load" ? !day.load : rowKind === "rate" ? day.rate === null : day.miles === null);
                        return (
                          <td key={`${driver.name}-${rowKind}-${day.label}`} className="px-1 py-0.5">
                            <span
                              className={`block truncate rounded px-1 py-1 text-center text-[10px] ${
                                isStatusCell ? `border font-semibold ${DAY_TONE[tone]}` : "text-ink-soft"
                              }`}
                            >
                              {value || <span className="text-muted/30">·</span>}
                            </span>
                          </td>
                        );
                      })}
                      {rowIndex === 0 ? (
                        <>
                          <td rowSpan={3} className="num border-l border-line/60 px-2 py-1 text-right align-middle font-semibold text-ink">
                            {money(driver.reportedRevenue ?? driver.revenue)}
                          </td>
                          <td rowSpan={3} className="num px-2 py-1 text-right align-middle text-ink-soft">
                            {formatNumber(driver.reportedMiles ?? driver.miles)}
                          </td>
                          <td rowSpan={3} className="num px-2 py-1 text-right align-middle text-ink-soft">
                            {driver.rpm === null ? "—" : `$${driver.rpm.toFixed(2)}`}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {board.drivers.some((driver) => driver.comments) ? (
            <div className="border-t border-line px-3 py-2">
              <p className="text-[9.5px] font-semibold tracking-[0.1em] text-muted uppercase">Manager&apos;s comments</p>
              <ul className="mt-1 space-y-1">
                {board.drivers
                  .filter((driver) => driver.comments)
                  .map((driver) => (
                    <li key={`comment-${driver.name}`} className="text-[11px] text-ink-soft">
                      <span className="font-medium text-ink">{driver.name}:</span> {driver.comments}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Driver drill-down */}
      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close driver detail"
            onClick={() => setDetail(null)}
            className="animate-fade absolute inset-0 cursor-default bg-ink/35 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${detail.name} detail`}
            className="animate-slide-in relative flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-lift"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
                  {detail.truck ?? "no truck"} · {detail.daysWorked} of {detail.days.length} days worked
                </p>
                <h2 className="mt-1 text-lg leading-tight font-semibold tracking-[-0.01em] text-ink">{detail.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-soft">
                  <span className="num"><span className="text-muted">Gross</span> <span className="font-semibold text-ink">{money(detail.reportedRevenue ?? detail.revenue)}</span></span>
                  <span className="num"><span className="text-muted">Miles</span> {formatNumber(detail.reportedMiles ?? detail.miles)}</span>
                  <span className="num"><span className="text-muted">RPM</span> {detail.rpm === null ? "—" : `$${detail.rpm.toFixed(2)}`}</span>
                  <span className="num"><span className="text-muted">Gross/day</span> {compactMoney(detail.grossPerDay)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-full border border-line p-1.5 text-muted transition hover:border-ink/20 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
              {detail.revenueCheck === "mismatch" ? (
                <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  <Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Daily rate cells total {money(detail.revenue)} but the sheet&apos;s Total $ says {money(detail.reportedRevenue)} —
                  difference {money(detail.mismatch)}.
                </p>
              ) : null}

              <ol className="space-y-1.5">
                {detail.days.map((day) => {
                  const tone = statusTone(day.status, (day.rate ?? 0) > 0);
                  const idle = day.rate === null && !day.status && day.miles === null && !day.load;
                  return (
                    <li
                      key={`${detail.name}-${day.label}`}
                      className={`rounded-xl border px-3 py-2 ${idle ? "border-line/60 bg-canvas/40" : "border-line bg-surface"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-ink">
                            {day.weekday} <span className="num font-normal text-muted">{day.date ?? day.label}</span>
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-muted">
                            {day.miles !== null ? <span className="num">{formatNumber(day.miles)} mi</span> : null}
                            {day.load ? <span className="num">load {day.load}</span> : null}
                            {day.statusSource ? <span>status in {day.statusSource} row</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {day.rate !== null ? (
                            <span className="num text-[12.5px] font-semibold text-ink">{money(day.rate)}</span>
                          ) : null}
                          {day.status ? (
                            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${DAY_TONE[tone]}`}>
                              {day.status}
                            </span>
                          ) : null}
                          {idle ? <span className="text-[10px] text-muted/60">no data</span> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {detail.comments ? (
                <div className="mt-4 rounded-xl border border-line bg-canvas/50 px-3 py-2">
                  <p className="text-[9.5px] font-semibold tracking-[0.1em] text-muted uppercase">Manager&apos;s comment</p>
                  <p className="mt-1 text-[12px] text-ink-soft">{detail.comments}</p>
                  {board.commentsCaveat ? (
                    <p className="mt-1 text-[10.5px] text-rose-700">The sheet says comments are not archived — verify in notes.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const currentIndex = board.drivers.findIndex((driver) => driver.name === detail.name);
                  const next = board.drivers[currentIndex - 1];
                  if (next) setDetail(next);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 disabled:opacity-40"
                disabled={board.drivers.findIndex((driver) => driver.name === detail.name) <= 0}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-brand-deep"
              >
                Done
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentIndex = board.drivers.findIndex((driver) => driver.name === detail.name);
                  const next = board.drivers[currentIndex + 1];
                  if (next) setDetail(next);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition hover:border-brand/40 disabled:opacity-40"
                disabled={board.drivers.findIndex((driver) => driver.name === detail.name) >= board.drivers.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-[10.5px] text-muted">
        Layout is still available as records — use “Driver-days” for one row per driver-day, or “Table shape” to re-read the file.
      </p>
    </div>
  );
}
