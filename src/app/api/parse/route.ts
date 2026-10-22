import * as XLSX from "xlsx";

import { cleanMatrix } from "@/lib/grid";
import { analyzeOrientation } from "@/lib/orientation";
import { buildSheet, parseDelimited, detectDelimiter, stripBom } from "@/lib/parse";
import { MAX_ROWS, type SourceKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_COLUMNS = 120;
const SPREADSHEET_EXTENSIONS = ["xlsx", "xls", "xlsm", "xlsb", "ods"];
const TEXT_EXTENSIONS = ["csv", "tsv", "txt"];

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    const year = cell.getFullYear();
    const month = String(cell.getMonth() + 1).padStart(2, "0");
    const day = String(cell.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  return String(cell).trim();
}

function trimMatrix(matrix: string[][]): string[][] {
  return matrix.slice(0, MAX_ROWS + 20).map((row) => row.slice(0, MAX_COLUMNS));
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Upload the file as multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "No file was received." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ ok: false, error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ ok: false, error: "File is larger than 12 MB. Trim it before importing." }, { status: 413 });
  }

  const extension = extensionOf(file.name);

  try {
    let matrix: string[][] = [];
    let sheetName: string | undefined;
    let sheetNames: string[] = [];

    if (SPREADSHEET_EXTENSIONS.includes(extension)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellNF: false, cellText: false });
      sheetNames = workbook.SheetNames;
      if (sheetNames.length === 0) {
        return Response.json({ ok: false, error: "That workbook has no sheets." }, { status: 422 });
      }
      const requested = form.get("sheet");
      sheetName = typeof requested === "string" && sheetNames.includes(requested) ? requested : sheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      });
      matrix = raw.map((row) => (Array.isArray(row) ? row.map(cellToString) : []));
    } else if (TEXT_EXTENSIONS.includes(extension) || file.type.startsWith("text/") || file.type === "application/vnd.ms-excel") {
      const text = stripBom(await file.text());
      matrix = parseDelimited(text, detectDelimiter(text));
    } else {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
        if (workbook.SheetNames.length === 0) throw new Error("no sheets");
        sheetNames = workbook.SheetNames;
        sheetName = sheetNames[0];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
          header: 1,
          raw: true,
          defval: "",
          blankrows: false,
        });
        matrix = raw.map((row) => (Array.isArray(row) ? row.map(cellToString) : []));
      } catch {
        const text = stripBom(await file.text());
        matrix = parseDelimited(text, detectDelimiter(text));
      }
    }

    const cleaned = cleanMatrix(matrix);
    if (cleaned.length === 0) {
      return Response.json(
        { ok: false, error: "We couldn't find any rows in that file. Check that it isn't empty or password protected." },
        { status: 422 },
      );
    }

    const built = buildSheet(cleaned, { fileName: file.name, source: "file" as SourceKind, sheetName });
    const analysis = analyzeOrientation(cleaned);
    const trimmed = trimMatrix(cleaned);

    return Response.json({
      ok: true,
      matrix: trimmed,
      meta: {
        fileName: file.name,
        source: "file" as SourceKind,
        sheetName: sheetName ?? null,
        sheetNames,
        rowCount: built.sheet.rows.length,
        columnCount: trimmed[0]?.length ?? 0,
      },
      analysis: {
        orientation: analysis.orientation,
        headerRowIndex: analysis.headerRowIndex,
        confidence: analysis.confidence,
        reasons: analysis.reasons,
        rowLabelFields: analysis.rowLabelFields,
      },
    });
  } catch (error) {
    console.error("Failed to parse upload", error);
    return Response.json(
      { ok: false, error: "That file could not be parsed. Try exporting it as CSV or .xlsx and re-import." },
      { status: 422 },
    );
  }
}
