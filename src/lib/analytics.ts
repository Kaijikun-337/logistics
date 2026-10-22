import {
  classifyStatus,
  detectWeightUnit,
  formatCompactNumber,
  headerForField,
  normalizeCurrency,
  parseNumeric,
  STATUS_LABEL,
  STATUS_ORDER,
  type StatusInfo,
  type Tone,
} from "./fields";
import type { ColumnMapping, RawRow } from "./types";

export type StatusBucket = { key: StatusInfo["key"]; label: string; count: number; percent: number; tone: Tone };

export type Breakdown = { label: string; count: number; percent: number };

export type QualityIssue = { label: string; count: number; tone: "amber" | "red" | "slate" };

export type Insights = {
  total: number;
  mappedColumns: number;
  totalColumns: number;
  statusHeader: string | null;
  statusBuckets: StatusBucket[];
  unclassified: number;
  onTrackRate: number | null;
  costHeader: string | null;
  costTotal: number | null;
  costAverage: number | null;
  missingCost: number;
  currency: string;
  currencyCount: number;
  weightHeader: string | null;
  weightTotal: number | null;
  weightUnit: string;
  laneHeaderPair: { origin: string; destination: string } | null;
  topLanes: Breakdown[];
  carriers: Breakdown[];
  customers: Breakdown[];
  deliveryWindow: { from: string; to: string } | null;
  qualityScore: number;
  qualityIssues: QualityIssue[];
  duplicateShipments: number;
};

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function toBreakdown(counts: Map<string, number>, total: number, limit = 5): Breakdown[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, percent: percent(count, total) }));
}

export function statusOfRow(row: RawRow, statusHeader: string | null): StatusInfo {
  return classifyStatus(statusHeader ? row[statusHeader] : "");
}

export function buildInsights(headers: string[], rows: RawRow[], mapping: ColumnMapping): Insights {
  const shipmentHeader = headerForField(headers, mapping, "shipmentId");
  const referenceHeader = headerForField(headers, mapping, "reference");
  const customerHeader = headerForField(headers, mapping, "customer");
  const carrierHeader = headerForField(headers, mapping, "carrier");
  const originHeader = headerForField(headers, mapping, "origin");
  const destinationHeader = headerForField(headers, mapping, "destination");
  const statusHeader = headerForField(headers, mapping, "status");
  const costHeader = headerForField(headers, mapping, "cost");
  const currencyHeader = headerForField(headers, mapping, "currency");
  const weightHeader = headerForField(headers, mapping, "weight");
  const deliveryHeader = headerForField(headers, mapping, "deliveryDate");
  const pickupHeader = headerForField(headers, mapping, "pickupDate");

  const total = rows.length;
  const mappedColumns = headers.filter((header) => Boolean(mapping[header])).length;

  const statusCounts = new Map<StatusInfo["key"], number>();
  const laneCounts = new Map<string, number>();
  const carrierCounts = new Map<string, number>();
  const customerCounts = new Map<string, number>();
  const shipmentSeen = new Map<string, number>();
  const currencyCounts = new Map<string, number>();

  let costTotal = 0;
  let costRows = 0;
  let missingCost = 0;
  let weightTotal = 0;
  let weightRows = 0;
  let missingDestination = 0;
  let missingCustomer = 0;
  let duplicateShipments = 0;
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const status = statusOfRow(row, statusHeader);
    statusCounts.set(status.key, (statusCounts.get(status.key) ?? 0) + 1);

    const origin = originHeader ? row[originHeader].trim() : "";
    const destination = destinationHeader ? row[destinationHeader].trim() : "";
    if (destination) {
      if (!origin) laneCounts.set(destination, (laneCounts.get(destination) ?? 0) + 1);
      else laneCounts.set(`${origin} → ${destination}`, (laneCounts.get(`${origin} → ${destination}`) ?? 0) + 1);
    } else if (destinationHeader) {
      missingDestination += 1;
    }

    if (carrierHeader && row[carrierHeader].trim()) {
      const carrier = row[carrierHeader].trim();
      carrierCounts.set(carrier, (carrierCounts.get(carrier) ?? 0) + 1);
    }

    if (customerHeader) {
      const customer = row[customerHeader].trim();
      if (customer) customerCounts.set(customer, (customerCounts.get(customer) ?? 0) + 1);
      else missingCustomer += 1;
    }

    if (shipmentHeader) {
      const id = row[shipmentHeader].trim().toLowerCase();
      if (id) {
        const seen = shipmentSeen.get(id) ?? 0;
        shipmentSeen.set(id, seen + 1);
        if (seen === 1) duplicateShipments += 1;
      }
    }

    if (costHeader) {
      const cost = parseNumeric(row[costHeader]);
      if (cost === null) missingCost += 1;
      else {
        costTotal += cost;
        costRows += 1;
      }
    }

    if (currencyHeader) {
      const currency = normalizeCurrency(row[currencyHeader]);
      if (currency) currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
    }

    if (weightHeader) {
      const weight = parseNumeric(row[weightHeader]);
      if (weight !== null) {
        weightTotal += weight;
        weightRows += 1;
      }
    }

    const dateValue = deliveryHeader ? row[deliveryHeader] : pickupHeader ? row[pickupHeader] : "";
    const parsedDate = dateValue ? Date.parse(normalizeDateString(dateValue)) : Number.NaN;
    if (Number.isFinite(parsedDate)) {
      from = Math.min(from, parsedDate);
      to = Math.max(to, parsedDate);
    }
  }

  const statusBuckets: StatusBucket[] = STATUS_ORDER.map((key) => {
    const count = statusCounts.get(key) ?? 0;
    return { key, label: STATUS_LABEL[key], count, percent: percent(count, total), tone: statusTone(key) };
  }).filter((bucket) => bucket.count > 0);

  const delivered = statusCounts.get("delivered") ?? 0;
  const inTransit = statusCounts.get("in_transit") ?? 0;
  const cancelled = statusCounts.get("cancelled") ?? 0;
  const trackable = total - cancelled;
  const onTrackRate = trackable > 0 ? Math.round(((delivered + inTransit) / trackable) * 100) : null;

  const qualityIssues: QualityIssue[] = [];
  if (duplicateShipments > 0)
    qualityIssues.push({ label: `${duplicateShipments} duplicate shipment ID${duplicateShipments === 1 ? "" : "s"}`, count: duplicateShipments, tone: "amber" });
  if (missingCustomer > 0)
    qualityIssues.push({ label: `${missingCustomer} row${missingCustomer === 1 ? "" : "s"} without a customer`, count: missingCustomer, tone: "red" });
  if (missingDestination > 0)
    qualityIssues.push({ label: `${missingDestination} row${missingDestination === 1 ? "" : "s"} without a destination`, count: missingDestination, tone: "red" });
  if (missingCost > 0)
    qualityIssues.push({ label: `${missingCost} row${missingCost === 1 ? "" : "s"} with an unreadable cost`, count: missingCost, tone: "amber" });
  if (!statusHeader) qualityIssues.push({ label: "No status column detected", count: 0, tone: "slate" });
  if (!shipmentHeader) qualityIssues.push({ label: "No shipment ID column detected", count: 0, tone: "slate" });
  const unmapped = headers.filter((header) => !mapping[header]);
  if (unmapped.length > 0) qualityIssues.push({ label: `${unmapped.length} unmapped column${unmapped.length === 1 ? "" : "s"} kept as raw data`, count: unmapped.length, tone: "slate" });
  if (qualityIssues.length === 0) qualityIssues.push({ label: "Every checked field looks complete", count: 0, tone: "slate" });

  const penalties = missingCustomer + missingDestination + missingCost + duplicateShipments * 2 + unmapped.length * 2;
  const qualityScore = mappedColumns === 0 ? 0 : Math.max(35, Math.min(100, Math.round(100 - (penalties / Math.max(total, 1)) * 22)));

  const topCurrency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return {
    total,
    mappedColumns,
    totalColumns: headers.length,
    statusHeader,
    statusBuckets,
    unclassified: statusCounts.get("unknown") ?? 0,
    onTrackRate,
    costHeader,
    costTotal: costRows > 0 ? costTotal : null,
    costAverage: costRows > 0 ? costTotal / costRows : null,
    missingCost,
    currency: topCurrency,
    currencyCount: currencyCounts.size,
    weightHeader,
    weightTotal: weightRows > 0 ? weightTotal : null,
    weightUnit: detectWeightUnit(weightHeader),
    laneHeaderPair: originHeader || destinationHeader ? { origin: originHeader ?? "", destination: destinationHeader ?? "" } : null,
    topLanes: toBreakdown(laneCounts, total),
    carriers: toBreakdown(carrierCounts, total),
    customers: toBreakdown(customerCounts, total),
    deliveryWindow:
      Number.isFinite(from) && Number.isFinite(to)
        ? { from: new Date(from).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10) }
        : null,
    qualityScore,
    qualityIssues,
    duplicateShipments,
  };
}

function normalizeDateString(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}T00:00:00Z`;
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    return `${year}-${month}-${day}T00:00:00Z`;
  }
  return value;
}

function statusTone(key: StatusInfo["key"]): Tone {
  return classifyStatus(STATUS_LABEL[key]).tone;
}

export function summarizeValue(headers: string[], rows: RawRow[], mapping: ColumnMapping) {
  return buildInsights(headers, rows, mapping);
}

export function compact(value: number | null): string {
  if (value === null) return "—";
  return formatCompactNumber(value);
}
