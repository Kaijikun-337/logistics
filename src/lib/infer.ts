import { classifyStatus, detectField, normalizeText, parseDateParts, parseNumeric } from "./fields";
import { looksLikePlace } from "./gazetteer";
import type { CanonicalField, ColumnMapping, RawRow } from "./types";

export type MappingSource = "learned" | "header" | "values" | "manual" | "none";

export type ColumnMeta = {
  field: CanonicalField | "";
  source: MappingSource;
  confidence: number;
  reason: string;
};

export type Inference = {
  mapping: ColumnMapping;
  meta: Record<string, ColumnMeta>;
  inferredHeaders: string[];
};

export type AliasMap = Record<string, CanonicalField>;

type Candidate = { field: CanonicalField; confidence: number; reason: string };

const MAX_SAMPLES = 80;
const DECIMAL_PLACES_FIELDS: CanonicalField[] = ["cost", "weight", "pieces"];

function samplesFor(rows: RawRow[], header: string): string[] {
  const values: string[] = [];
  for (const row of rows) {
    const value = (row[header] ?? "").trim();
    if (!value) continue;
    values.push(value);
    if (values.length >= MAX_SAMPLES) break;
  }
  return values;
}

function ratio(hits: number, total: number): number {
  return total === 0 ? 0 : hits / total;
}

const DATE_FIELDS = new Set<CanonicalField>(["pickupDate", "deliveryDate"]);

const TEXTUAL_FIELDS = new Set<CanonicalField>([
  "shipmentId",
  "reference",
  "customer",
  "carrier",
  "driver",
  "mode",
  "origin",
  "destination",
  "status",
  "currency",
  "notes",
]);

type Profile = {
  filled: number;
  dateShare: number;
  numericShare: number;
  placeShare: number;
  statusShare: number;
  modeShare: number;
  currencyShare: number;
  longTextShare: number;
};

/** Header words that settle which leg of the journey a date column describes. */
function dateHintFromHeader(header: string): CanonicalField | null {
  const normalized = normalizeText(header);
  if (/(delivery|deliver|eta|arrival|arrive|due|drop|pod|completion|complete)/.test(normalized)) return "deliveryDate";
  if (/(pickup|pick up|pick|ship|dispatch|departure|depart|collect|load|etd|start|outbound)/.test(normalized))
    return "pickupDate";
  return null;
}

/** Stricter than parseNumeric: "AB-201" is an ID, not a number. */
function isPlainNumberValue(value: string): boolean {
  return /^\(?-?[$€£¥₹]?\s?\d[\d,.\s]*\)?\s*(kg|kgs|lbs|lb|t|tons?|pcs|ctns?|cartons?|units?|%)?$/i.test(
    value.trim(),
  );
}

function looksLikeShipmentId(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  if (/^[A-Z]{1,8}[-_/]?\d{3,}[A-Z0-9-]*$/i.test(compact)) return true;
  if (/^\d{9,}$/.test(compact)) return true;
  if (/^\d{3,4}-\d{4,8}$/.test(compact)) return true;
  return false;
}

function hasCurrencySignal(values: string[]): boolean {
  const withSymbol = values.filter((value) => /[$€£¥₹]/.test(value)).length;
  const withDecimals = values.filter((value) => /^-?\d+[.,]\d{2}$/.test(value.trim())).length;
  return ratio(withSymbol, values.length) >= 0.3 || ratio(withDecimals, values.length) >= 0.4;
}

function averageLength(values: string[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value.length, 0) / values.length;
}

/** Scores what the values in a column *look like*, independent of its header. */
function valueCandidates(values: string[], hasCurrencyColumn: boolean): Candidate[] {
  if (values.length === 0) return [];
  const total = values.length;
  const candidates: Candidate[] = [];

  const numericValues = values.filter((value) => isPlainNumberValue(value) && parseNumeric(value) !== null);
  const dateValues = values.filter((value) => parseDateParts(value) !== null);
  const currencyValues = values.filter((value) => /^[A-Z]{3}$/.test(value.trim()));
  const statusValues = values.filter((value) => {
    if (value.trim().length > 28) return false;
    const info = classifyStatus(value);
    return info.key !== "unknown";
  });
  const modeValues = values.filter((value) => /(air|ocean|sea|road|rail|truck|ltl|ftl|fcl|lcl|parcel|courier|express|reefer|drayage|van|flight|vessel)/i.test(value));
  const placeValues = values.filter((value) => looksLikePlace(value));
  const idValues = values.filter((value) => looksLikeShipmentId(value));
  const longText = values.filter((value) => value.length >= 55);

  const numericShare = ratio(numericValues.length, total);
  const dateShare = ratio(dateValues.length, total);
  const currencyShare = ratio(currencyValues.length, total);
  const statusShare = ratio(statusValues.length, total);
  const modeShare = ratio(modeValues.length, total);
  const placeShare = ratio(placeValues.length, total);
  const idShare = ratio(idValues.length, total);
  const longTextShare = ratio(longText.length, total);

  if (statusShare >= 0.5) {
    candidates.push({
      field: "status",
      confidence: Math.min(0.94, 0.6 + statusShare * 0.35),
      reason: `${Math.round(statusShare * 100)}% of values read as shipment statuses`,
    });
  }

  if (modeShare >= 0.5 && averageLength(values) <= 26) {
    candidates.push({
      field: "mode",
      confidence: Math.min(0.9, 0.55 + modeShare * 0.35),
      reason: `${Math.round(modeShare * 100)}% of values look like transport modes`,
    });
  }

  if (currencyShare >= 0.85 && currencyValues.length <= 4) {
    candidates.push({
      field: "currency",
      confidence: Math.min(0.96, 0.7 + currencyShare * 0.25),
      reason: "ISO currency codes repeated across rows",
    });
  }

  if (dateShare >= 0.75) {
    candidates.push({
      field: "deliveryDate",
      confidence: Math.min(0.86, 0.5 + dateShare * 0.32),
      reason: `${Math.round(dateShare * 100)}% of values parse as dates`,
    });
  }

  if (idShare >= 0.7 && !/(\d+[.,]\d{2})$/.test(values[0] ?? "")) {
    candidates.push({
      field: "shipmentId",
      confidence: Math.min(0.82, 0.5 + idShare * 0.3),
      reason: "prefixed or long numeric identifiers",
    });
  }

  if (longTextShare >= 0.5 || averageLength(values) >= 70) {
    candidates.push({
      field: "notes",
      confidence: 0.6,
      reason: "long free-text values",
    });
  }

  if (numericShare >= 0.8 && currencyValues.length === 0) {
    const currencySignal = hasCurrencySignal(values) || (hasCurrencyColumn && !dateValues.length);
    if (currencySignal) {
      candidates.push({
        field: "cost",
        confidence: 0.62,
        reason: "numeric amounts with currency formatting",
      });
    } else {
      candidates.push({
        field: "weight",
        confidence: 0.5,
        reason: "plain numeric measurements",
      });
    }
  }

  if (placeShare >= 0.6) {
    candidates.push({
      field: "destination",
      confidence: Math.min(0.8, 0.45 + placeShare * 0.35),
      reason: `${Math.round(placeShare * 100)}% of values match known cities or countries`,
    });
  }

  if (numericShare >= 0.8 && numericShare < 1 && !currencyValues.length) {
    candidates.push({ field: "pieces", confidence: 0.45, reason: "mostly small whole numbers" });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Works out a mapping for arbitrary headers. Order of trust:
 * 1. aliases the team already confirmed (learned)
 * 2. header-name synonyms
 * 3. what the values look like
 * Every canonical field can only be claimed once, highest confidence wins.
 */
export function inferColumns(headers: string[], rows: RawRow[], aliases: AliasMap = {}): Inference {
  const mapping: ColumnMapping = {};
  const meta: Record<string, ColumnMeta> = {};
  const claimed = new Set<CanonicalField>();

  // Pass 1 — learned aliases win outright.
  for (const header of headers) {
    const learned = aliases[normalizeText(header)];
    if (learned && !claimed.has(learned)) {
      mapping[header] = learned;
      claimed.add(learned);
      meta[header] = { field: learned, source: "learned", confidence: 1, reason: "remembered from a previous import" };
    } else {
      mapping[header] = "";
    }
  }

  // Profiles let us check header guesses against what is actually in the cells.
  const profileCache = new Map<string, Profile>();
  const profileFor = (header: string): Profile => {
    const cached = profileCache.get(header);
    if (cached) return cached;
    const samples = samplesFor(rows, header);
    const total = samples.length;
    const profile: Profile = {
      filled: total,
      dateShare: ratio(samples.filter((value) => parseDateParts(value) !== null).length, total),
      numericShare: ratio(samples.filter((value) => isPlainNumberValue(value) && parseNumeric(value) !== null).length, total),
      placeShare: ratio(samples.filter((value) => looksLikePlace(value)).length, total),
      statusShare: ratio(samples.filter((value) => classifyStatus(value).key !== "unknown").length, total),
      modeShare: ratio(samples.filter((value) => /(air|ocean|sea|road|rail|truck|ltl|ftl|fcl|lcl|parcel|courier|express|reefer|drayage)/i.test(value)).length, total),
      currencyShare: ratio(samples.filter((value) => /^[A-Z]{3}$/.test(value.trim())).length, total),
      longTextShare: ratio(samples.filter((value) => value.length >= 55).length, total),
    };
    profileCache.set(header, profile);
    return profile;
  };

  // Pass 2 — header synonyms, but only where the values agree with the name.
  const proposals: { header: string; field: CanonicalField }[] = [];
  for (const header of headers) {
    if (mapping[header]) continue;
    const field = detectField(header);
    if (!field) continue;
    const profile = profileFor(header);
    if (profile.filled > 0) {
      const datesButNotADateField = DATE_FIELDS.has(field) === false && profile.dateShare >= 0.85;
      const numbersButTextExpected = TEXTUAL_FIELDS.has(field) && profile.numericShare >= 0.95;
      const dateFieldWithoutDates = DATE_FIELDS.has(field) && profile.dateShare < 0.25 && profile.numericShare < 0.9;
      const currencyWithoutCodes = field === "currency" && profile.currencyShare < 0.4;
      if (datesButNotADateField || numbersButTextExpected || dateFieldWithoutDates || currencyWithoutCodes) continue;
    }
    proposals.push({ header, field });
  }

  const evidenceFor = ({ header, field }: { header: string; field: CanonicalField }): number => {
    const profile = profileFor(header);
    if (DATE_FIELDS.has(field)) return 0.4 + profile.dateShare;
    if (field === "currency") return 0.4 + profile.currencyShare;
    if (field === "status") return 0.4 + profile.statusShare;
    if (field === "mode") return 0.4 + profile.modeShare;
    if (field === "origin" || field === "destination") return 0.4 + profile.placeShare;
    if (field === "notes") return 0.4 + profile.longTextShare;
    return 0.9;
  };

  proposals.sort((a, b) => {
    if (evidenceFor(a) !== evidenceFor(b)) return evidenceFor(b) - evidenceFor(a);
    return headers.indexOf(a.header) - headers.indexOf(b.header);
  });

  for (const proposal of proposals) {
    if (claimed.has(proposal.field)) continue;
    mapping[proposal.header] = proposal.field;
    claimed.add(proposal.field);
    meta[proposal.header] = {
      field: proposal.field,
      source: "header",
      confidence: 0.95,
      reason: "column name matched a known logistics field",
    };
  }

  // Pass 3 — value sniffing for whatever is left.
  const hasCurrencyColumn = headers.some((header) => mapping[header] === "currency");
  const valueGuesses: { header: string; candidate: Candidate }[] = [];

  for (const header of headers) {
    if (mapping[header]) continue;
    const samples = samplesFor(rows, header);
    const candidates = valueCandidates(samples, hasCurrencyColumn);
    const best = candidates.find((candidate) => !claimed.has(candidate.field));
    if (best) valueGuesses.push({ header, candidate: best });
  }

  valueGuesses.sort((a, b) => b.candidate.confidence - a.candidate.confidence);

  const dateColumns: string[] = [];
  const placeColumns: string[] = [];
  const numericColumns: string[] = [];

  for (const guess of valueGuesses) {
    const { header, candidate } = guess;
    if (mapping[header]) continue;

    if (candidate.field === "deliveryDate") {
      dateColumns.push(header);
      continue;
    }
    if (candidate.field === "destination") {
      placeColumns.push(header);
      continue;
    }
    if (candidate.field === "weight" || candidate.field === "cost" || candidate.field === "pieces") {
      numericColumns.push(header);
      meta[header] = { field: "", source: "values", confidence: candidate.confidence, reason: candidate.reason };
      continue;
    }
    if (claimed.has(candidate.field)) continue;

    mapping[header] = candidate.field;
    claimed.add(candidate.field);
    meta[header] = {
      field: candidate.field,
      source: "values",
      confidence: candidate.confidence,
      reason: candidate.reason,
    };
  }

  // Dates: first anonymous date column is the outward leg, second is the ETA.
  dateColumns.forEach((header, index) => {
    if (mapping[header]) return;
    const hinted = dateHintFromHeader(header);
    const preferred = hinted && !claimed.has(hinted) ? hinted : index === 0 ? "pickupDate" : "deliveryDate";
    const fallback = preferred === "pickupDate" ? "deliveryDate" : "pickupDate";
    const field = !claimed.has(preferred) ? preferred : !claimed.has(fallback) ? fallback : null;
    if (!field) return;
    mapping[header] = field;
    claimed.add(field);
    const multiple = dateColumns.length > 1;
    meta[header] = {
      field,
      source: "values",
      confidence: hinted === field ? 0.72 : index === 0 ? 0.58 : 0.62,
      reason:
        hinted === field
          ? "date values combined with the column wording"
          : multiple
            ? index === 0
              ? "first of the date columns, treated as the pickup"
              : "second date column, treated as the delivery/ETA"
            : "only date column, treated as the pickup",
    };
  });

  // Places: first column of cities is the origin, second the destination.
  placeColumns.forEach((header, index) => {
    if (mapping[header]) return;
    const preferred = index === 0 ? "origin" : "destination";
    const fallback = index === 0 ? "destination" : "origin";
    const field = !claimed.has(preferred) ? preferred : !claimed.has(fallback) ? fallback : null;
    if (!field) return;
    mapping[header] = field;
    claimed.add(field);
    meta[header] = {
      field,
      source: "values",
      confidence: 0.62,
      reason: index === 0 ? "first city-like column, read as the origin" : "second city-like column, read as the destination",
    };
  });

  // Numbers: prefer currency-looking columns for cost, leftovers for weight/pieces.
  const openNumeric = numericColumns.filter((header) => !mapping[header]);
  for (const header of openNumeric) {
    const samples = samplesFor(rows, header);
    const ordered: CanonicalField[] = hasCurrencySignal(samples) || hasCurrencyColumn
      ? ["cost", "weight", "pieces", ...DECIMAL_PLACES_FIELDS]
      : ["weight", "cost", "pieces"];
    const field = ordered.find((candidate) => !claimed.has(candidate));
    if (!field) continue;
    mapping[header] = field;
    claimed.add(field);
    const previous = meta[header];
    meta[header] = {
      field,
      source: "values",
      confidence: 0.45,
      reason: previous?.reason ?? "numeric column, inferred by elimination",
    };
  }

  for (const header of headers) {
    if (!meta[header]) {
      meta[header] = { field: mapping[header], source: mapping[header] ? "header" : "none", confidence: 0, reason: "not recognised — kept as a raw column" };
    }
  }

  const inferredHeaders = headers.filter((header) => meta[header]?.source === "values" && mapping[header]);

  return { mapping, meta, inferredHeaders };
}

export function sourceLabelFor(source: MappingSource): string {
  switch (source) {
    case "learned":
      return "Learned";
    case "header":
      return "Header match";
    case "values":
      return "Inferred";
    case "manual":
      return "Manual";
    default:
      return "Unmapped";
  }
}
