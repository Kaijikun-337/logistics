import { formatDate, normalizeText, parseDateParts, parseNumeric } from "./fields";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GrossDay = {
  label: string;
  date: string | null;
  iso: string | null;
  weekday: string;
  rate: number | null;
  rateRaw: string;
  status: string | null;
  statusSource: "rate" | "mile" | "load" | null;
  miles: number | null;
  load: string | null;
};

export type GrossDriver = {
  index: number | null;
  name: string;
  truck: string | null;
  days: GrossDay[];
  comments: string | null;
  reportedRevenue: number | null;
  reportedMiles: number | null;
  reportedRpm: number | null;
  revenue: number;
  miles: number;
  daysWorked: number;
  rpm: number | null;
  grossPerDay: number | null;
  statuses: string[];
  statusDays: number;
  revenueCheck: "ok" | "mismatch" | "unknown";
  mismatch: number | null;
};

export type GrossBoard = {
  title: string | null;
  fileName: string;
  sheetName?: string;
  dates: GrossDay[];
  weekStart: string | null;
  weekEnd: string | null;
  drivers: GrossDriver[];
  fleetRevenue: number;
  fleetMiles: number;
  fleetRpm: number | null;
  fleetReported: { revenue: number | null; miles: number | null; rpm: number | null } | null;
  warnings: string[];
  skipped: string[];
  /** Free-text instructions printed on the sheet itself (e.g. "Dont use comments. Use notes."). */
  instructions: string[];
  /** True when the sheet tells us comments/notes are not archived. */
  commentsCaveat: boolean;
  source: "sheet" | "stored";
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SUBTYPE_ALIASES: Record<string, "rate" | "mile" | "load"> = {
  rate: "rate",
  rates: "rate",
  revenue: "rate",
  gross: "rate",
  mile: "mile",
  miles: "mile",
  mileage: "mile",
  mi: "mile",
  load: "load",
  loads: "load",
  "load #": "load",
  "load#": "load",
  "load no": "load",
  "load id": "load",
  "load num": "load",
  trip: "load",
  pro: "load",
};

const KNOWN_STATUSES = new Set([
  "HOME", "ENROUTE", "EN ROUTE", "OOS", "OFF", "VAC", "VACATION", "SHOP", "SICK", "LAYOVER", "RESET",
  "HOMETIME", "HOME TIME", "NO LOAD", "TRAINING", "INJURED", "BREAKDOWN", "HOLIDAY", "PTO", "DOT",
  "EMPTY", "DEADHEAD", "DH", "WAIT", "WAITING", "RAIN", "SNOW", "WEATHER", "TRAFFIC", "REPAIR", "START",
]);

const TOTAL_PATTERN = /^(grand\s+total|sub\s*-?\s*total|total|totals|sum|summary|fleet\s+total|report\s+total)\b/i;

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isBlank(value: string | undefined | null): boolean {
  const text = clean(value);
  return text.length === 0 || /^(nan|nat|none|null|n\/a|#n\/a)$/i.test(text);
}

function toNumber(value: string | undefined | null): number | null {
  if (isBlank(value)) return null;
  const text = clean(value);
  const negative = text.startsWith("(") && text.endsWith(")");
  const numeric = parseNumeric(text);
  if (numeric === null) return null;
  return negative ? -Math.abs(numeric) : numeric;
}

function asId(value: string | undefined | null): string | null {
  if (isBlank(value)) return null;
  const text = clean(value);
  if (/^\d+\.0+$/.test(text)) return String(Number(text));
  return text;
}

function headerDate(value: string, referenceYear: number): string | null {
  const text = clean(value);
  if (!text) return null;
  const parts = parseDateParts(text);
  if (parts) return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const monthIndex = words.reduce((found, word) => {
    if (found >= 0) return found;
    return MONTHS.indexOf(word.slice(0, 3));
  }, -1);
  const dayMatch = text.match(/\b(\d{1,2})\b/);
  if (monthIndex >= 0 && dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      return `${referenceYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function isMetricLabel(label: string): boolean {
  const normalized = normalizeText(label);
  if (!normalized) return false;
  return /(rate|revenue|gross|mile|miles|mileage|load|per mile|rpm|total|cost|pay|fuel|hours|stop|comment|note)/.test(normalized);
}

function classifyDay(value: string | undefined | null): { rate: number | null; status: string | null } {
  if (isBlank(value)) return { rate: null, status: null };
  const text = clean(value);
  const numeric = toNumber(text);
  if (numeric !== null && /^[\s$€£¥₹()\-0-9.,]+$/.test(text)) return { rate: numeric, status: null };
  const upper = text.toUpperCase();
  if (KNOWN_STATUSES.has(upper)) return { rate: null, status: upper };
  return { rate: null, status: text };
}

function classifyLoad(value: string | undefined | null): { load: string | null; status: string | null } {
  if (isBlank(value)) return { load: null, status: null };
  const text = clean(value);
  const hasDigit = /\d/.test(text);
  const hasSpace = /\s/.test(text);
  if (hasDigit && !hasSpace && /^[A-Za-z0-9][A-Za-z0-9\-_/#.]{2,23}$/.test(text)) return { load: asId(text), status: null };
  const upper = text.toUpperCase();
  if (KNOWN_STATUSES.has(upper)) return { load: null, status: upper };
  return { load: null, status: text };
}

/* ------------------------------------------------------------------ */
/* Detection + parsing                                                 */
/* ------------------------------------------------------------------ */

export function detectGrossBoard(matrix: string[][]): boolean {
  let hits = 0;
  for (const row of matrix.slice(0, 24)) {
    for (const cell of row.slice(0, 6)) {
      if (SUBTYPE_ALIASES[normalizeText(cell)]) hits += 1;
    }
  }
  return hits >= 3;
}

function findLayout(matrix: string[][]): {
  headerRow: number;
  dateColumns: number[];
  indexColumn: number | null;
  nameColumn: number;
  truckColumn: number | null;
  subtypeColumn: number;
  revenueColumn: number | null;
  milesColumn: number | null;
  rpmColumn: number | null;
  commentsColumn: number | null;
} | null {
  // Header row: the row whose cells include a driver-name column and dates.
  let headerRow = -1;
  let bestScore = 0;
  for (let row = 0; row < Math.min(matrix.length, 20); row += 1) {
    const cells = matrix[row] ?? [];
    const normalized = cells.map((cell) => normalizeText(cell));
    let score = 0;
    if (normalized.some((cell) => cell === "driver name" || cell.includes("driver name"))) score += 4;
    if (normalized.some((cell) => cell.includes("truck"))) score += 1;
    if (normalized.some((cell) => cell.includes("total") && cell.includes("mile"))) score += 1;
    if (normalized.some((cell) => cell.includes("per mile"))) score += 1;
    score += Math.min(7, cells.filter((cell) => headerDate(cell, 2000) !== null || /[a-z]/i.test(cell) && /\d/.test(cell)).length);
    if (score > bestScore) {
      bestScore = score;
      headerRow = row;
    }
  }
  if (headerRow < 0 || bestScore < 4) return null;

  const header = matrix[headerRow] ?? [];
  const find = (predicate: (value: string) => boolean, start = 0): number | null => {
    for (let column = start; column < header.length; column += 1) {
      if (predicate(normalizeText(header[column] ?? ""))) return column;
    }
    return null;
  };

  const nameColumn = find((value) => value === "driver name" || value === "driver" || value === "name") ?? 1;

  // Sub-type column: labelled, else the column holding Rate/Mile/Load labels.
  let subtypeColumn = find((value) => value.includes("sub") && value.includes("type")) ?? find((value) => value === "type" || value === "metric");
  if (subtypeColumn === null) {
    for (let column = 0; column < Math.min(8, header.length); column += 1) {
      const hits = matrix.slice(headerRow + 1, headerRow + 10).filter((row) => SUBTYPE_ALIASES[normalizeText(row?.[column] ?? "")]).length;
      if (hits >= 2) {
        subtypeColumn = column;
        break;
      }
    }
  }
  if (subtypeColumn === null) return null;

  const revenueColumn = find((value) => value.includes("total") && (value.includes("$") || value.includes("revenue")));
  const milesColumn = find((value) => value.startsWith("total") && value.includes("mile"));
  const rpmColumn = find((value) => value.includes("per mile") || value === "rpm" || value === "cpm");
  const commentsColumn = find((value) => value.includes("comment") || value.includes("note") || value.includes("remark"));
  const indexColumn = find((value) => value === "driver index" || value === "driver id" || value === "#" || value === "id");
  const truckColumn = find((value) => value.includes("truck") || value === "unit");

  // Dates: header cells that read as dates, between the subtype column and the totals.
  const stopAt = Math.min(...[revenueColumn, milesColumn, rpmColumn, commentsColumn].filter((value): value is number => value !== null), header.length);
  const dateColumns: number[] = [];
  for (let column = subtypeColumn + 1; column < stopAt; column += 1) {
    if (isBlank(header[column])) continue;
    if (headerDate(header[column] ?? "", 2000)) dateColumns.push(column);
  }
  if (dateColumns.length === 0) {
    for (let column = subtypeColumn + 1; column < Math.min(subtypeColumn + 8, stopAt); column += 1) dateColumns.push(column);
  }

  return {
    headerRow,
    dateColumns,
    indexColumn,
    nameColumn,
    truckColumn,
    subtypeColumn,
    revenueColumn,
    milesColumn,
    rpmColumn,
    commentsColumn,
  };
}

export function parseGrossBoard(matrix: string[][], meta: { fileName: string; sheetName?: string }): GrossBoard | null {
  const layout = findLayout(matrix);
  if (!layout) return null;

  const header = matrix[layout.headerRow] ?? [];
  const explicitYear = matrix
    .slice(Math.max(0, layout.headerRow - 3), layout.headerRow + 1)
    .flat()
    .map((cell) => clean(cell).match(/\b(20\d{2})\b/)?.[1])
    .find((value): value is string => Boolean(value));
  const referenceYear = explicitYear ? Number(explicitYear) : new Date().getUTCFullYear();

  const dates = layout.dateColumns.map((column) => {
    const label = clean(header[column]) || `Column ${column + 1}`;
    const iso = headerDate(label, referenceYear);
    const parts = iso ? iso.split("-") : [];
    const weekday = iso ? WEEKDAYS[new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))).getUTCDay()] : "";
    return { label, date: iso ? formatDate(iso) : label, iso, weekday, rate: null, rateRaw: "", status: null, statusSource: null, miles: null, load: null } satisfies GrossDay;
  });

  type Draft = {
    index: number | null;
    name: string;
    truck: string | null;
    comments: string | null;
    reported: { revenue: number | null; miles: number | null; rpm: number | null };
    days: GrossDay[];
    subtypes: string[];
  };

  const drafts: Draft[] = [];
  const skipped: string[] = [];
  let fleetReported: GrossBoard["fleetReported"] = null;
  let current: Draft | null = null;

  const cell = (row: string[], column: number | null) => (column === null ? "" : clean(row[column]));

  for (let r = layout.headerRow + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const subtypeRaw = cell(row, layout.subtypeColumn);
    const subtype = SUBTYPE_ALIASES[normalizeText(subtypeRaw)] ?? null;
    const name = cell(row, layout.nameColumn);
    const indexValue = toNumber(cell(row, layout.indexColumn));
    const truck = asId(cell(row, layout.truckColumn));
    const daily = layout.dateColumns.map((column) => cell(row, column));
    const hasDaily = daily.some((value) => !isBlank(value));
    const reported = {
      revenue: toNumber(cell(row, layout.revenueColumn)),
      miles: toNumber(cell(row, layout.milesColumn)),
      rpm: toNumber(cell(row, layout.rpmColumn)),
    };
    const hasTotals = Object.values(reported).some((value) => value !== null);
    const comments = cell(row, layout.commentsColumn) || null;

    // Fleet total row: no name, no daily grid, but totals.
    if (!subtype && !name && !hasDaily && hasTotals) {
      fleetReported = reported;
      skipped.push(`Row ${r + 1}: fleet totals`);
      continue;
    }
    // Named rollup (totals only) — e.g. "Brett" under the fleet totals.
    if (!subtype && name && !hasDaily && hasTotals) {
      skipped.push(`Row ${r + 1}: totals-only rollup “${name}”`);
      continue;
    }
    if (!subtype) {
      if (hasDaily && name) {
        skipped.push(`Row ${r + 1}: “${name}” has daily values but no Rate/Mile/Load label`);
      }
      continue;
    }

    if (subtype === "rate" || !current) {
      if (!current || subtype === "rate") {
        current = {
          index: indexValue,
          name: name || (indexValue !== null ? `Driver ${indexValue}` : `Driver ${drafts.length + 1}`),
          truck,
          comments,
          reported: { revenue: null, miles: null, rpm: null },
          days: dates.map((date) => ({ ...date })),
          subtypes: [],
        };
        drafts.push(current);
      }
    }

    current.subtypes.push(subtype);
    if (!current.truck && truck) current.truck = truck;
    if (!current.name.startsWith("Driver ") || !name) current.name = name || current.name;
    if (!current.index && indexValue !== null) current.index = indexValue;
    if (!current.comments && comments) current.comments = comments;
    for (const key of ["revenue", "miles", "rpm"] as const) {
      if (current.reported[key] === null && reported[key] !== null) current.reported[key] = reported[key];
    }

    layout.dateColumns.forEach((column, dayIndex) => {
      const raw = cell(row, column);
      if (isBlank(raw)) return;
      const day = current!.days[dayIndex];
      if (subtype === "rate") {
        const classified = classifyDay(raw);
        day.rate = classified.rate;
        day.rateRaw = raw;
        if (classified.status) {
          day.status = classified.status;
          day.statusSource = day.statusSource ?? "rate";
        }
      } else if (subtype === "mile") {
        const miles = toNumber(raw);
        if (miles !== null) day.miles = miles;
        else {
          const classified = classifyDay(raw);
          if (classified.status && !day.status) {
            day.status = classified.status;
            day.statusSource = "mile";
          }
        }
      } else {
        const classified = classifyLoad(raw);
        if (classified.load) day.load = classified.load;
        if (classified.status && !day.status) {
          day.status = classified.status;
          day.statusSource = "load";
        }
      }
    });
  }

  if (drafts.length === 0) return null;

  const warnings: string[] = [];
  const drivers: GrossDriver[] = drafts.map((draft) => {
    const revenue = draft.days.reduce((sum, day) => sum + (day.rate ?? 0), 0);
    const miles = draft.days.reduce((sum, day) => sum + (day.miles ?? 0), 0);
    const daysWorked = draft.days.filter((day) => (day.rate ?? 0) > 0).length;
    const statuses = [...new Set(draft.days.map((day) => day.status).filter((value): value is string => Boolean(value)))];
    const statusDays = draft.days.filter((day) => Boolean(day.status)).length;
    const rpm = miles > 0 ? revenue / miles : null;
    const mismatch = draft.reported.revenue !== null ? revenue - draft.reported.revenue : null;
    const revenueCheck: GrossDriver["revenueCheck"] =
      draft.reported.revenue === null ? "unknown" : Math.abs(mismatch ?? 0) < 0.02 ? "ok" : "mismatch";
    if (revenueCheck === "mismatch") {
      warnings.push(
        `${draft.name}: daily rates add up to ${revenue.toLocaleString("en-US")} but Total $ says ${draft.reported.revenue?.toLocaleString("en-US")}.`,
      );
    }
    if (!draft.subtypes.includes("load")) warnings.push(`${draft.name}: no Load # row in the block.`);
    return {
      index: draft.index,
      name: draft.name,
      truck: draft.truck,
      days: draft.days,
      comments: draft.comments,
      reportedRevenue: draft.reported.revenue,
      reportedMiles: draft.reported.miles,
      reportedRpm: draft.reported.rpm,
      revenue,
      miles,
      daysWorked,
      rpm,
      grossPerDay: daysWorked > 0 ? revenue / daysWorked : null,
      statuses,
      statusDays,
      revenueCheck,
      mismatch,
    };
  });

  // Instructions printed above the header are operator guidance, not data.
  const instructions: string[] = [];
  for (const row of matrix.slice(0, layout.headerRow)) {
    for (const cell of row) {
      const text = clean(cell);
      if (text.length < 6) continue;
      if (matrix[layout.headerRow]?.some((headerCell) => clean(headerCell) === text)) continue;
      instructions.push(text);
    }
  }
  const commentsCaveat = instructions.some((text) => /comment/i.test(text) && /(not saved|dont|don't|use notes|archive)/i.test(text));

  const fleetRevenue = drivers.reduce((sum, driver) => sum + (driver.reportedRevenue ?? driver.revenue), 0);
  const fleetMiles = drivers.reduce((sum, driver) => sum + (driver.reportedMiles ?? driver.miles), 0);
  const isoDates = dates.map((date) => date.iso).filter((value): value is string => Boolean(value)).sort();

  return {
    title: null,
    fileName: meta.fileName,
    sheetName: meta.sheetName,
    dates,
    weekStart: isoDates[0] ?? null,
    weekEnd: isoDates[isoDates.length - 1] ?? null,
    drivers,
    fleetRevenue,
    fleetMiles,
    fleetRpm: fleetMiles > 0 ? fleetRevenue / fleetMiles : null,
    fleetReported,
    warnings,
    skipped,
    instructions,
    commentsCaveat,
    source: "sheet",
  };
}

/* ------------------------------------------------------------------ */
/* Storage round-trip (driver-day records)                             */
/* ------------------------------------------------------------------ */

export function grossBoardToRecords(board: GrossBoard): { headers: string[]; rows: Record<string, string>[] } {
  const headers = [
    "Driver Index", "Driver Name", "Truck #", "Date", "Status", "Rate", "Miles", "Load #",
    "Total $", "Total Mile", "Per Mile", "Manager's Comments", "Days Worked",
  ];
  const rows: Record<string, string>[] = [];
  for (const driver of board.drivers) {
    for (const day of driver.days) {
      if (day.rate === null && day.miles === null && !day.status && !day.load) continue;
      rows.push({
        "Driver Index": driver.index === null ? "" : String(driver.index),
        "Driver Name": driver.name,
        "Truck #": driver.truck ?? "",
        Date: day.iso ?? day.label,
        Status: day.status ?? "",
        Rate: day.rate === null ? "" : String(day.rate),
        Miles: day.miles === null ? "" : String(day.miles),
        "Load #": day.load ?? "",
        "Total $": driver.reportedRevenue === null ? "" : String(driver.reportedRevenue),
        "Total Mile": driver.reportedMiles === null ? "" : String(driver.reportedMiles),
        "Per Mile": driver.reportedRpm === null ? "" : String(driver.reportedRpm),
        "Manager's Comments": driver.comments ?? "",
        "Days Worked": String(driver.daysWorked),
      });
    }
  }
  return { headers, rows };
}

export function grossBoardFromRecords(
  headers: string[],
  rows: Record<string, string>[],
  meta: { fileName: string; sheetName?: string },
): GrossBoard | null {
  if (!headers.includes("Driver Name") || !headers.includes("Date")) return null;
  const dateKeys = [...new Set(rows.map((row) => row.Date).filter(Boolean))].sort();
  const dates: GrossDay[] = dateKeys.map((iso) => ({
    label: iso,
    date: formatDate(iso),
    iso,
    weekday: WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "",
    rate: null,
    rateRaw: "",
    status: null,
    statusSource: null,
    miles: null,
    load: null,
  }));

  const groups = new Map<string, GrossDriver>();
  for (const row of rows) {
    const name = row["Driver Name"] || "Driver";
    const key = `${row["Driver Index"] ?? ""}|${name}`;
    let driver = groups.get(key);
    if (!driver) {
      driver = {
        index: row["Driver Index"] ? Number(row["Driver Index"]) : null,
        name,
        truck: row["Truck #"] || null,
        days: dates.map((date) => ({ ...date })),
        comments: row["Manager's Comments"] || null,
        reportedRevenue: row["Total $"] ? Number(row["Total $"]) : null,
        reportedMiles: row["Total Mile"] ? Number(row["Total Mile"]) : null,
        reportedRpm: row["Per Mile"] ? Number(row["Per Mile"]) : null,
        revenue: 0,
        miles: 0,
        daysWorked: row["Days Worked"] ? Number(row["Days Worked"]) : 0,
        rpm: null,
        grossPerDay: null,
        statuses: [],
        statusDays: 0,
        revenueCheck: "unknown",
        mismatch: null,
      };
      groups.set(key, driver);
    }
    const dayIndex = dateKeys.indexOf(row.Date ?? "");
    if (dayIndex < 0) continue;
    const day = driver.days[dayIndex];
    day.rate = row.Rate ? Number(row.Rate) : null;
    day.miles = row.Miles ? Number(row.Miles) : null;
    day.status = row.Status || null;
    day.load = row["Load #"] || null;
  }

  const drivers = [...groups.values()].map((driver) => {
    const revenue = driver.days.reduce((sum, day) => sum + (day.rate ?? 0), 0);
    const miles = driver.days.reduce((sum, day) => sum + (day.miles ?? 0), 0);
    const statuses = [...new Set(driver.days.map((day) => day.status).filter((value): value is string => Boolean(value)))];
    return {
      ...driver,
      revenue,
      miles,
      statuses,
      statusDays: driver.days.filter((day) => Boolean(day.status)).length,
      rpm: miles > 0 ? revenue / miles : null,
      grossPerDay: driver.daysWorked > 0 ? revenue / driver.daysWorked : null,
      revenueCheck:
        driver.reportedRevenue === null ? ("unknown" as const) : Math.abs(revenue - driver.reportedRevenue) < 0.02 ? ("ok" as const) : ("mismatch" as const),
    };
  });

  const fleetRevenue = drivers.reduce((sum, driver) => sum + (driver.reportedRevenue ?? driver.revenue), 0);
  const fleetMiles = drivers.reduce((sum, driver) => sum + (driver.reportedMiles ?? driver.miles), 0);

  return {
    title: null,
    fileName: meta.fileName,
    sheetName: meta.sheetName,
    dates,
    weekStart: dateKeys[0] ?? null,
    weekEnd: dateKeys[dateKeys.length - 1] ?? null,
    drivers,
    fleetRevenue,
    fleetMiles,
    fleetRpm: fleetMiles > 0 ? fleetRevenue / fleetMiles : null,
    fleetReported: null,
    warnings: ["Reopened from saved history — driver-day records restored."],
    skipped: [],
    instructions: [],
    commentsCaveat: false,
    source: "stored",
  };
}

export function statusTone(status: string | null, hasRate: boolean): "work" | "home" | "enroute" | "oos" | "note" | "empty" {
  if (status) {
    const upper = status.toUpperCase();
    if (/^HOME/.test(upper)) return "home";
    if (/EN ?ROUTE|TRANSIT|MOVING/.test(upper)) return "enroute";
    if (/OOS|OUT OF SERVICE|BREAKDOWN|SHOP|REPAIR/.test(upper)) return "oos";
    return "note";
  }
  return hasRate ? "work" : "empty";
}
