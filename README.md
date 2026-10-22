# Waypoint — Gross Board intake

Turn a trucking **Gross Board** Excel sheet into a clean, filterable dashboard.

- **Web app** (Next.js + Postgres): drop or paste a sheet, confirm how it was read, then get a KPI strip, driver leaderboard with sparklines, week heatmap, audit grid, week-over-week comparison and driver drill-down.
- **Python CLI** (`scripts/`): parses the same 3-row-block layout into a flat `driver-day` frame, a per-driver summary frame, and JSON.

## Run locally

```bash
npm install
cp .env.example .env       # optional — leave DATABASE_URL empty for demo mode
npm run dev                # http://localhost:3000
```

**Demo mode:** with no `DATABASE_URL`, everything works except persistence — the header shows a "Demo mode" banner and imports aren't saved to history. To enable saving:

```bash
# with a Postgres running locally or hosted
DATABASE_URL="postgresql://user:pass@host:5432/db" npx drizzle-kit push
npm run build && npm start
```

Routes: `GET /api/health` reports `{ ok, database, mode }`; `/api/parse` parses uploads; `/api/imports` stores history; `/api/aliases` remembers column names.

## Python parser

```bash
pip install -r requirements.txt
python scripts/make_sample_gross_board.py --out samples
python scripts/parse_gross_board.py samples/gross_board_week42.xlsx --out out
python scripts/test_parse_gross_board.py
```

See `scripts/README.md` for the layout spec, column dictionary and JSON shape.

## Deploying

Build `npm run build`, start `npm run start`. Set `DATABASE_URL` to a managed Postgres (Neon/Railway/Supabase) and run `npx drizzle-kit push` once. Without it the app still builds and runs in demo mode.

> **Before sharing a link:** there is no authentication yet. Put the deployment behind your host's access protection (Vercel Deployment Protection / Cloudflare Access) or add a password middleware, because imports contain driver names and gross figures.

## What's what

| Path | Purpose |
| --- | --- |
| `src/app/` | Next.js routes: intake page, `/api/parse`, `/api/imports`, `/api/aliases`, `/api/health` |
| `src/lib/` | Parsing + inference: `gross-board.ts`, `parse.ts`, `inspect.ts`, `orientation.ts`, `infer.ts`, `fields.ts` |
| `src/components/` | Gross board dashboard, matrix view, data workbench, intake UI |
| `src/db/` | Drizzle schema and optional connection |
| `scripts/` | Python Gross Board parser, sample generator, tests |
| `samples/` | Example workbooks (safe to commit) |
