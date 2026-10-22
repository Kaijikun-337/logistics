import type { CanonicalField, ColumnMapping, FieldKind } from "./types";

export type FieldDefinition = {
  key: CanonicalField;
  label: string;
  group: "Identity" | "Route" | "Timing" | "Cargo" | "Commercial";
  kind: FieldKind;
  synonyms: string[];
};

export const FIELDS: FieldDefinition[] = [
  {
    key: "shipmentId",
    label: "Shipment ID",
    group: "Identity",
    kind: "text",
    synonyms: [
      "shipment id",
      "shipment number",
      "shipment no",
      "shipment",
      "ship id",
      "shp",
      "shp id",
      "pro number",
      "pro",
      "tracking number",
      "tracking no",
      "tracking",
      "awb",
      "awb number",
      "bol",
      "b l",
      "load id",
      "order id",
      "order number",
      "order no",
      "consignment",
      "waybill",
    ],
  },
  {
    key: "reference",
    label: "Reference",
    group: "Identity",
    kind: "text",
    synonyms: [
      "reference",
      "reference number",
      "reference no",
      "ref",
      "customer reference",
      "po number",
      "po",
      "purchase order",
      "invoice number",
      "invoice no",
      "booking",
      "booking number",
      "booking no",
      "manifest id",
    ],
  },
  {
    key: "customer",
    label: "Customer",
    group: "Commercial",
    kind: "text",
    synonyms: [
      "customer",
      "customer name",
      "client",
      "client name",
      "account",
      "account name",
      "consignee",
      "consignee name",
      "shipper",
      "shipper name",
      "company",
      "bill to",
      "sold to",
      "party",
      "customer party",
      "sold to party",
      "bill to party",
      "counterparty",
      "account holder",
      "brand owner",
    ],
  },
  {
    key: "carrier",
    label: "Carrier",
    group: "Route",
    kind: "text",
    synonyms: [
      "carrier",
      "carrier name",
      "vendor",
      "vendor name",
      "transporter",
      "freight forwarder",
      "forwarder",
      "airline",
      "shipping line",
      "scac",
      "courier",
      "provider",
      "carrier scac",
      "haulier",
      "line",
      "shipping company",
      "logistics provider",
      "3pl",
    ],
  },
  {
    key: "driver",
    label: "Driver",
    group: "Route",
    kind: "text",
    synonyms: ["driver", "driver name", "operator", "operator name", "pilot", "captain", "assigned to"],
  },
  {
    key: "mode",
    label: "Mode",
    group: "Cargo",
    kind: "mode",
    synonyms: [
      "mode",
      "transport mode",
      "ship mode",
      "shipment mode",
      "service",
      "service type",
      "service level",
      "equipment",
      "equipment type",
      "vehicle type",
      "vehicle",
      "truck type",
      "container type",
    ],
  },
  {
    key: "origin",
    label: "Origin",
    group: "Route",
    kind: "text",
    synonyms: [
      "origin",
      "origin city",
      "pickup",
      "pickup city",
      "pickup location",
      "pickup address",
      "from",
      "from city",
      "origin address",
      "shipper city",
      "pol",
      "port of loading",
      "departure city",
    ],
  },
  {
    key: "destination",
    label: "Destination",
    group: "Route",
    kind: "text",
    synonyms: [
      "destination",
      "destination city",
      "delivery",
      "delivery city",
      "delivery location",
      "delivery address",
      "to",
      "to city",
      "destination address",
      "consignee city",
      "pod",
      "port of discharge",
      "arrival city",
    ],
  },
  {
    key: "status",
    label: "Status",
    group: "Identity",
    kind: "status",
    synonyms: [
      "status",
      "shipment status",
      "delivery status",
      "current status",
      "state",
      "stage",
      "milestone",
      "tracking status",
    ],
  },
  {
    key: "pickupDate",
    label: "Pickup date",
    group: "Timing",
    kind: "date",
    synonyms: [
      "pickup date",
      "pickup dt",
      "pickup eta",
      "pickup time",
      "ship date",
      "shipped date",
      "shipped on",
      "dispatch date",
      "dispatched date",
      "departure date",
      "departure",
      "departing",
      "etd",
      "etd date",
      "load date",
      "collection date",
    ],
  },
  {
    key: "deliveryDate",
    label: "Delivery date",
    group: "Timing",
    kind: "date",
    synonyms: [
      "delivery date",
      "delivery dt",
      "delivery eta",
      "delivery time",
      "eta",
      "eta date",
      "arrival date",
      "arrival",
      "arriving",
      "due date",
      "expected delivery",
      "expected delivery date",
      "delivered date",
      "pod date",
      "drop date",
      "completion date",
    ],
  },
  {
    key: "weight",
    label: "Weight",
    group: "Cargo",
    kind: "number",
    synonyms: [
      "weight",
      "weight kg",
      "weight lbs",
      "gross weight",
      "gross weight kg",
      "net weight",
      "chargeable weight",
      "total weight",
      "kg",
      "kgs",
      "lbs",
    ],
  },
  {
    key: "pieces",
    label: "Pieces",
    group: "Cargo",
    kind: "number",
    synonyms: [
      "pieces",
      "pcs",
      "qty",
      "quantity",
      "units",
      "cartons",
      "boxes",
      "pallets",
      "skids",
      "cases",
      "units shipped",
      "item count",
      "load",
      "loads",
      "load count",
      "loads booked",
      "shipment count",
      "stop count",
    ],
  },
  {
    key: "distance",
    label: "Distance",
    group: "Route",
    kind: "number",
    synonyms: [
      "distance",
      "distance miles",
      "distance km",
      "distance mi",
      "miles",
      "mile",
      "mi",
      "mileage",
      "total miles",
      "miles driven",
      "driven miles",
      "route miles",
      "empty miles",
      "km",
      "kilometers",
      "kilometres",
      "leg miles",
      "trip miles",
      "lane distance",
    ],
  },
  {
    key: "cost",
    label: "Freight cost",
    group: "Commercial",
    kind: "currency",
    synonyms: [
      "freight cost",
      "freight",
      "cost",
      "total cost",
      "carrier cost",
      "shipment cost",
      "charge",
      "charges",
      "amount",
      "invoice amount",
      "billed amount",
      "price",
      "rate",
      "total",
      "revenue",
      "spend",
    ],
  },
  {
    key: "currency",
    label: "Currency",
    group: "Commercial",
    kind: "text",
    synonyms: ["currency", "curr", "ccy", "currency code", "fx"],
  },
  {
    key: "notes",
    label: "Notes",
    group: "Identity",
    kind: "text",
    synonyms: [
      "notes",
      "note",
      "comments",
      "comment",
      "remarks",
      "remark",
      "description",
      "special instructions",
      "instructions",
      "exception notes",
      "exception",
    ],
  },
];

export const FIELD_BY_KEY: Record<CanonicalField, FieldDefinition> = FIELDS.reduce(
  (acc, field) => {
    acc[field.key] = field;
    return acc;
  },
  {} as Record<CanonicalField, FieldDefinition>,
);

export const FIELD_ORDER: CanonicalField[] = FIELDS.map((field) => field.key);

const SYNONYM_INDEX: { field: CanonicalField; synonym: string }[] = FIELDS.flatMap((field) =>
  field.synonyms.map((synonym) => ({ field: field.key, synonym: normalizeText(synonym) })),
).sort((a, b) => b.synonym.length - a.synonym.length);

export function normalizeText(value: string): string {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Maps a spreadsheet header to a canonical logistics field, if we recognise it. */
export function detectField(header: string): CanonicalField | null {
  const normalized = normalizeText(header);
  if (!normalized) return null;

  const exact = SYNONYM_INDEX.find((entry) => entry.synonym === normalized);
  if (exact) return exact.field;

  let best: { field: CanonicalField; score: number } | null = null;
  for (const entry of SYNONYM_INDEX) {
    if (entry.synonym.length < 5) continue;
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(entry.synonym)}(\\s|$)`);
    if (!pattern.test(normalized)) continue;
    const score = entry.synonym.length + (normalized.startsWith(entry.synonym) ? 2 : 0);
    if (!best || score > best.score) best = { field: entry.field, score };
  }

  return best?.field ?? null;
}

export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const claimed = new Set<CanonicalField>();

  for (const header of headers) {
    const field = detectField(header);
    if (field && !claimed.has(field)) {
      mapping[header] = field;
      claimed.add(field);
    } else {
      mapping[header] = "";
    }
  }

  return mapping;
}

export function mappedHeaders(headers: string[], mapping: ColumnMapping): string[] {
  return headers.filter((header) => Boolean(mapping[header]));
}

export function headerForField(headers: string[], mapping: ColumnMapping, field: CanonicalField): string | null {
  return headers.find((header) => mapping[header] === field) ?? null;
}

/* ------------------------------------------------------------------ */
/* Value formatting                                                    */
/* ------------------------------------------------------------------ */

export function parseNumeric(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

const FALLBACK_CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AED: "AED ",
  CAD: "C$",
  AUD: "A$",
  SGD: "S$",
  JPY: "¥",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizeCurrency(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

export function formatMoney(value: number, currency?: string | null): string {
  const code = normalizeCurrency(currency);
  const fractionDigits = Math.abs(value) >= 1000 || Number.isInteger(value) ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code || "USD",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    const symbol = FALLBACK_CURRENCY_SYMBOLS[code] ?? `${code} `;
    return `${symbol}${value.toLocaleString("en-US", { maximumFractionDigits: fractionDigits })}`;
  }
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

/** Parses the common date shapes you get out of Excel: ISO, m/d/y, d/m/y, y-m-d h:mm. */
export function parseDateParts(raw: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return validParts(y, m, d);
  }

  match = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (match) return validParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    const y = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const m = a > 12 ? b : a;
    const d = a > 12 ? a : b;
    return validParts(y, m, d);
  }

  match = value.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{2,4})/);
  if (match) {
    const monthIndex = MONTHS.findIndex((month) => month.toLowerCase() === match![2].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) {
      const y = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      return validParts(y, monthIndex + 1, Number(match[1]));
    }
  }

  return null;
}

function validParts(y: number, m: number, d: number): { y: number; m: number; d: number } | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  return { y, m, d };
}

export function formatDate(raw: string | null | undefined): string {
  const parts = parseDateParts(raw);
  if (!parts) return (raw ?? "").trim();
  return `${MONTHS[parts.m - 1]} ${parts.d}, ${parts.y}`;
}

export function formatDateShort(raw: string | null | undefined): string {
  const parts = parseDateParts(raw);
  if (!parts) return "";
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`;
}

export function detectWeightUnit(header: string | null | undefined): string {
  const normalized = normalizeText(header ?? "");
  if (/(lbs|pounds|lb)/.test(normalized)) return "lb";
  return "kg";
}

export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value);
}

/* ------------------------------------------------------------------ */
/* Statuses & modes                                                    */
/* ------------------------------------------------------------------ */

export type Tone = "green" | "blue" | "amber" | "red" | "slate" | "violet";

export type StatusInfo = {
  key: "delivered" | "in_transit" | "delayed" | "exception" | "pending" | "cancelled" | "unknown";
  label: string;
  tone: Tone;
};

export const STATUS_ORDER: StatusInfo["key"][] = [
  "delivered",
  "in_transit",
  "delayed",
  "pending",
  "exception",
  "cancelled",
  "unknown",
];

export const STATUS_LABEL: Record<StatusInfo["key"], string> = {
  delivered: "Delivered",
  in_transit: "In transit",
  delayed: "Delayed",
  pending: "Pending",
  exception: "Exception",
  cancelled: "Cancelled",
  unknown: "Unspecified",
};

const STATUS_TONE: Record<StatusInfo["key"], Tone> = {
  delivered: "green",
  in_transit: "blue",
  delayed: "amber",
  pending: "violet",
  exception: "red",
  cancelled: "slate",
  unknown: "slate",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function classifyStatus(raw: string | null | undefined): StatusInfo {
  const value = normalizeText(raw ?? "");
  let key: StatusInfo["key"] = "unknown";

  if (!value) key = "unknown";
  else if (/(cancel|void|abort|reject)/.test(value)) key = "cancelled";
  else if (/(exception|damage|failed|failure|return|shortage|lost|claim|hold at)/.test(value)) key = "exception";
  else if (/(delay|late|missed|overdue|behind)/.test(value)) key = "delayed";
  else if (/(delivered|completed|complete|pod|dropped|signed|closed|fulfilled)/.test(value)) key = "delivered";
  else if (/(transit|shipped|dispatched|moving|en route|on route|out for delivery|picked up|departed|in progress|roll|loaded|on the way)/.test(value))
    key = "in_transit";
  else if (/(pending|booked|ready|scheduled|created|new|planned|draft|awaiting|on hold|tendered|confirmed)/.test(value)) key = "pending";

  const label = raw && raw.trim() ? titleCase(raw.trim()) : STATUS_LABEL[key];
  return { key, label, tone: STATUS_TONE[key] };
}

export function toneClasses(tone: Tone): { bg: string; text: string; dot: string; border: string } {
  switch (tone) {
    case "green":
      return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-200" };
    case "blue":
      return { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", border: "border-sky-200" };
    case "amber":
      return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200" };
    case "red":
      return { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500", border: "border-rose-200" };
    case "violet":
      return { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500", border: "border-indigo-200" };
    default:
      return { bg: "bg-stone-100", text: "text-stone-600", dot: "bg-stone-400", border: "border-stone-200" };
  }
}

const MODE_GROUPS: { pattern: RegExp; label: string }[] = [
  { pattern: /(air|cargo plane|plane|flight)/, label: "Air" },
  { pattern: /(ocean|sea|fcl|lcl|vessel|ship)/, label: "Ocean" },
  { pattern: /(rail|train)/, label: "Rail" },
  { pattern: /(parcel|courier|express|last mile)/, label: "Parcel" },
  { pattern: /(ltl|ftl|truck|road|van|trailer|reefer|flatbed|drayage)/, label: "Road" },
];

export function classifyMode(raw: string | null | undefined): string {
  const value = normalizeText(raw ?? "");
  if (!value) return "";
  const match = MODE_GROUPS.find((group) => group.pattern.test(value));
  return match?.label ?? titleCase(raw ?? "");
}

export function kindForField(field: CanonicalField | "" | null | undefined): FieldKind {
  if (!field) return "text";
  return FIELD_BY_KEY[field].kind;
}
