# mimiuchi

A personal audio library web app for browsing and playing locally-stored audio works. Scans a folder of RJ-coded releases, fetches metadata from DLsite and HVDB, and exposes a Next.js UI with fuzzy Japanese search, a liked-tracks view, and a persistent player.

**Stack:** Next.js 16 · React 19 · TypeScript · SQLite (better-sqlite3) + Drizzle ORM · base-ui + shadcn · MiniSearch + kuroshiro

<p align="center">
  <img src="assets/screenshot_desktop.png" alt="Desktop" width="70%">
  <img src="assets/screenshot_mobile.png" alt="Mobile" width="25%">
</p>

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/installation)
- A directory of audio works named by DLsite RJ code (e.g. `RJ01000380/...`)

## Setup

```bash
git clone https://github.com/4890A/mimiuchi.git
cd mimiuchi/web
pnpm install
cp .env.example .env.local
```

Edit `web/.env.local` and set the variables below.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `KIKOERU_LIBRARY_ROOT` | yes | Absolute path to the folder containing your RJ-coded work directories |
| `KIKOERU_PASSWORD` | yes | Shared password used to log in (any non-empty string) |
| `KIKOERU_SESSION_SECRET` | no | Overrides the session-cookie signing key. If unset, a random 32-byte secret is generated on first run and stored in `<KIKOERU_DATA_DIR>/session-secret` |
| `KIKOERU_DATA_DIR` | no | Where the SQLite database lives (defaults to `../data` relative to `web/`) |
| `KIKOERU_COVERS_DIR` | no | Where cover art is cached (defaults to `<project-root>/covers`) |

## Running

All commands run from the `web/` directory.

```bash
pnpm dev            # start the dev server on http://localhost:3000
```

The SQLite schema is created and migrated automatically on first connection —
a fresh checkout provisions an empty database on startup, so there's no manual
migration step. (Existing databases from before automatic migrations are
detected and left untouched.)

On first visit, log in with `KIKOERU_PASSWORD`. Then trigger a library scan from the in-app **Scan** button — it walks `KIKOERU_LIBRARY_ROOT`, fetches metadata, and streams progress to a panel in the bottom-right. Re-run whenever you add new works.

> A `pnpm scan` CLI script also exists (`web/scripts/scan.ts`) if you'd rather run the scan headlessly.

### Other scripts

- `pnpm build` / `pnpm start` — production build & serve
- `pnpm lint` — ESLint
- `pnpm db:studio` — open Drizzle Studio against the SQLite db
- `pnpm db:generate` — after editing `schema.ts`, generate a migration into `web/drizzle/` and commit it; it's applied automatically on the next start
- `pnpm db:push` — push the schema to the db directly without a migration (handy for quick local iteration)

## Project layout

```
.
├── web/              Next.js app (source, scripts, configs)
├── data/             SQLite database  (gitignored)
└── covers/           Cached cover art (gitignored)
```
