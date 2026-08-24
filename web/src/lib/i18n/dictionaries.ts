/**
 * UI strings, keyed by a flat dotted path.
 *
 * `en` is the source of truth: its keys define `TranslationKey`, so `ja` is a
 * `Record` over exactly those keys and TypeScript flags any string that gets
 * added to one language but not the other.
 *
 * Placeholders are `{name}` and are filled by `makeT`. A `…_one` variant is
 * picked automatically when a `count` of 1 is passed — Japanese has no plural
 * form, so its `…_one` entries simply repeat the base string.
 */

export const en = {
  // ── Common ────────────────────────────────────────────────────────────────
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.collapse": "Collapse",
  "common.expand": "Expand",
  "common.run": "Run",
  "common.search": "Search",
  "common.searchPlaceholder": "Search…",
  "common.noMatches": "No matches",

  // ── Navigation ────────────────────────────────────────────────────────────
  "nav.library": "Library",
  "nav.liked": "Liked",
  "nav.seiyuu": "Seiyuu",
  "nav.circles": "Circles",
  "nav.settings": "Settings",

  // ── Header controls ───────────────────────────────────────────────────────
  "header.scanLibrary": "Scan library",
  "header.scanIncremental": "incremental",
  "header.forceRescan": "Force full rescan",
  "header.forceRescanHint": "re-fetch all metadata",
  "header.scanDurations": "Scan track durations",
  "header.scanDurationsHint": "missing only",
  "header.rescanDurations": "Re-scan all durations",
  "header.rescanDurationsHint": "every track",
  "header.showNsfw": "Show R18 covers",
  "header.blurNsfw": "Blur R18 covers",
  "header.nsfwBlurred": "R18 covers: blurred",
  "header.nsfwVisible": "R18 covers: visible",

  // ── Search ────────────────────────────────────────────────────────────────
  "search.placeholder": "Search seiyuu, circles, tags, works…",
  "search.empty": "No matches. Press Enter to search anyway.",
  "search.enterHint": "Enter to search titles for “{query}”",
  "search.group.seiyuu": "Seiyuu",
  "search.group.circle": "Circles",
  "search.group.tag": "Tags",
  "search.group.work": "Works",

  // ── Library page ──────────────────────────────────────────────────────────
  "library.title": "Library",
  "library.workCount": "{count} works",
  "library.workCount_one": "1 work",
  "library.filters": "Filters",
  "library.filter.voiceActors": "Voice actors",
  "library.filter.circles": "Circles",
  "library.filter.tags": "Tags",
  "library.filter.r18": "R18",
  "library.filter.zip": "Archives",
  "library.filter.all": "All",
  "library.filter.r18Only": "R18 only",
  "library.filter.r18Exclude": "Hide R18",
  "library.filter.zipOnly": "Zips only",
  "library.filter.zipExclude": "Hide zips",
  "library.empty.title": "No works yet",
  "library.empty.before": "Drop folders named like ",
  "library.empty.after":
    " into your library directory, then click the refresh button in the top bar to scan.",
  "library.cardSize": "Card size",

  // ── Sorting ───────────────────────────────────────────────────────────────
  "sort.label": "Sort",
  "sort.added": "Recently added",
  "sort.release": "Release date",
  "sort.title": "Title",
  "sort.reverseOn": "Reverse: on",
  "sort.reverseOff": "Reverse: off",
  "sort.aToZ": "A → Z",
  "sort.zToA": "Z → A",
  "sort.oldestFirst": "Oldest first",
  "sort.newestFirst": "Newest first",
  "sort.byWorks": "By works",
  "sort.byName": "By name",

  // ── Active filter chips ───────────────────────────────────────────────────
  "filters.clearAll": "Clear all",
  "filters.r18Only": "R18 only",
  "filters.r18Exclude": "No R18",
  "filters.zipOnly": "Zips only",
  "filters.zipExclude": "No zips",
  "filters.remove": "Remove {name}",

  // ── On deck ───────────────────────────────────────────────────────────────
  "onDeck.title": "On deck",
  "onDeck.random": "Random",
  "onDeck.shuffle": "Shuffle",
  "onDeck.shuffleAgain": "Shuffle again",
  "onDeck.showRandom": "Show random works",
  "onDeck.back": "Back to on deck",

  // ── Liked page ────────────────────────────────────────────────────────────
  "liked.title": "Liked tracks",
  "liked.trackCount": "{count} tracks",
  "liked.trackCount_one": "1 track",
  "liked.empty": "Tap the heart icon on any track to add it here.",
  "liked.shuffle": "Shuffle",
  "liked.shuffleOn": "Shuffle the order",
  "liked.shuffleOff": "Back to the original order",

  // ── Seiyuu page ───────────────────────────────────────────────────────────
  "seiyuu.title": "Seiyuu",
  "seiyuu.empty": "No voice actors found yet. Scan your library first.",

  // ── Circles page ──────────────────────────────────────────────────────────
  "circles.title": "Circles",
  "circles.empty": "No circles found yet. Scan your library first.",

  // ── Work detail ───────────────────────────────────────────────────────────
  "work.circle": "Circle",
  "work.voiceActors": "Voice actors",
  "work.tags": "Tags",
  "work.viewOnDlsite": "View on DLsite",
  "work.enlargeCover": "View cover full size",
  "work.tracks": "Tracks",
  "work.noTracks": "No audio files found in this work’s folder.",
  "work.noTracksArchived": "Nothing to play yet — extract the archive, then re-scan.",
  "work.archived": "Still packed in {file} — extract it to play this work.",
  "work.openFolder": "Open folder",
  "work.showArchive": "Show archive",
  "work.moreTags": "{count} more tags",
  "work.moreTags_one": "1 more tag",
  "work.openFolderFailed": "Couldn’t open folder: {error}",
  "work.extras": "Extras",
  "work.extrasScripts": "Scripts",
  "work.extrasImages": "Images",
  "work.extrasVideos": "Videos",
  "work.extrasOther": "Other files",
  "work.openScript": "Read script",
  "work.openInNewTab": "Open in a new tab",
  "work.scriptFor": "Script for this track",
  "work.previousImage": "Previous image",
  "work.nextImage": "Next image",
  "script.counter": "Script {index} / {total}",
  "script.previous": "Previous script",
  "script.next": "Next script",
  "script.toggleOrientation": "Switch between vertical and horizontal",
  "script.textSmaller": "Smaller text",
  "script.textLarger": "Larger text",
  "script.loading": "Loading…",
  "script.failed": "Couldn’t read this script.",
  "script.empty": "This script is empty.",

  // ── Tracks ────────────────────────────────────────────────────────────────
  "track.play": "Play",
  "track.pause": "Pause",
  "track.like": "Like",
  "track.unlike": "Unlike",
  "track.collapseAll": "Collapse all",
  "track.expandAll": "Expand all",
  "track.collapseAllFolders": "Collapse all folders",
  "track.expandAllFolders": "Expand all folders",

  // ── Player ────────────────────────────────────────────────────────────────
  "player.previous": "Previous",
  "player.next": "Next",
  "player.volume": "Volume",
  "player.seek": "Seek",
  "player.seekPosition": "{current} of {total}",

  // ── Edit work dialog ──────────────────────────────────────────────────────
  "edit.trigger": "Edit work",
  "edit.title": "Edit work",
  "edit.changeFile": "Change file…",
  "edit.uploadImage": "Upload image…",
  "edit.coverUrlPlaceholder": "…or paste image URL",
  "edit.field.title": "Title",
  "edit.field.circle": "Circle",
  "edit.field.releaseDate": "Release date",
  "edit.field.workType": "Work type",
  "edit.field.language": "Language",
  "edit.field.voiceActors": "Voice actors",
  "edit.field.tags": "Tags",
  "edit.field.description": "Description",
  "edit.addVoiceActor": "Add voice actor…",
  "edit.addTagPlaceholder": "Add tag…",
  "edit.addValue": "Add",
  "edit.remove": "Remove {name}",
  "edit.nsfw": "R18 / NSFW",
  "edit.refreshFromDlsite": "Refresh from DLsite",
  "edit.refreshing": "Fetching…",
  "edit.refreshed": "Metadata refreshed from DLsite",
  "edit.refreshFailed": "Couldn’t refresh: {error}",
  "edit.save": "Save changes",
  "edit.saving": "Saving…",
  "edit.titleRequired": "Title is required",
  "edit.saveFailed": "Couldn’t save: {error}",
  "edit.coverFailed": "Details saved, but cover failed: {error}",
  "edit.coverUrlFailed": "Details saved, but cover URL failed: {error}",
  "edit.updated": "Work updated",

  // ── Add tag ───────────────────────────────────────────────────────────────
  "addTag.label": "Add tag",
  "addTag.create": "Create",

  // ── Delete work ───────────────────────────────────────────────────────────
  "delete.trigger": "Delete entry",
  "delete.title": "Delete this entry?",
  "delete.before": "Removes ",
  "delete.after":
    " ({id}) from the library, along with its tracks, tags, likes, and playback progress. Your audio files on disk are not touched.",
  "delete.confirm": "Delete",
  "delete.deleting": "Deleting…",
  "delete.failed": "Couldn’t delete: {error}",
  "delete.done": "Entry deleted",

  // ── Login ─────────────────────────────────────────────────────────────────
  "login.subtitle": "Sign in to your library",
  "login.password": "Password",
  "login.error": "Incorrect password",
  "login.submit": "Sign in",

  // ── Settings: language ────────────────────────────────────────────────────
  "settings.title": "Settings",
  "settings.language.title": "Language",
  "settings.language.description":
    "Language of the interface. Work titles, tags and voice actor names always show as they were imported.",
  "settings.language.group": "Interface language",

  // ── Settings: appearance ──────────────────────────────────────────────────
  "settings.appearance.title": "Appearance",
  "settings.appearance.description":
    "How this device draws the app. These preferences are stored in the browser, so each device keeps its own.",
  "settings.appearance.theme": "Theme",
  "settings.appearance.themeHint":
    "System follows whatever your device is set to, and switches with it.",
  "settings.appearance.themeGroup": "Colour theme",
  "settings.appearance.themeLight": "Light",
  "settings.appearance.themeDark": "Dark",
  "settings.appearance.themeSystem": "System",
  "settings.appearance.seekbar": "Player seek bar",
  "settings.appearance.seekbarHint":
    "Waveforms are generated once per track with ffmpeg and then cached, so the first play of a long file may show a plain bar for a few seconds.",
  "settings.appearance.seekbarGroup": "Seek bar style",
  "settings.appearance.bar": "Classic bar",
  "settings.appearance.barHint": "A thin progress line along the top edge of the player.",
  "settings.appearance.waveform": "Waveform",
  "settings.appearance.waveformHint":
    "Shows the track’s loudness so you can see pauses and peaks before you scrub.",
  "settings.appearance.libraryCards": "Library cards",
  "settings.appearance.hideTags": "Hide tags on library cards",
  "settings.appearance.hideTagsHint":
    "Voice actor chips stay. Tags remain on the work page and in the filter panel.",

  // ── Settings: playback ────────────────────────────────────────────────────
  "settings.playback.title": "Playback",
  "settings.playback.description":
    "How this device starts a track. Listening positions themselves are shared across devices; this choice is stored in the browser.",
  "settings.playback.resume": "Starting a track",
  "settings.playback.resumeHint":
    "A track played through to the end always starts over, whichever option you pick — otherwise it would end the moment it began and the player would skip past it.",
  "settings.playback.resumeGroup": "Track start position",
  "settings.playback.resumeSaved": "Continue where I left off",
  "settings.playback.resumeSavedHint":
    "Picks up from the saved position. Anything stopped in the last few seconds, or under ten seconds in, starts from the beginning instead.",
  "settings.playback.restart": "Always start from the beginning",
  "settings.playback.restartHint":
    "Ignores saved positions. Positions are still recorded, so progress bars and the other option keep working.",
  "settings.playback.wav": "WAV quality",
  "settings.playback.wavHint":
    "WAV tracks are several megabits per second. Phones tend to stutter on them once the screen goes off and the radio powers down, so they get a compressed copy by default. Requires ffmpeg; without it the original plays regardless.",
  "settings.playback.wavGroup": "WAV streaming quality",
  "settings.playback.wavOriginal": "Stream the original",
  "settings.playback.wavOriginalHint":
    "Sends the file untouched. Best on a desktop or a wired connection, where the bandwidth is there anyway.",
  "settings.playback.wavCompressed": "Send a smaller copy",
  "settings.playback.wavCompressedHint":
    "Converts to 320 kbps MP3 — anywhere from half to a ninth of the original, depending on how the WAV was recorded. Converted once per track and then cached, so the first play of a long WAV takes a few seconds to start.",

  // ── Settings: proxy ───────────────────────────────────────────────────────
  "settings.proxy.title": "DLsite",
  "settings.proxy.description":
    "Route DLsite metadata and image requests through an HTTP proxy (e.g. a Japan-based proxy like glueton), and set how fast to ask.",
  "settings.proxy.enable": "Enable DLsite proxy",
  "settings.proxy.url": "Proxy URL",
  "settings.proxy.test": "Test",
  "settings.proxy.needUrl": "Enter a proxy URL first",
  "settings.dlsite.rateLimit": "Minimum delay between DLsite requests (ms)",
  "settings.dlsite.rateLimitHint":
    "Applies to metadata and cover downloads alike. 0 disables the wait. Scans also back off on their own when DLsite returns an error.",

  // ── Settings: paths ───────────────────────────────────────────────────────
  "settings.paths.title": "Library paths",
  "settings.paths.description":
    "Leave blank to use env defaults (KIKOERU_LIBRARY_ROOT, KIKOERU_COVERS_DIR).",
  "settings.paths.roots": "Library roots (one path per line)",
  "settings.paths.covers": "Covers directory",
  "settings.paths.effective": "Effective:",

  // ── Settings: saving ──────────────────────────────────────────────────────
  "settings.unsaved": "Unsaved changes — scans use saved settings only",
  "settings.save": "Save settings",
  "settings.saved": "Settings saved",
  "settings.saveFailed": "Failed to save: {error}",

  // ── Settings: scans ───────────────────────────────────────────────────────
  "settings.scans.title": "Library scans",
  "settings.scans.description":
    "Run scans using the current paths. Progress shows in a panel.",
  "settings.scans.incremental": "Incremental scan",
  "settings.scans.incrementalHint": "New works and missing covers/metadata only",
  "settings.scans.force": "Force full rescan",
  "settings.scans.forceHint": "Re-fetch all metadata and covers",
  "settings.scans.missingSeiyuu": "Re-scan works missing seiyuu",
  "settings.scans.missingSeiyuuNone": "No works missing seiyuu",
  "settings.scans.missingSeiyuuHint": "{count} works have no voice actors",
  "settings.scans.missingSeiyuuHint_one": "1 work has no voice actors",
  "settings.scans.durations": "Scan missing track durations",
  "settings.scans.durationsHint": "Tracks without a stored duration",
  "settings.scans.durationsAll": "Re-scan all track durations",
  "settings.scans.durationsAllHint": "Every track",

  // ── Backup ────────────────────────────────────────────────────────────────
  "backup.title": "Backup",
  "backup.description":
    "Export library metadata, play progress, likes, bookmarks and cover images to a single JSON file. Audio files and waveform caches are not included — waveforms are regenerated from the audio as you play.",
  "backup.download": "Download backup",
  "backup.started": "Backup started — check your downloads",

  // ── Restore ───────────────────────────────────────────────────────────────
  "restore.title": "Restore from backup",
  "restore.description":
    "Existing rows are left untouched — a restore only fills in what is missing. Work folders are matched by RJ code against the current library roots, so paths from another machine are remapped automatically.",
  "restore.chooseFile": "Choose file",
  "restore.noFile": "No file selected",
  "restore.validate": "Validate",
  "restore.run": "Restore",
  "restore.valid": "Backup looks valid",
  "restore.complete": "Restore complete",
  "restore.failed": "Import failed: {error}",
  "restore.dryRunSummary": "Dry run summary",
  "restore.importSummary": "Import summary",
  "restore.nothingNew":
    "Nothing new to import — every row in this backup is already present.",
  "restore.remapped": "({count} paths remapped)",
  "restore.remapped_one": "(1 path remapped)",
  "restore.warnings": "{count} warnings",
  "restore.warnings_one": "1 warning",
  "restore.row.circles": "Circles",
  "restore.row.voiceActors": "Voice actors",
  "restore.row.tags": "Tags",
  "restore.row.works": "Works",
  "restore.row.workVoiceActors": "Work ↔ voice actors",
  "restore.row.workTags": "Work ↔ tags",
  "restore.row.tracks": "Tracks",
  "restore.row.likes": "Likes",
  "restore.row.progress": "Progress",
  "restore.row.settings": "Settings",
  "restore.row.covers": "Covers",

  // ── Scan progress panel ───────────────────────────────────────────────────
  "scan.panel.scanning": "Scanning library",
  "scan.panel.complete": "Scan complete",
  "scan.panel.idle": "Scan",
  "scan.panel.cancel": "Cancel scan",
  "scan.panel.noCover": "no cover yet",
  "scan.panel.errorCount": "{count} errors",
  "scan.panel.errorCount_one": "1 error",

  "scan.start.scan": "Starting scan…",
  "scan.start.force": "Starting full rescan…",
  "scan.start.missingSeiyuu": "Re-scanning works missing seiyuu…",
  "scan.start.durationsMissing": "Reading missing track durations…",
  "scan.start.durationsAll": "Reading durations for all tracks…",

  "scan.status.preparing": "Preparing…",
  "scan.status.allUpToDate": "All works already up to date",
  "scan.status.scanningWorks": "Scanning {count} works",
  "scan.status.scanningWorks_one": "Scanning 1 work",
  "scan.status.checking": "Checking {id}",
  "scan.status.newWork": "New work {id}",
  "scan.status.fetchingMeta": "Fetching metadata for {id}…",
  "scan.status.noMeta": "No metadata found for {id}",
  "scan.status.metaRetry": "DLsite is not answering — retrying {id}…",
  "scan.status.metaCooldown": "DLsite is not answering — waiting before one more try…",
  "scan.status.downloadingCover": "Downloading cover for {id}…",
  "scan.status.coverSaved": "Saved cover for {id}",
  "scan.status.metaUpToDate": "{id}: metadata up to date",
  "scan.status.tracksIndexed": "{id}: {count} tracks indexed",
  "scan.status.allDurations": "All tracks already have durations",
  "scan.status.readingNewDurations": "Reading durations for {count} new tracks",
  "scan.status.readingDurations": "Reading durations for {count} tracks",
  "scan.status.doneWorks": "Done — {found} works ({skipped} skipped)",
  "scan.status.doneDurations": "Done — {updated} updated, {errors} errors",
  "scan.status.failed": "Scan failed: {error}",

  "scan.log.allUpToDate": "All works up to date",
  "scan.log.scanningWorks": "Scanning {count} works (skipping up-to-date ones)",
  "scan.log.newSuffix": " (new)",
  "scan.log.archiveSuffix": " (archived)",
  "scan.log.fetchingMeta": "  → fetching metadata",
  "scan.log.noMeta": "  ✗ no metadata",
  "scan.log.metaRetry": "  … {reason} — retrying in {seconds}s",
  "scan.log.metaCooldown": "  ! DLsite unavailable — pausing {seconds}s before one last try",
  "scan.log.cover": "  → cover {url}",
  "scan.log.coverSaved": "  ✓ cover saved",
  "scan.log.metaUpToDate": "  • metadata up to date",
  "scan.log.tracks": "  • {count} tracks",
  "scan.log.noNewDurations": "No new track durations to scan",
  "scan.log.readingNewDurations": "Reading durations for {count} new tracks",
  "scan.log.noDurations": "No tracks need duration scan",
  "scan.log.readingDurations": "Reading durations for {count} tracks",
  "scan.log.durationsSummary": "Durations: updated={updated} errors={errors}",
  "scan.log.doneWorks":
    "Done. works={found} new={added} skipped={skipped} tracks={tracks} meta={meta} errors={errors}",
  "scan.log.doneDurations":
    "Done. scanned={scanned} updated={updated} errors={errors}",
} as const;

export type TranslationKey = keyof typeof en;

export const ja: Record<TranslationKey, string> = {
  // ── Common ────────────────────────────────────────────────────────────────
  "common.cancel": "キャンセル",
  "common.close": "閉じる",
  "common.collapse": "折りたたむ",
  "common.expand": "展開する",
  "common.run": "実行",
  "common.search": "検索",
  "common.searchPlaceholder": "検索…",
  "common.noMatches": "一致するものがありません",

  // ── Navigation ────────────────────────────────────────────────────────────
  "nav.library": "ライブラリ",
  "nav.liked": "お気に入り",
  "nav.seiyuu": "声優",
  "nav.circles": "サークル",
  "nav.settings": "設定",

  // ── Header controls ───────────────────────────────────────────────────────
  "header.scanLibrary": "ライブラリをスキャン",
  "header.scanIncremental": "差分のみ",
  "header.forceRescan": "完全に再スキャン",
  "header.forceRescanHint": "メタデータをすべて再取得",
  "header.scanDurations": "再生時間をスキャン",
  "header.scanDurationsHint": "未取得のみ",
  "header.rescanDurations": "再生時間をすべて再スキャン",
  "header.rescanDurationsHint": "すべてのトラック",
  "header.showNsfw": "R18カバーを表示",
  "header.blurNsfw": "R18カバーをぼかす",
  "header.nsfwBlurred": "R18カバー：ぼかし中",
  "header.nsfwVisible": "R18カバー：表示中",

  // ── Search ────────────────────────────────────────────────────────────────
  "search.placeholder": "声優・サークル・ジャンル・作品を検索…",
  "search.empty": "一致するものがありません。Enterでそのまま検索します。",
  "search.enterHint": "Enterで「{query}」をタイトル検索",
  "search.group.seiyuu": "声優",
  "search.group.circle": "サークル",
  "search.group.tag": "ジャンル",
  "search.group.work": "作品",

  // ── Library page ──────────────────────────────────────────────────────────
  "library.title": "ライブラリ",
  "library.workCount": "{count}件の作品",
  "library.workCount_one": "1件の作品",
  "library.filters": "絞り込み",
  "library.filter.voiceActors": "声優",
  "library.filter.circles": "サークル",
  "library.filter.tags": "ジャンル",
  "library.filter.r18": "R18",
  "library.filter.zip": "圧縮ファイル",
  "library.filter.all": "すべて",
  "library.filter.r18Only": "R18のみ",
  "library.filter.r18Exclude": "R18を除く",
  "library.filter.zipOnly": "zipのみ",
  "library.filter.zipExclude": "zipを除く",
  "library.empty.title": "作品がまだありません",
  "library.empty.before": "",
  "library.empty.after":
    " のような名前のフォルダーをライブラリのディレクトリに置き、上部バーの更新ボタンを押してスキャンしてください。",
  "library.cardSize": "カードの大きさ",

  // ── Sorting ───────────────────────────────────────────────────────────────
  "sort.label": "並び替え",
  "sort.added": "追加日",
  "sort.release": "発売日",
  "sort.title": "タイトル",
  "sort.reverseOn": "逆順：オン",
  "sort.reverseOff": "逆順：オフ",
  "sort.aToZ": "あ → ん",
  "sort.zToA": "ん → あ",
  "sort.oldestFirst": "古い順",
  "sort.newestFirst": "新しい順",
  "sort.byWorks": "作品数順",
  "sort.byName": "名前順",

  // ── Active filter chips ───────────────────────────────────────────────────
  "filters.clearAll": "すべて解除",
  "filters.r18Only": "R18のみ",
  "filters.r18Exclude": "R18を除く",
  "filters.zipOnly": "zipのみ",
  "filters.zipExclude": "zipを除く",
  "filters.remove": "{name}を解除",

  // ── On deck ───────────────────────────────────────────────────────────────
  "onDeck.title": "続きから",
  "onDeck.random": "ランダム",
  "onDeck.shuffle": "シャッフル",
  "onDeck.shuffleAgain": "もう一度シャッフル",
  "onDeck.showRandom": "ランダムな作品を表示",
  "onDeck.back": "続きからに戻る",

  // ── Liked page ────────────────────────────────────────────────────────────
  "liked.title": "お気に入りのトラック",
  "liked.trackCount": "{count}件のトラック",
  "liked.trackCount_one": "1件のトラック",
  "liked.empty": "トラックのハートアイコンを押すと、ここに追加されます。",
  "liked.shuffle": "シャッフル",
  "liked.shuffleOn": "順番をシャッフル",
  "liked.shuffleOff": "元の順番に戻す",

  // ── Seiyuu page ───────────────────────────────────────────────────────────
  "seiyuu.title": "声優",
  "seiyuu.empty":
    "声優が見つかりません。まずライブラリをスキャンしてください。",

  // ── Circles page ──────────────────────────────────────────────────────────
  "circles.title": "サークル",
  "circles.empty":
    "サークルが見つかりません。まずライブラリをスキャンしてください。",

  // ── Work detail ───────────────────────────────────────────────────────────
  "work.circle": "サークル",
  "work.voiceActors": "声優",
  "work.tags": "ジャンル",
  "work.viewOnDlsite": "DLsiteで見る",
  "work.enlargeCover": "ジャケットを拡大表示",
  "work.tracks": "トラック",
  "work.noTracks": "この作品のフォルダーに音声ファイルが見つかりません。",
  "work.noTracksArchived": "まだ再生できません。書庫を展開してから再スキャンしてください。",
  "work.archived": "{file} に圧縮されたままです。展開すると再生できます。",
  "work.openFolder": "フォルダーを開く",
  "work.showArchive": "書庫を表示",
  "work.moreTags": "他{count}件のジャンル",
  "work.moreTags_one": "他1件のジャンル",
  "work.openFolderFailed": "フォルダーを開けませんでした：{error}",
  "work.extras": "おまけ",
  "work.extrasScripts": "台本",
  "work.extrasImages": "画像",
  "work.extrasVideos": "動画",
  "work.extrasOther": "その他のファイル",
  "work.openScript": "台本を読む",
  "work.openInNewTab": "新しいタブで開く",
  "work.scriptFor": "このトラックの台本",
  "work.previousImage": "前の画像",
  "work.nextImage": "次の画像",
  "script.counter": "台本 {index} / {total}",
  "script.previous": "前の台本",
  "script.next": "次の台本",
  "script.toggleOrientation": "縦書きと横書きを切り替え",
  "script.textSmaller": "文字を小さく",
  "script.textLarger": "文字を大きく",
  "script.loading": "読み込み中…",
  "script.failed": "この台本を読み込めませんでした。",
  "script.empty": "この台本は空です。",

  // ── Tracks ────────────────────────────────────────────────────────────────
  "track.play": "再生",
  "track.pause": "一時停止",
  "track.like": "お気に入りに追加",
  "track.unlike": "お気に入りを解除",
  "track.collapseAll": "すべて折りたたむ",
  "track.expandAll": "すべて展開する",
  "track.collapseAllFolders": "フォルダーをすべて折りたたむ",
  "track.expandAllFolders": "フォルダーをすべて展開する",

  // ── Player ────────────────────────────────────────────────────────────────
  "player.previous": "前へ",
  "player.next": "次へ",
  "player.volume": "音量",
  "player.seek": "シーク",
  "player.seekPosition": "{total} 中 {current}",

  // ── Edit work dialog ──────────────────────────────────────────────────────
  "edit.trigger": "作品を編集",
  "edit.title": "作品を編集",
  "edit.changeFile": "ファイルを変更…",
  "edit.uploadImage": "画像をアップロード…",
  "edit.coverUrlPlaceholder": "…または画像URLを貼り付け",
  "edit.field.title": "タイトル",
  "edit.field.circle": "サークル",
  "edit.field.releaseDate": "発売日",
  "edit.field.workType": "作品形式",
  "edit.field.language": "言語",
  "edit.field.voiceActors": "声優",
  "edit.field.tags": "ジャンル",
  "edit.field.description": "説明",
  "edit.addVoiceActor": "声優を追加…",
  "edit.addTagPlaceholder": "ジャンルを追加…",
  "edit.addValue": "追加",
  "edit.remove": "{name}を削除",
  "edit.nsfw": "R18 / 成人向け",
  "edit.refreshFromDlsite": "DLsiteから再取得",
  "edit.refreshing": "取得中…",
  "edit.refreshed": "DLsiteから情報を再取得しました",
  "edit.refreshFailed": "再取得できませんでした：{error}",
  "edit.save": "変更を保存",
  "edit.saving": "保存中…",
  "edit.titleRequired": "タイトルは必須です",
  "edit.saveFailed": "保存できませんでした：{error}",
  "edit.coverFailed": "詳細は保存しましたが、カバーに失敗しました：{error}",
  "edit.coverUrlFailed": "詳細は保存しましたが、カバーURLに失敗しました：{error}",
  "edit.updated": "作品を更新しました",

  // ── Add tag ───────────────────────────────────────────────────────────────
  "addTag.label": "ジャンルを追加",
  "addTag.create": "作成",

  // ── Delete work ───────────────────────────────────────────────────────────
  "delete.trigger": "エントリを削除",
  "delete.title": "このエントリを削除しますか？",
  "delete.before": "",
  "delete.after":
    "（{id}）をライブラリから削除します。トラック、ジャンル、お気に入り、再生位置も一緒に削除されます。ディスク上の音声ファイルには手を加えません。",
  "delete.confirm": "削除",
  "delete.deleting": "削除中…",
  "delete.failed": "削除できませんでした：{error}",
  "delete.done": "エントリを削除しました",

  // ── Login ─────────────────────────────────────────────────────────────────
  "login.subtitle": "ライブラリにサインイン",
  "login.password": "パスワード",
  "login.error": "パスワードが違います",
  "login.submit": "サインイン",

  // ── Settings: language ────────────────────────────────────────────────────
  "settings.title": "設定",
  "settings.language.title": "言語",
  "settings.language.description":
    "インターフェースの表示言語です。作品タイトル・ジャンル・声優名は取り込んだままの表記で表示されます。",
  "settings.language.group": "表示言語",

  // ── Settings: appearance ──────────────────────────────────────────────────
  "settings.appearance.title": "外観",
  "settings.appearance.description":
    "この端末での表示方法です。設定はブラウザに保存されるため、端末ごとに個別に保持されます。",
  "settings.appearance.theme": "テーマ",
  "settings.appearance.themeHint":
    "「システム」は端末の設定に従い、切り替わると一緒に変わります。",
  "settings.appearance.themeGroup": "配色テーマ",
  "settings.appearance.themeLight": "ライト",
  "settings.appearance.themeDark": "ダーク",
  "settings.appearance.themeSystem": "システム",
  "settings.appearance.seekbar": "プレーヤーのシークバー",
  "settings.appearance.seekbarHint":
    "波形はトラックごとにffmpegで一度だけ生成してキャッシュするため、長いファイルの初回再生では数秒間バー表示になることがあります。",
  "settings.appearance.seekbarGroup": "シークバーの種類",
  "settings.appearance.bar": "クラシックバー",
  "settings.appearance.barHint": "プレーヤー上端に沿った細い進行ラインです。",
  "settings.appearance.waveform": "波形",
  "settings.appearance.waveformHint":
    "トラックの音量を表示するので、シークする前に無音部分や盛り上がりが分かります。",
  "settings.appearance.libraryCards": "ライブラリのカード",
  "settings.appearance.hideTags": "ライブラリのカードでジャンルを非表示にする",
  "settings.appearance.hideTagsHint":
    "声優のチップはそのまま表示されます。ジャンルは作品ページと絞り込みパネルには残ります。",

  // ── Settings: playback ────────────────────────────────────────────────────
  "settings.playback.title": "再生",
  "settings.playback.description":
    "この端末でトラックを開始する位置の設定です。再生位置自体は全端末で共有されますが、この選択はブラウザに保存されます。",
  "settings.playback.resume": "トラックの開始位置",
  "settings.playback.resumeHint":
    "最後まで再生し終えたトラックは、どちらを選んでも先頭から再生されます。そうしないと開始直後に終了扱いとなり、プレーヤーが次へ飛ばしてしまうためです。",
  "settings.playback.resumeGroup": "トラックの開始位置",
  "settings.playback.resumeSaved": "続きから再生する",
  "settings.playback.resumeSavedHint":
    "保存された位置から再開します。終了間際で止めた場合や10秒未満しか再生していない場合は先頭から始まります。",
  "settings.playback.restart": "常に先頭から再生する",
  "settings.playback.restartHint":
    "保存された位置を使いません。位置の記録は続くため、進行バーやもう一方の設定はそのまま機能します。",
  "settings.playback.wav": "WAVの音質",
  "settings.playback.wavHint":
    "WAVは毎秒数メガビットあります。画面を消して通信が省電力状態に入るとスマートフォンでは音が途切れがちなため、既定では圧縮したものを配信します。ffmpegが必要で、無い場合は元のファイルをそのまま再生します。",
  "settings.playback.wavGroup": "WAVの配信音質",
  "settings.playback.wavOriginal": "元のまま配信する",
  "settings.playback.wavOriginalHint":
    "ファイルをそのまま送ります。帯域に余裕のあるデスクトップや有線接続に向いています。",
  "settings.playback.wavCompressed": "小さくして配信する",
  "settings.playback.wavCompressedHint":
    "320kbpsのMP3に変換します。容量は元の2分の1から9分の1程度で、WAVの録音形式によって変わります。トラックごとに一度だけ変換してキャッシュするため、長いWAVの初回再生は開始まで数秒かかります。",

  // ── Settings: proxy ───────────────────────────────────────────────────────
  "settings.proxy.title": "DLsite",
  "settings.proxy.description":
    "DLsiteのメタデータと画像のリクエストをHTTPプロキシ経由にし（gluetonなど日本国内のプロキシを想定）、リクエストの間隔を設定します。",
  "settings.proxy.enable": "DLsiteプロキシを有効にする",
  "settings.proxy.url": "プロキシURL",
  "settings.proxy.test": "テスト",
  "settings.proxy.needUrl": "先にプロキシURLを入力してください",
  "settings.dlsite.rateLimit": "DLsiteへのリクエストの最小間隔（ミリ秒）",
  "settings.dlsite.rateLimitHint":
    "メタデータとカバー画像の両方に適用されます。0で待機なし。DLsiteがエラーを返した場合は自動的に間隔を空けます。",

  // ── Settings: paths ───────────────────────────────────────────────────────
  "settings.paths.title": "ライブラリのパス",
  "settings.paths.description":
    "空欄にすると環境変数の既定値（KIKOERU_LIBRARY_ROOT、KIKOERU_COVERS_DIR）を使用します。",
  "settings.paths.roots": "ライブラリのルート（1行に1パス）",
  "settings.paths.covers": "カバー画像のディレクトリ",
  "settings.paths.effective": "実際の値：",

  // ── Settings: saving ──────────────────────────────────────────────────────
  "settings.unsaved": "未保存の変更があります — スキャンは保存済みの設定のみを使います",
  "settings.save": "設定を保存",
  "settings.saved": "設定を保存しました",
  "settings.saveFailed": "保存に失敗しました：{error}",

  // ── Settings: scans ───────────────────────────────────────────────────────
  "settings.scans.title": "ライブラリのスキャン",
  "settings.scans.description":
    "現在のパスを使ってスキャンします。進行状況はパネルに表示されます。",
  "settings.scans.incremental": "差分スキャン",
  "settings.scans.incrementalHint": "新しい作品と未取得のカバー・メタデータのみ",
  "settings.scans.force": "完全に再スキャン",
  "settings.scans.forceHint": "メタデータとカバーをすべて再取得",
  "settings.scans.missingSeiyuu": "声優が未設定の作品を再スキャン",
  "settings.scans.missingSeiyuuNone": "声優が未設定の作品はありません",
  "settings.scans.missingSeiyuuHint": "{count}件の作品に声優が設定されていません",
  "settings.scans.missingSeiyuuHint_one": "1件の作品に声優が設定されていません",
  "settings.scans.durations": "未取得の再生時間をスキャン",
  "settings.scans.durationsHint": "再生時間が保存されていないトラック",
  "settings.scans.durationsAll": "再生時間をすべて再スキャン",
  "settings.scans.durationsAllHint": "すべてのトラック",

  // ── Backup ────────────────────────────────────────────────────────────────
  "backup.title": "バックアップ",
  "backup.description":
    "ライブラリのメタデータ、再生位置、お気に入り、ブックマーク、カバー画像を1つのJSONファイルに書き出します。音声ファイルと波形キャッシュは含まれません（波形は再生時に音声から再生成されます）。",
  "backup.download": "バックアップをダウンロード",
  "backup.started": "バックアップを開始しました — ダウンロードを確認してください",

  // ── Restore ───────────────────────────────────────────────────────────────
  "restore.title": "バックアップから復元",
  "restore.description":
    "既存のデータはそのまま残り、足りない分だけを補います。作品フォルダーはRJコードで現在のライブラリルートと突き合わせるため、別のマシンのパスも自動的に対応付けられます。",
  "restore.chooseFile": "ファイルを選択",
  "restore.noFile": "ファイルが選択されていません",
  "restore.validate": "検証",
  "restore.run": "復元",
  "restore.valid": "バックアップは正常です",
  "restore.complete": "復元が完了しました",
  "restore.failed": "インポートに失敗しました：{error}",
  "restore.dryRunSummary": "検証結果",
  "restore.importSummary": "インポート結果",
  "restore.nothingNew":
    "取り込むものはありません — このバックアップの内容はすべて既に存在します。",
  "restore.remapped": "（{count}件のパスを対応付け）",
  "restore.remapped_one": "（1件のパスを対応付け）",
  "restore.warnings": "警告{count}件",
  "restore.warnings_one": "警告1件",
  "restore.row.circles": "サークル",
  "restore.row.voiceActors": "声優",
  "restore.row.tags": "ジャンル",
  "restore.row.works": "作品",
  "restore.row.workVoiceActors": "作品 ↔ 声優",
  "restore.row.workTags": "作品 ↔ ジャンル",
  "restore.row.tracks": "トラック",
  "restore.row.likes": "お気に入り",
  "restore.row.progress": "再生位置",
  "restore.row.settings": "設定",
  "restore.row.covers": "カバー",

  // ── Scan progress panel ───────────────────────────────────────────────────
  "scan.panel.scanning": "ライブラリをスキャン中",
  "scan.panel.complete": "スキャン完了",
  "scan.panel.idle": "スキャン",
  "scan.panel.cancel": "スキャンを中止",
  "scan.panel.noCover": "カバー未取得",
  "scan.panel.errorCount": "エラー{count}件",
  "scan.panel.errorCount_one": "エラー1件",

  "scan.start.scan": "スキャンを開始しています…",
  "scan.start.force": "完全な再スキャンを開始しています…",
  "scan.start.missingSeiyuu": "声優が未設定の作品を再スキャンしています…",
  "scan.start.durationsMissing": "未取得の再生時間を読み取っています…",
  "scan.start.durationsAll": "すべてのトラックの再生時間を読み取っています…",

  "scan.status.preparing": "準備中…",
  "scan.status.allUpToDate": "すべての作品が最新です",
  "scan.status.scanningWorks": "{count}件の作品をスキャン中",
  "scan.status.scanningWorks_one": "1件の作品をスキャン中",
  "scan.status.checking": "{id}を確認中",
  "scan.status.newWork": "新しい作品 {id}",
  "scan.status.fetchingMeta": "{id}のメタデータを取得中…",
  "scan.status.noMeta": "{id}のメタデータが見つかりません",
  "scan.status.metaRetry": "DLsiteが応答しません — {id}を再試行中…",
  "scan.status.metaCooldown": "DLsiteが応答しません — 少し待ってから最後の再試行をします…",
  "scan.status.downloadingCover": "{id}のカバーをダウンロード中…",
  "scan.status.coverSaved": "{id}のカバーを保存しました",
  "scan.status.metaUpToDate": "{id}：メタデータは最新です",
  "scan.status.tracksIndexed": "{id}：{count}件のトラックを登録しました",
  "scan.status.allDurations": "すべてのトラックに再生時間があります",
  "scan.status.readingNewDurations": "新しい{count}件のトラックの再生時間を読み取り中",
  "scan.status.readingDurations": "{count}件のトラックの再生時間を読み取り中",
  "scan.status.doneWorks": "完了 — {found}件の作品（{skipped}件スキップ）",
  "scan.status.doneDurations": "完了 — {updated}件更新、{errors}件エラー",
  "scan.status.failed": "スキャンに失敗しました：{error}",

  "scan.log.allUpToDate": "すべての作品が最新です",
  "scan.log.scanningWorks": "{count}件の作品をスキャン中（最新のものはスキップ）",
  "scan.log.newSuffix": "（新規）",
  "scan.log.archiveSuffix": "（圧縮済み）",
  "scan.log.fetchingMeta": "  → メタデータを取得中",
  "scan.log.noMeta": "  ✗ メタデータなし",
  "scan.log.metaRetry": "  … {reason} — {seconds}秒後に再試行",
  "scan.log.metaCooldown": "  ! DLsiteに接続できません — {seconds}秒待ってから最後の再試行",
  "scan.log.cover": "  → カバー {url}",
  "scan.log.coverSaved": "  ✓ カバーを保存",
  "scan.log.metaUpToDate": "  • メタデータは最新",
  "scan.log.tracks": "  • {count}件のトラック",
  "scan.log.noNewDurations": "新しく読み取る再生時間はありません",
  "scan.log.readingNewDurations": "新しい{count}件のトラックの再生時間を読み取り中",
  "scan.log.noDurations": "再生時間のスキャンが必要なトラックはありません",
  "scan.log.readingDurations": "{count}件のトラックの再生時間を読み取り中",
  "scan.log.durationsSummary": "再生時間：更新={updated} エラー={errors}",
  "scan.log.doneWorks":
    "完了。作品={found} 新規={added} スキップ={skipped} トラック={tracks} メタ={meta} エラー={errors}",
  "scan.log.doneDurations":
    "完了。走査={scanned} 更新={updated} エラー={errors}",
};
