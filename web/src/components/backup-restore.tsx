"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  FileJson,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

interface RestoreSummary {
  imported: Record<string, number>;
  remapped: number;
  notFound: string[];
  warnings: string[];
  errors: string[];
}

type Phase = "idle" | "validating" | "restoring";

/** Table key -> label key, in the order the summary should read. */
const ROWS: Array<[string, TranslationKey]> = [
  ["circles", "restore.row.circles"],
  ["voice_actors", "restore.row.voiceActors"],
  ["tags", "restore.row.tags"],
  ["works", "restore.row.works"],
  ["work_voice_actors", "restore.row.workVoiceActors"],
  ["work_tags", "restore.row.workTags"],
  ["tracks", "restore.row.tracks"],
  ["likes", "restore.row.likes"],
  ["track_progress", "restore.row.progress"],
  ["settings", "restore.row.settings"],
  ["covers", "restore.row.covers"],
];

export function BackupRestore() {
  const router = useRouter();
  const { t } = useTranslations();
  const fileInput = useRef<HTMLInputElement>(null);

  const [downloading, setDownloading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<
    { kind: "validated" | "restored"; summary: RestoreSummary } | null
  >(null);

  function download() {
    setDownloading(true);
    // Navigating rather than fetching lets the browser stream the response
    // straight to disk — a full library is far too big to hold as a Blob.
    const link = document.createElement("a");
    link.href = "/api/backup/export";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success(t("backup.started"));
    // No completion signal is available for a browser-managed download, so
    // just re-enable the button once the request is safely on its way.
    setTimeout(() => setDownloading(false), 2000);
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setPhase(dryRun ? "validating" : "restoring");
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/backup/import?dryRun=${dryRun}`, {
        method: "POST",
        body,
      });
      const payload = (await res.json()) as RestoreSummary | { error: string };
      if (!res.ok) {
        const message =
          "error" in payload ? payload.error : `HTTP ${res.status}`;
        toast.error(message);
        setResult({
          kind: dryRun ? "validated" : "restored",
          summary: emptySummary(message),
        });
        return;
      }
      const summary = payload as RestoreSummary;
      setResult({ kind: dryRun ? "validated" : "restored", summary });
      if (summary.errors.length > 0) {
        toast.error(summary.errors[0]);
      } else if (dryRun) {
        toast.success(t("restore.valid"));
      } else {
        toast.success(t("restore.complete"));
        router.refresh();
      }
    } catch (err) {
      toast.error(t("restore.failed", { error: String(err) }));
      setResult({
        kind: dryRun ? "validated" : "restored",
        summary: emptySummary(String(err)),
      });
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> {t("backup.title")}
          </CardTitle>
          <CardDescription>{t("backup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={download} disabled={downloading}>
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("backup.download")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> {t("restore.title")}
          </CardTitle>
          <CardDescription>{t("restore.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <FileJson className="h-4 w-4" />
              {t("restore.chooseFile")}
            </Button>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {file
                ? `${file.name} (${formatBytes(file.size)})`
                : t("restore.noFile")}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => run(true)}
              disabled={!file || busy}
            >
              {phase === "validating" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t("restore.validate")}
            </Button>
            <Button onClick={() => run(false)} disabled={!file || busy}>
              {phase === "restoring" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("restore.run")}
            </Button>
          </div>

          {result && <Summary kind={result.kind} summary={result.summary} />}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  kind,
  summary,
}: {
  kind: "validated" | "restored";
  summary: RestoreSummary;
}) {
  const { t } = useTranslations();
  const rows = ROWS.filter(([key]) => (summary.imported[key] ?? 0) > 0);

  return (
    <div className="space-y-3 rounded-md border px-3 py-3 text-sm">
      <div className="font-medium">
        {kind === "validated"
          ? t("restore.dryRunSummary")
          : t("restore.importSummary")}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("restore.nothingNew")}
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {rows.map(([key, labelKey]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{t(labelKey)}</dt>
              <dd className="font-mono">
                {summary.imported[key]}
                {key === "works" && summary.remapped > 0
                  ? ` ${t("restore.remapped", { count: summary.remapped })}`
                  : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {summary.errors.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {summary.errors.map((e, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{e}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.warnings.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-500">
            {t("restore.warnings", { count: summary.warnings.length })}
          </summary>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {summary.warnings.map((w, i) => (
              <li key={i} className="break-words">
                • {w}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function emptySummary(error: string): RestoreSummary {
  return {
    imported: {},
    remapped: 0,
    notFound: [],
    warnings: [],
    errors: [error],
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
