# mimiuchi

A personal audio library web app for browsing and playing locally-stored audio works. Point it at a folder of RJ-coded releases and it builds a searchable, taggable library with covers, metadata, and a player that follows you around the app.

<p align="center">
  <img src="assets/screenshot_desktop.png" alt="Desktop" width="70%">
  <img src="assets/screenshot_mobile.png" alt="Mobile" width="25%">
</p>

## Features

**Library**

- Scans one or more local folders of RJ-coded works and pulls titles, cover art, circle, voice actors, and tags automatically
- Browse by work, by voice actor, or by circle
- Filter by tag, voice actor, and circle, with sorting
- Fuzzy Japanese search with autocomplete — type romaji, kana, or kanji and it finds the match
- Edit a work's cover, voice actors, and metadata by hand; add your own tags; delete an entry
- Reveal a work's folder in your file manager
- Blur R18 covers with one click, and a light/dark theme toggle

**Playback**

- Persistent player bar that keeps playing as you navigate
- Queue, plus media-session support so lock-screen and headset controls work
- Remembers your position in every track and picks up where you left off
- Choose between a classic progress bar or a waveform seek bar that shows loudness so you can see pauses and peaks before scrubbing (generated once per track and cached)
- Per-track bookmarks, stored server-side so they follow you between devices
- Like tracks and browse everything you've liked in one view
- "On deck" row of recently added works, with a shuffle for when you can't decide

**Setup & admin**

- Trigger a library scan from inside the app with live progress
- Single shared password login
- Configure library roots, cover directory, and an optional outbound proxy from the settings page

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/installation)
- A directory of audio works named by DLsite RJ code (e.g. `RJ01000380/...`)
- `ffmpeg` on your `PATH` — optional, only needed for the waveform seek bar (or point `KIKOERU_FFMPEG_PATH` at the binary)

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
| `KIKOERU_FFMPEG_PATH` | no | Path to the `ffmpeg` binary if it isn't on your `PATH` |

## Running

All commands run from the `web/` directory.

```bash
pnpm dev            # start the dev server on http://localhost:3000
```

For production:

```bash
pnpm build
pnpm start
```

The database is created and migrated automatically on first connection — a
fresh checkout provisions an empty database on startup, so there's no manual
migration step. (Existing databases from before automatic migrations are
detected and left untouched.)

On first visit, log in with `KIKOERU_PASSWORD`. Then trigger a library scan from the in-app **Scan** button — it walks your library root, fetches metadata, and streams progress to a panel in the bottom-right. Re-run whenever you add new works.

> A `pnpm scan` CLI script also exists (`web/scripts/scan.ts`) if you'd rather run the scan headlessly.

### Other scripts

- `pnpm lint` — ESLint
- `pnpm db:studio` — open a browser UI against the database
- `pnpm db:generate` — after editing `schema.ts`, generate a migration into `web/drizzle/` and commit it; it's applied automatically on the next start
- `pnpm db:push` — push the schema to the db directly without a migration (handy for quick local iteration)

## Project layout

```
.
├── web/              App source, scripts, configs
├── data/             Database  (gitignored)
└── covers/           Cached cover art (gitignored)
```
