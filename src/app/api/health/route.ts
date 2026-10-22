import { isDatabaseConfigured, getDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) {
    // Demo mode: the app is healthy, it just has nowhere to persist.
    return Response.json({ ok: true, database: false, mode: "demo" });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: true, mode: "connected" });
  } catch {
    return Response.json({ ok: false, database: isDatabaseConfigured, mode: "error" }, { status: 500 });
  }
}
