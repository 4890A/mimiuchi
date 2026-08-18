# Backup & Restore Feature Plan

## Overview

A JSON-based backup and restore system for kikoeru-nouveau that exports all database metadata and cover images. Waveform caches are left out — they are regenerable from the audio and would dominate the file size. The format is designed to be robust against schema changes: columns added after the backup was created get database defaults, and columns removed by migrations are silently ignored on import.

---

## 1. Backup File Format

A single `.kikoeru-backup.json` file with the following structure:

```jsonc
{
  // Metadata about the backup itself
  "version": 1,                                    // backup format version (for future evolution)
  "schemaVersion": 2,                              // migration count from drizzle at export time
  "createdAt": "2026-08-06T12:34:56.789Z",         // ISO timestamp
  "appVersion": "1.0.0",                           // from package.json

  // All database tables, one key per table
  "data": {
    "circles": [
      { "id": 1, "name": "sample circle", "name_en": null }
    ],
    "voice_actors": [
      { "id": 1, "name": "sample VA", "name_en": null }
    ],
    "tags": [
      { "id": 1, "name": "ASMR", "name_en": null, "category": "genre" }
    ],
    "works": [
      {
        "id": "RJ01000380",
        "title": "Sample Work",
        "title_kana": "さんぷる",
        "circle_id": 1,
        "release_date": "2024-01-15",
        "age_rating": "adult",
        "language": "ja",
        "work_type": "voice",
        "description": "A sample work.",
        "cover_url": "https://...",
        "cover_path": "/app/covers/RJ01000380.jpg",
        "dlsite_url": "https://www.dlsite.com/...",
        "nsfw": true,
        "folder_path": "/mnt/library/RJ01000380",
        "metadata_source": "dlsite",
        "last_scanned_at": 1700000000000,
        "last_metadata_sync_at": 1700000000000,
        "created_at": 1700000000000
      }
    ],
    "work_voice_actors": [
      { "work_id": "RJ01000380", "voice_actor_id": 1 }
    ],
    "work_tags": [
      { "work_id": "RJ01000380", "tag_id": 1 }
    ],
    "tracks": [
      {
        "id": 1,
        "work_id": "RJ01000380",
        "title": "Track 01",
        "relative_path": "track01.mp3",
        "extension": ".mp3",
        "size_bytes": 12345678,
        "duration_seconds": 1200.5,
        "track_number": 1,
        "disc_number": 1
      }
    ],
    "likes": [
      { "track_id": 1, "liked_at": 1700000000000 }
    ],
    "track_progress": [
      {
        "track_id": 1,
        "position_seconds": 300.0,
        "completed": false,
        "updated_at": 1700000000000
      }
    ],
    "settings": [
      { "key": "dlsite.proxy.url", "value": "http://proxy:8080" },
      { "key": "dlsite.proxy.enabled", "value": "1" },
      { "key": "scan.libraryRoot", "value": "/mnt/library" },
      { "key": "scan.coversDir", "value": "/app/covers" },
      { "key": "bookmarks.track.1", "value": "[120.5, 600.0]" }
    ]
  },

  // Cover images, keyed by filename, base64-encoded
  "covers": {
    "RJ01000380.jpg": "<base64-encoded-image>",
    "RJ01000381.jpg": "<base64-encoded-image>"
  }
}
```

### Notes on the format

- Table rows use the **database column names** (snake_case) — exactly as they appear in the SQLite schema via Drizzle ORM. This is what Drizzle returns when querying.
- BLOB columns are **base64-encoded strings** in the JSON. No backed-up table currently has one; the encoding is driven by `PRAGMA table_info`, so a future blob column travels without further work.
- `track_waveforms` is not exported at all. Waveforms regenerate from the audio with ffmpeg on first play, and carrying them made backups several times larger. A backup taken before this was dropped still restores — the extra table is simply ignored.
- Bookmarks are stored in the `settings` table with keys like `bookmarks.track.{trackId}`, so they are naturally included in the settings export.
- Timestamps are **unix epoch milliseconds** (as stored in the database).

---

## 2. Schema Robustness Strategy

### Problem

Drizzle migrations add, remove, or rename columns over time. A backup made against schema version N might contain columns that don't exist in schema version N+1 (removed) or be missing columns added in version N+1.

### Solution: Column-level filtering during import

**Export:** Query every table and serialize all rows as-is. No schema awareness needed — just dump what's there.

**Import:** Before inserting any row, introspect the **current** schema to get the set of valid column names for each table. For each row in the backup:

1. **Skip** any column that no longer exists in the current schema
2. **Insert only** columns that exist in the current schema
3. **Missing** columns (newly added by migrations) get their database defaults (`default()`, `NULL`, `false`, etc.)

This is implemented using Drizzle's `getTableColumns()` helper:

```typescript
import { getTableColumns } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

function getValidColumns(table: SQLiteTable): Set<string> {
  return new Set(Object.keys(getTableColumns(table)));
}

function filterRow(row: Record<string, unknown>, valid: Set<string>) {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (valid.has(key)) filtered[key] = value;
  }
  return filtered;
}
```

### What about renamed columns?

Column renames in Drizzle are done via `ALTER TABLE ... RENAME COLUMN`. The backup would contain the old name, and the import would see the new name. The old column would be silently dropped (treated as not existing in the current schema), and the new column would get its default value.

This is a trade-off — data loss for that specific column. Alternatives:
- **Migration-aware transforms**: Maintain a mapping of historical renames. Overkill for this project's size.
- **Use ORM property names**: Export using Drizzle's JS property names (camelCase) instead of SQL column names, then map via the schema definition. This handles renames if the ORM property name stays the same. **However**, this adds complexity and requires Drizzle types at import time. Not worth it.

Given this project is small and migrations are infrequent, the simple column-filtering approach is sufficient. If a column rename ever happens, it can be documented in the release notes.

---

## 3. Path Remapping Strategy

### Problem

All paths are absolute (`works.folder_path`, `works.cover_path`). If restoring to a different machine or after reorganizing the library, the old paths will be wrong.

### Solution: RJ-code based directory matching

The scanner already discovers works by walking library roots and looking for directories that match the pattern:

```
/(RJ|VJ|BJ)\d{6,8}/i
```

During restore:

1. **Before import**, walk all current library roots (from `resolveLibraryRoots()`) and find every directory matching the RJ-code regex, plus every `.zip`/`.rar`/`.7z` file whose name carries an RJ code — a work may still be packed on this machine.
2. **Build a map**:
   ```
   { "RJ01000380": "C:\\media\\RJ01000380", "RJ01000381": "D:\\archives\\RJ01000381" }
   ```
3. **During works import**, for each work:
   - Look up `work.id` (which is the RJ code, e.g. `"RJ01000380"`) in the map
   - **If found:** Replace `folder_path` with the matched absolute path, and set `is_archive` to whether that path is an archive file rather than a directory (this machine may hold the extracted folder where the backup had the archive, or the reverse)
   - **If not found:** Keep the old path, flag the work as "not found on disk" in the summary
4. **Covers**: `cover_path` is **always regenerated** — it is set to `<coversDir>/<workId>.jpg` (or the appropriate extension). No remapping needed since the cover file is embedded in the backup.
5. **Tracks**: No remapping needed — `relative_path` is relative to `folder_path`, so once `folder_path` is correct, tracks are correct.
6. **Settings** (`scan.libraryRoot`, `scan.coversDir`): Imported as-is but flagged with a warning that they may need manual adjustment.

### Duplicate RJ codes

If the same RJ code appears in multiple library roots, the first found path is used. A warning is emitted in the summary. An extracted folder and an archive of the same work are not a conflict — the folder wins, silently, exactly as in the scanner.

### Benefits of this approach

- **Fully automatic** — no user input needed for path remapping
- **Works across OSes** — handles Windows/Unix path differences transparently
- **Handles reorganization** — as long as the RJ folder exists somewhere under the configured library roots, it will be found
- **Falls back gracefully** — missing works are preserved in the database with their old paths, so users can update library roots and re-scan to reconnect them

---

## 4. Import Topological Order

Tables must be imported in dependency order to satisfy foreign key constraints (tracks reference works, etc.). The order is:

| Step | Table | Depends On | Insert Strategy |
|------|-------|------------|-----------------|
| 1 | `circles` | — | `onConflictDoNothing` |
| 2 | `voice_actors` | — | `onConflictDoNothing` |
| 3 | `tags` | — | `onConflictDoNothing` |
| 4 | `works` | `circles` | `onConflictDoNothing` (with path remapping) |
| 5 | `work_voice_actors` | `works`, `voice_actors` | `onConflictDoNothing` |
| 6 | `work_tags` | `works`, `tags` | `onConflictDoNothing` |
| 7 | `tracks` | `works` | `onConflictDoNothing` |
| 8 | `likes` | `tracks` | `onConflictDoNothing` |
| 9 | `track_progress` | `tracks` | `onConflictDoNothing` |
| 10 | `settings` | — | `onConflictDoUpdate` (upsert) |
| 11 | Covers | — | Write files to disk |

`onConflictDoNothing` makes re-importing the same backup idempotent (no duplicate rows).

`settings` uses `onConflictDoUpdate` so the latest import wins for key-value settings.

### Transaction safety

The entire import runs inside a single SQLite transaction. If any step fails, the transaction rolls back and no data is written. This prevents partial imports.

---

## 5. New Files

```
kikoeru-nouveau/
└── web/
    └── src/
        ├── lib/
        │   └── backup.ts                  # Core engine (export, import, schema introspection)
        ├── app/
        │   └── api/
        │       └── backup/
        │           ├── export/
        │           │   └── route.ts        # GET — stream backup download
        │           └── import/
        │               └── route.ts        # POST — accept backup upload, run restore
        ├── components/
        │   └── backup-restore.tsx          # Client UI component
        └── scripts/                        # (if CLI is desired)
            ├── backup.ts                   # CLI: pnpm tsx scripts/backup.ts --output backup.json
            └── restore.ts                  # CLI: pnpm tsx scripts/restore.ts backup.json --dry-run
```

### `web/src/lib/backup.ts` — Core Engine

**Exports:**

```typescript
// Types
export interface BackupData {
  version: number;
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  data: BackupTables;
  covers: Record<string, string>; // filename -> base64
}

export interface BackupTables {
  circles: Record<string, unknown>[];
  voice_actors: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  works: Record<string, unknown>[];
  work_voice_actors: Record<string, unknown>[];
  work_tags: Record<string, unknown>[];
  tracks: Record<string, unknown>[];
  likes: Record<string, unknown>[];
  track_progress: Record<string, unknown>[];
  settings: Record<string, unknown>[];
}

export interface RestoreSummary {
  imported: Record<string, number>;
  remapped: number;
  notFound: string[];
  warnings: string[];
  errors: string[];
}

export interface RestoreOptions {
  dryRun?: boolean;
}

// Functions
export async function createBackup(): Promise<BackupData>;
export async function restoreBackup(data: BackupData, options?: RestoreOptions): Promise<RestoreSummary>;
export function buildRjPathMap(libraryRoots: string[]): Map<string, string>;
```

**Implementation details:**

- `createBackup()`: Queries all tables using Drizzle, base64-encodes blob data, reads cover files from covers directory, serializes to `BackupData`.
- `restoreBackup()`: Validates version, builds path map, runs import in transaction. For each table: introspects current schema columns, filters rows, inserts with `onConflictDoNothing`.
- `buildRjPathMap()`: Walks library roots recursively, matches directory names against RJ regex, returns map.
- Inserts bypass Drizzle and use raw SQL via `better-sqlite3`, so the column set can be decided per row from the live schema.

### `web/src/app/api/backup/export/route.ts` — Export API

```
GET /api/backup/export

Headers:
  Content-Type: application/json
  Content-Disposition: attachment; filename="kikoeru-backup-2026-08-06.json"

Response: BackupData JSON (potentially streamed for large libraries)
```

- Authenticated route (requires login)
- Calls `createBackup()`
- Uses `transformStream` or `ReadableStream` for the response body to avoid memory issues with large backups
- Sets `Content-Disposition` for file download

### `web/src/app/api/backup/import/route.ts` — Import API

```
POST /api/backup/import?dryRun=false

Body: multipart/form-data
  file: <kikoeru-backup.json>

Response (200):
{
  "imported": { "circles": 5, "voice_actors": 12, "tags": 30, "works": 120,
                "work_voice_actors": 240, "work_tags": 360, "tracks": 340,
                "likes": 50, "track_progress": 40,
                "settings": 60, "covers": 120 },
  "remapped": 118,
  "notFound": ["RJ99999999", "RJ88888888"],
  "warnings": [
    "Work RJ77777777 appears in multiple library roots: C:\\media\\RJ77777777, D:\\ext\\RJ77777777",
    "Settings scan.libraryRoot may need updating for this machine"
  ],
  "errors": []
}

Response (400):
{ "error": "Invalid backup file: version 99 is not supported (expected version 1)" }
```

- Authenticated route
- Parses multipart upload, reads JSON body
- Validates `version` field
- Calls `restoreBackup()` with `dryRun` from query params
- Returns summary as JSON

---

## 6. `web/src/components/backup-restore.tsx` — UI Component

A card rendered on the Settings page with two sections:

### Export Section

```
┌─────────────────────────────────────────────────┐
│ Backup & Restore                                │
├─────────────────────────────────────────────────┤
│                                                 │
│ Export your library metadata, play progress,    │
│ likes, and covers to a backup file.             │
│                                                 │
│ [ Download Backup ]                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

- "Download Backup" button — calls `GET /api/backup/export`, triggers browser download
- Button shows loading spinner during export
- On error, shows toast with error message

### Import Section

```
┌─────────────────────────────────────────────────┐
│ Restore from Backup                             │
├─────────────────────────────────────────────────┤
│                                                 │
│ Choose a .kikoeru-backup.json file to import.   │
│                                                 │
│ [ Choose File ] backup-2026-08-06.json          │
│                                                 │
│ [ Validate ] [ Restore ]                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

- File input for `.kikoeru-backup.json` (filtered to JSON files)
- "Validate" button — `POST /api/backup/import?dryRun=true`, shows what *would* happen
- "Restore" button — `POST /api/backup/import`, runs full import
- Both buttons show loading spinner during operation
- Results displayed below the buttons in a formatted summary

### Result Display (after validate or restore)

```
Import Summary
──────────────
Circles:      5 imported
Voice Actors: 12 imported
Tags:         30 imported
Works:        120 imported (118 paths remapped)
Tracks:       340 imported
Likes:        50 imported
Progress:     40 imported
Covers:       120 written
Settings:     60 imported

Warnings:
  • Work RJ99999999 not found on disk — run a scan to update its path
  • Work RJ88888888 not found on disk — run a scan to update its path
  • Settings contain library paths from the original machine — verify in Settings
```

### States

| State | Description |
|-------|-------------|
| **Idle** | Default state, file input empty |
| **File selected** | File chosen, Validate and Restore buttons active |
| **Validating** | Dry run in progress, spinner on Validate button |
| **Validated** | Dry run results displayed, Restore button still active |
| **Restoring** | Import in progress, spinner on Restore button, buttons disabled |
| **Restored** | Import results displayed, success toast |
| **Error** | Error message displayed, toast with details |
| **Rejected** | "Invalid backup file" or other validation error |

---

## 7. Settings Page Integration

The `BackupRestore` component is added to the Settings page (`web/src/app/(app)/settings/page.tsx`) below the existing settings form, separated by a divider or spacer.

```tsx
// In settings/page.tsx
export default async function SettingsPage() {
  // ... existing code ...

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm initial={settings} effective={effective} missingSeiyuuCount={missingSeiyuuCount} />
      <div className="mt-8">
        <BackupRestore />
      </div>
    </div>
  );
}
```

---

## 8. Dry Run Mechanism

The dry run performs all import logic including path remapping and schema filtering, but rolls back the transaction instead of committing:

```typescript
export async function restoreBackup(data: BackupData, options?: RestoreOptions): Promise<RestoreSummary> {
  const summary: RestoreSummary = {
    imported: {},
    remapped: 0,
    notFound: [],
    warnings: [],
    errors: [],
  };

  const rjPathMap = buildRjPathMap(getCurrentLibraryRoots());
  const tx = db.transaction(() => {
    try {
      // ... import all tables ...
      // ... track counts in summary ...
      // ... collect warnings for notFound works ...

      if (options?.dryRun) {
        throw new DryRunRollback(); // custom error to trigger rollback
      }
    } catch (e) {
      if (e instanceof DryRunRollback) return; // expected
      throw e; // unexpected — real error
    }
  });

  try {
    tx();
  } catch (e) {
    if (!(e instanceof DryRunRollback)) {
      summary.errors.push(String(e));
    }
  }

  return summary;
}
```

The `DryRunRollback` is a simple custom error type used only internally. On dry run, it is thrown after all insert operations, which triggers SQLite transaction rollback. The summary is still populated with what *would* have been imported.

---

## 9. CLI Scripts

For users who prefer command-line operations or want to automate backups:

### `web/scripts/backup.ts`

```bash
# Basic backup
pnpm tsx scripts/backup.ts --output ./backups/backup-2026-08-06.json
```

### `web/scripts/restore.ts`

```bash
# Validate only (dry run)
pnpm tsx scripts/restore.ts ./backups/backup.json --dry-run

# Full restore
pnpm tsx scripts/restore.ts ./backups/backup.json
```

---

## 10. What Is NOT Backed Up

| Data | Reason |
|------|--------|
| **Audio files** | Source of truth — re-discovered by scanner |
| **Waveform caches** (`track_waveforms`) | Regenerable from the audio with ffmpeg, and by far the largest table |
| **Session secret** (`data/session-secret`) | Auto-generated on first startup |
| **Search index** | Rebuilt in-memory on server startup |
| **`cover_url` (remote URL)** | Embedded as `cover_path` + actual image data in `covers` object — the remote URL is secondary |

---

## 11. Error Handling & Edge Cases

### Validation errors (rejected before any writes)

| Error | Behavior |
|-------|----------|
| File is not valid JSON | Reject with `"Invalid backup file: not valid JSON"` |
| Missing `version` field | Reject with `"Invalid backup file: missing version field"` |
| Unsupported `version` | Reject with `"Unsupported backup format version X (expected version 1)"` |
| Missing `data` object | Reject with `"Invalid backup file: missing data"` |
| File too large (>500MB) | Reject with `"Backup file exceeds maximum size of 500MB"` (configurable) |

### Non-fatal warnings (import continues)

| Case | Behavior |
|------|----------|
| Work not found on disk | Import metadata with old path, flag in `notFound[]` |
| Duplicate RJ code across roots | Use first match, emit warning |
| Cover file already exists | Skip (don't overwrite) |
| Row references missing FK (e.g., track references deleted work) | `onConflictDoNothing` skips it; `better-sqlite3` with `foreign_keys = ON` may reject — catch and warn |
| Old column name not in current schema | Silently ignored (schema robustness) |

### Fatal errors (transaction rolls back)

| Case | Behavior |
|------|----------|
| SQLite I/O error | Rollback, return error |
| Out of disk space | Rollback, return error |
| Unexpected JSON structure (wrong types) | Rollback, return error |

---

## 12. Testing Plan

### Unit tests (`web/src/lib/backup.test.ts`)

- **Export produces valid BackupData** — mock tables with known data, call `createBackup()`, verify structure
- **Import filters removed columns** — provide backup with extra column, verify it's excluded
- **Import handles missing columns** — provide backup missing a column, verify default is used
- **Path remapping finds RJ directories** — mock directory structure, verify map is correct
- **Path remapping handles work not found** — verify old path preserved, warning emitted
- **Dry run rolls back** — insert data with dry run, verify no data persisted
- **Waveforms stay out** — seed a waveform cache, verify the export omits the table and that an older backup carrying it restores without writing the rows

### Integration tests

- **Full round-trip** — create backup, wipe DB, restore, verify all data matches
- **Partial restore** — create backup, add new works after backup, restore — verify existing data untouched, new data preserved
- **Cross-schema restore** — create backup against schema v1, add migration adding column, restore — verify new column gets default

---

## 13. Implementation Order

| Step | Files | Effort |
|------|-------|--------|
| 1. Core engine | `web/src/lib/backup.ts` | High |
| 2. Export API | `web/src/app/api/backup/export/route.ts` | Low |
| 3. Import API | `web/src/app/api/backup/import/route.ts` | Medium |
| 4. UI component | `web/src/components/backup-restore.tsx` | Medium |
| 5. Settings integration | `web/src/app/(app)/settings/page.tsx` | Low |
| 6. CLI scripts | `web/scripts/backup.ts`, `web/scripts/restore.ts` | Low |
| 7. Tests | `web/src/lib/backup.test.ts` | Medium |

---

## 14. Future Considerations

- **Compression**: The JSON backup can get large. Future versions could support gzip compression in the response (`Content-Encoding: gzip`) or a `.tar.gz` format with separate cover files.
- **Incremental backups**: Export only data changed since a timestamp.
- **Selective restore**: Restore only works/tracks/progress (skip settings, skip covers).
- **Cloud storage**: Upload backup to S3, Dropbox, etc.
- **Scheduled backups**: Cron-based automatic backups via CLI.
- **Streaming: for very large libraries** (`>10,000 works`), the export could use a streaming JSON encoder (`JSONStream`) to avoid memory issues.
