# Non-DLsite works: scan folders that have no RJ code

## Context

Every work is identified by an RJ code parsed from its folder name.
`findWorkEntries` (`scanner.ts:196`) records a directory only when
`extractWorkId` matches; anything else is recursed into and then **silently
dropped** — no log line, no event, no counter. So a folder of loose audio, a
Comiket release, or anything bought outside DLsite is invisible, with no way to
add it.

The goal: an opt-in setting that lets those folders become works, titled from
the folder name, with everything else filled in by hand through the existing
edit dialog. Off by default, so an upgrade changes nothing until you tick the box.

Both stages below were validated by porting the proposed algorithms to a script
and running them against the real library (`E:\Voice` + `G:\Voice`). Both had
bugs the paper design did not. The numbers quoted are measured, not estimated.

---

## Stage 0 — a prerequisite bug, its own commit

`RJ_REGEX = /\b(RJ|VJ|BJ)\d{6,8}\b/i` (`metadata/types.ts:21`). The trailing
`\b` needs a non-word character after the digits, and **`_` is a word
character** — so `RJ01124146_MP3V0` does not match. `RJ01011045-mp3` does,
because a hyphen is not a word character.

**Measured: 108 top-level folders in `E:\Voice` carry an RJ code the scanner
cannot see. 103 of those work ids are absent from the database entirely.** The
library holds 231 works and should hold 331. (The other 5 survive only because
they happen to contain a nested RJ folder, like
`RJ265818_MP3V0/RJ265818 耳舐遊戯`.) The leading `\b` has the mirror-image
problem: `耳フェラ。_RJ191210` is also invisible.

This blocks the feature. With `includeUnmatchedFolders` on and the regex as it
is, **111 folders get claimed as hand-entry works — 103 of them real DLsite
releases**, each with a folder-name title and no metadata. Exactly the mess the
feature exists to prevent.

```ts
export const RJ_REGEX = /(?<![A-Za-z0-9])(RJ|VJ|BJ)\d{6,8}(?!\d)/i;
```

Reject a preceding letter or digit, but allow `_` and punctuation; reject a
following digit so 9+ digits still fail. I ran all 19 cases pinned by
`metadata/types.test.ts` against it — **every one passes unchanged**, including
`xRJ123456 → null`, `ARJ123456 → null`, `RJ123456789 → null`,
`x-RJ123456 → RJ123456`, and `RJ_REGEX.global === false`.

Ship this first, alone, with new cases added to `types.test.ts` for the
underscore and leading-separator shapes. Consequence to expect: the next scan
finds ~100 works and fetches their listings, rate-limited at 1 req/s.

---

## The detection rule

> A folder becomes a manual work when it is the **shallowest** folder that
> contains **at least one audio file** anywhere beneath it and contains **no
> RJ-coded work** anywhere beneath it.

Audio is required, so video-only folders stay out. RJ wins, so a container
holding a real DLsite work stays a container.

**Measured with the Stage 0 fix in place: 331 RJ works + exactly 8 manual works.**

```
E:\Voice\09.放課後ロッカーの中で密着耳舐め♪_freehongkong
E:\Voice\344510                 (audio two levels down)
E:\Voice\Ayaka                  (73 loose mp3s)
E:\Voice\Best
E:\Voice\EnK
E:\Voice\Pictures of Ayaka      (audio + images)
E:\Voice\会長DVD_C94号DL1        (audio three levels down)
E:\Voice\会長DVD_C94号DL2
```

Correctly passes over `Images` (348 stray cover jpgs), `Video`, `hinata`,
`.hist` — no audio — and `SK12326204`, `エロ`, `貴方は勇者様ではありません! MP3`,
each of which holds an RJ work.

**Known limitation:** a folder holding several separate albums becomes one work.
Nothing like that exists in your library. The escape hatch would be an
ignore-list setting, deliberately deferred.

---

## Identity

```ts
function manualWorkId(folderPath: string): string {
  const norm = process.platform === "win32"
    ? path.resolve(folderPath).toLowerCase()
    : path.resolve(folderPath);
  return "LOCAL-" + createHash("sha256").update(norm).digest("hex").slice(0, 12);
}
```

Hashing the absolute path keeps discovery pure — no DB access. The id satisfies
every constraint the codebase already places on a work id:

| Constraint | Why it exists | Holds? |
|---|---|---|
| Filesystem-safe | covers are flat `${workId}${ext}`, unsanitised (`scanner.ts:450`, `actions.ts:231`, `actions.ts:311`) | ✅ |
| URL-path-safe | `/works/[id]` plus ~8 raw `` href={`/works/${id}`} `` | ✅ |
| No comma | `GROUP_CONCAT(w.id)` split on `,` (`index-builder.ts:87/99/110` → `:153`) | ✅ |
| Must not match `RJ_REGEX` | else `extractWorkId` would claim it | ✅ `j` is not a hex digit |

**Consequence:** renaming or moving a folder re-mints the id, so the old entry
goes missing and a new one appears — which the missing-works flow already
handles gracefully, keeping likes and progress until you clear it in Settings.
Relative-to-root hashing would survive a drive-letter change, but two roots with
a same-named subfolder would collide and `recordEntry`'s first-wins rule would
then *silently hide* the second folder. Not worth it.

---

## No migration

That is the whole upgrade story:

- The setting lives in the existing key/value `settings` table — `readKey`/
  `writeKey` in `lib/settings.ts`, booleans already encode as `"1"`/`"0"`.
- Manual works are marked `works.metadata_source = 'manual'`. The column exists,
  and `NormalizedWork["source"]` (`metadata/types.ts:18`) is **already** typed
  `"dlsite" | "manual"` — nothing has ever produced the second value.

No `drizzle/0005_*.sql`, no `db:generate`, no schema edit.

---

## Changes, in order

### 1. Setting — `lib/settings.ts`, `settings-form.tsx`

Add `includeUnmatchedFolders: boolean` to `AppSettings` and
`scan.includeUnmatchedFolders` to `KEYS`; read `=== "1"`, write `? "1" : "0"`.
Checkbox in the **Paths** card (`settings-form.tsx:235`), under the
library-roots textarea it qualifies, modelled on the `dlsiteProxyEnabled` one at
`:150-166`. Add a term to `dirty`. Two i18n keys.

### 2. Discovery — `lib/scanner.ts`

**Probe, then claim, then stop.** My first attempt folded the RJ check into the
recursion's return value and claimed on the way back up. Run against the real
library it produced **347 manual works instead of 8**: every level of every
nested folder claimed itself, because each independently saw "no RJ beneath, has
audio". The subtree probe has to record nothing, and a claimed folder must not
be descended into.

```ts
/** Does this subtree hold an RJ work? Records nothing. */
async function hasRjBeneath(dir: string, depth: number): Promise<boolean> {
  if (depth > 4) return true;          // uninspected — assume yes, never claim
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return false; }
  for (const e of entries) {
    if (e.isFile()) {
      if (isArchiveFile(e.name) && extractWorkId(e.name)) return true;
      continue;
    }
    if (!e.isDirectory()) continue;
    if (extractWorkId(e.name)) return true;
    if (await hasRjBeneath(path.join(dir, e.name), depth + 1)) return true;
  }
  return false;
}
```

and in `findWorkEntries(root, includeUnmatched)`, replacing the bare
`else { await scan(full, depth + 1); }` at `scanner.ts:218`:

```ts
      if (
        includeUnmatched &&
        !(await hasRjBeneath(full, depth + 1)) &&
        (await hasAudioBeneath(full))
      ) {
        recordEntry(found, manualWorkId(full), { path: full, isArchive: false });
        continue;                      // claimed — do NOT descend
      }
      await scan(full, depth + 1);
```

The depth cap returns `true`, not `false`: at exactly the boundary an RJ work
can sit one level below what was inspected, and claiming its parent would shadow
it. Refusing to claim an uninspected subtree is the conservative reading.

`hasAudioBeneath` is a small early-exit walk over `AUDIO_EXTS`, capped at the
same depth as the track `walk()` (6), so we never mint a work whose audio the
track pass cannot reach. **Neither probe runs when the setting is off**, so the
scan stays byte-for-byte what it does today.

### 3. Never contact DLsite for a manual work

Three gates, all on `metadataSource === "manual"`:

- **`needsMeta`** (`scanner.ts:360-369`) — short-circuit to `false`. Without it
  `idVariants` passes the id through verbatim (`metadata/index.ts:11-26`) and
  every scan burns a 404 and pushes `"No metadata found for LOCAL-…"` into
  `result.errors` — which also makes `pnpm scan` exit 1.
- **Quick-skip** (`scanner.ts:301-342`) — a manual work has no cover, no tags and
  no `lastMetadataSyncAt`, so three of its conditions can never hold and it would
  be re-walked forever. Accept a manual work on `lastScannedAt` +
  `assetsScannedAt` + mtime alone.
- **`refreshWorkMetadata`** (`actions.ts:197`) — return a clear error instead of
  querying DLsite for a nonsense workno.

Also exclude manual works from `listWorkIdsMissingSeiyuu` (`repository.ts:486`),
or the "re-scan works missing seiyuu" row force-fetches every one of them.

### 4. Insert-only title and source — `db/repository.ts`

`upsertWork` gains `fallbackTitle?: string` (the folder basename), used **only**
in `values`, never in `updateSet`, and sets `metadataSource: "manual"` on insert
only. `values.title` becomes `metadata?.title ?? fallbackTitle ?? id`.

`updateSet` already touches nothing but `folderPath`/`isArchive`/`lastScannedAt`
when `metadata` is null, so a rescan cannot clobber hand-entered metadata. This
keeps it that way — the point is that the *insert* stops using the id as a title.

### 5. Safety: turning the setting back off

`reconcileMissingWorks` (`scanner.ts:585`) diffs the **whole** `works` table
against `foundIds`. With the setting off, manual works are not discovered, so
every one would be flagged missing and offered up for deletion in Settings.

Pass `includeUnmatched` in and, when false, filter them out of `known` —
`listWorkIdsAndMissing` (`repository.ts:267`) returns `metadataSource` alongside
`missing`. A work you typed in by hand is simply not managed by the scanner
while the setting is off.

Also: a root joins `verifiedRoots` only when `found.size > 0`
(`scanner.ts:272`), so manual entries must count — otherwise a root holding
nothing but manual works reads as "unverified", which suppresses reconciliation
and surfaces as an error in the scan panel.

### 6. Report what was found

Add `worksManual: number` to `ScanResult` and show it in the scan panel. After
ticking the box, the thing you want to know is how many folders it claimed.

### 7. Cover placeholder — `lib/cover.ts` + render sites

`coverSrc` returns `/api/cover/${id}` even when there is no cover
(`cover.ts:16`) and the route 404s (`api/cover/[workId]/route.ts:27`) — a broken
`<img>`. Every manual work starts coverless, so this stops being an edge case.

Add `hasCover(work): boolean` beside `coverSrc` and branch at the image sites —
`work-card.tsx:53`, `works/[id]/page.tsx:39` (backdrop + lightbox),
`on-deck.tsx:101`, `circles/page.tsx:67`, `liked/page.tsx:41` — rendering a tile
instead of an `<img>`. **Do not** change `coverSrc`'s return type: it is threaded
through `player-store.tsx` as `coverSrc: string` for media-session artwork, where
a 404 is harmless.

### 8. Hide DLsite-only UI

- `getWorkDetail` (`queries.ts:193`) does not select `metadataSource` — add it.
- `works/[id]/page.tsx:80` prints `work.id` verbatim as a mono subtitle. Hide it
  for a manual work; `LOCAL-a1b2c3d4e5f6` means nothing to anyone.
- `edit-work-dialog.tsx:382-395` renders "Refresh from DLsite" unconditionally.
  Hide it when the work is manual.

### 9. Backup — `lib/backup.ts`

`scanRjPaths` (`:330-355`) is a **second, parallel copy** of the discovery walk,
used on restore to re-home `folder_path`; `indexCoversByWorkId` (`:543`) maps
backup covers to works by parsing an RJ code out of the filename. Left alone,
restoring a backup silently loses every manual work's folder and cover.

Factor the walk into one shared function used by both so they cannot drift, and
fall back to the raw basename in `indexCoversByWorkId` when `extractWorkId`
returns null — the cover filename *is* the work id.

### 10. Scan-option plumbing

`scan-progress.tsx:353-372` builds scan URLs with an if/else chain, which makes
`extras` / `missingSeiyuu` / `force` accidentally mutually exclusive. Replace it
with one serializer plus a matching parser in `api/scan/route.ts:8-27`, so modes
compose and adding one is a single line.

`web/scripts/scan.ts` takes its roots from `lib/config` (env) and never reads the
settings table, so it would ignore the new setting. Have it call `getSettings()`
like the API route does.

---

## Files

| File | Change |
|---|---|
| **Stage 0** `lib/metadata/types.ts` + `types.test.ts` | `RJ_REGEX` lookaround fix, new cases |
| `lib/settings.ts`, `settings/settings-form.tsx` | new boolean setting + checkbox |
| `lib/scanner.ts` | `hasRjBeneath`, `hasAudioBeneath`, `manualWorkId`, discovery, `needsMeta`, quick-skip, reconciliation, `ScanResult` |
| `lib/db/repository.ts` | `upsertWork` fallback title; `listWorkIdsAndMissing`; `listWorkIdsMissingSeiyuu` |
| `lib/db/queries.ts` | `getWorkDetail` selects `metadataSource` |
| `lib/actions.ts` | guard `refreshWorkMetadata` |
| `lib/cover.ts` + 5 render sites | `hasCover` + placeholder tile |
| `works/[id]/page.tsx`, `edit-work-dialog.tsx` | hide DLsite-only UI |
| `lib/backup.ts` | shared walk, cover-name fallback |
| `scan-progress.tsx`, `api/scan/route.ts`, `scripts/scan.ts` | mode plumbing, manual count |
| `lib/i18n/dictionaries.ts` | ~10 keys × en + ja (a missing pair is a type error) |

---

## Verification

```powershell
pnpm -C web test
pnpm -C web exec tsc --noEmit
pnpm -C web lint
```

**Existing tests that must keep passing untouched.** The setting defaults off, so
`scanner.test.ts:261` ("ignores folders with no work id in the name", asserts
`worksFound === 0`) and `:975` ("a work folder with no audio files still gets a
row") stay green as written. If either needs editing, the default is wrong. All
19 `types.test.ts` cases must survive Stage 0 unedited — verified already.

**New unit tests** in `scanner.test.ts`. `mockNet()` disables net connect, so
**queuing no interceptor is itself the assertion that the scan stayed offline**:

| Test | Asserts |
|---|---|
| a folder with no work id is picked up when the setting is on | one work, title = folder name, `metadata_source = 'manual'` |
| …and its tracks are indexed | tracks found beneath, relative paths kept |
| a folder holding an RJ work is not itself a work | container skipped, RJ work found |
| a folder with no audio is passed over | video-only / image-only yields nothing |
| the shallowest folder wins, and nothing below it | audio two deep ⇒ **exactly one** work, at the top — the 347-vs-8 regression |
| a manual work never contacts DLsite | **no interceptor queued**; `result.errors` empty |
| a rescan does not clobber a hand-edited title | edit the row, scan again, title survives |
| a manual work is not flagged missing when the setting is off | the safety path in §5 |
| the same folder keeps its id across scans | id stable, no duplicate row |
| a root of only manual works still verifies | no `roots-unverified`, reconciliation runs |

Plus a `settings.test.ts` round-trip for the new key, and `types.test.ts` cases
for `RJ01124146_MP3V0` and `耳フェラ。_RJ191210`.

**Against the real library.** After Stage 0, scan and confirm the library goes
231 → ~331 works, all with real metadata. Then tick the setting, scan again, and
confirm exactly the 8 folders listed above appear — tracks indexed, folder-name
titles, placeholder covers, no new errors in the panel — and that `Images`,
`Video`, `hinata`, `SK12326204`, `エロ` and `貴方は勇者様ではありません!` did
not. Hand-edit one, re-scan, confirm the edit survives. Untick the setting,
re-scan, confirm the 8 are **not** offered for removal in Settings.

**e2e** (`web/e2e/`, gitignored, needs live network): add a non-RJ folder to
`e2e/fixtures/make-library.ts` and assert it is absent by default and present
once the setting is enabled.
