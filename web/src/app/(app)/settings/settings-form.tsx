"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCw,
  Save,
  Timer,
  XCircle,
  Mic2,
  PlugZap,
  ScrollText,
  FolderX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useScanProgress } from "@/components/scan-progress";
import { removeMissingWorks } from "@/lib/actions";
import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { AppearanceSettings } from "./appearance-settings";
import { LanguageSettings } from "./language-settings";
import { PlaybackSettings } from "./playback-settings";

interface Settings {
  dlsiteProxyUrl: string;
  dlsiteProxyEnabled: boolean;
  dlsiteMinIntervalMs: number;
  libraryRoots: string[];
  coversDir: string;
  includeUnmatchedFolders: boolean;
}

type TestResult =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; message: string }
  | { state: "fail"; message: string };

export function SettingsForm({
  initial,
  effective,
  missingSeiyuuCount,
  missingWorks,
}: {
  initial: Settings;
  effective: { libraryRoots: string[]; coversDir: string };
  missingSeiyuuCount: number;
  /** Works a scan found absent from disk, awaiting the user's go-ahead. */
  missingWorks: { id: string; title: string }[];
}) {
  const router = useRouter();
  const scan = useScanProgress();
  const { t } = useTranslations();
  const [values, setValues] = useState<Settings>(initial);
  const [removing, setRemoving] = useState(false);
  const [rootsText, setRootsText] = useState(initial.libraryRoots.join("\n"));
  const [saved, setSaved] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestResult>({ state: "idle" });

  const rootsFromText = rootsText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const rootsChanged =
    rootsFromText.length !== saved.libraryRoots.length ||
    rootsFromText.some((r, i) => r !== saved.libraryRoots[i]);

  const dirty =
    values.dlsiteProxyUrl !== saved.dlsiteProxyUrl ||
    values.dlsiteProxyEnabled !== saved.dlsiteProxyEnabled ||
    values.dlsiteMinIntervalMs !== saved.dlsiteMinIntervalMs ||
    rootsChanged ||
    values.coversDir !== saved.coversDir ||
    values.includeUnmatchedFolders !== saved.includeUnmatchedFolders;

  async function save(next: Settings = { ...values, libraryRoots: rootsFromText }) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const persisted = (await res.json()) as Settings;
      setValues(persisted);
      setRootsText(persisted.libraryRoots.join("\n"));
      setSaved(persisted);
      toast.success(t("settings.saved"));
      router.refresh();
    } catch (err) {
      toast.error(t("settings.saveFailed", { error: String(err) }));
    } finally {
      setSaving(false);
    }
  }

  async function testProxy() {
    if (!values.dlsiteProxyUrl.trim()) {
      setTest({ state: "fail", message: t("settings.proxy.needUrl") });
      return;
    }
    setTest({ state: "testing" });
    try {
      const res = await fetch("/api/settings/test-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: values.dlsiteProxyUrl }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setTest({ state: data.ok ? "ok" : "fail", message: data.message });
    } catch (err) {
      setTest({ state: "fail", message: String(err) });
    }
  }

  return (
    <div className="space-y-6">
      {/* Language */}
      <LanguageSettings />

      {/* Appearance */}
      <AppearanceSettings />

      {/* Playback */}
      <PlaybackSettings />

      {/* Proxy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-4 w-4" /> {t("settings.proxy.title")}
          </CardTitle>
          <CardDescription>{t("settings.proxy.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.dlsiteProxyEnabled}
              onChange={(e) => {
                const next = {
                  ...values,
                  dlsiteProxyEnabled: e.target.checked,
                  libraryRoots: rootsFromText,
                };
                setValues({ ...values, dlsiteProxyEnabled: e.target.checked });
                void save(next);
              }}
              className="h-4 w-4"
            />
            {t("settings.proxy.enable")}
          </label>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("settings.proxy.url")}
            </label>
            <div className="flex gap-2">
              <Input
                value={values.dlsiteProxyUrl}
                onChange={(e) =>
                  setValues((v) => ({ ...v, dlsiteProxyUrl: e.target.value }))
                }
                placeholder="http://localhost:8888"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <Button
                variant="outline"
                onClick={testProxy}
                disabled={test.state === "testing"}
              >
                {test.state === "testing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                {t("settings.proxy.test")}
              </Button>
            </div>
            {test.state === "ok" && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> {test.message}
              </p>
            )}
            {test.state === "fail" && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircle className="h-3.5 w-3.5" /> {test.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="dlsite-rate-limit">
              {t("settings.dlsite.rateLimit")}
            </label>
            <Input
              id="dlsite-rate-limit"
              type="number"
              min={0}
              max={60000}
              step={100}
              value={values.dlsiteMinIntervalMs}
              onChange={(e) => {
                // An emptied field parses to NaN; treat it as "no wait" rather
                // than letting NaN reach the save body.
                const n = Number.parseInt(e.target.value, 10);
                setValues((v) => ({
                  ...v,
                  dlsiteMinIntervalMs: Number.isFinite(n) ? Math.max(0, n) : 0,
                }));
              }}
              className="max-w-40"
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.dlsite.rateLimitHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Paths */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.paths.title")}</CardTitle>
          <CardDescription>{t("settings.paths.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("settings.paths.roots")}
            </label>
            <Textarea
              value={rootsText}
              onChange={(e) => setRootsText(e.target.value)}
              placeholder={effective.libraryRoots.join("\n")}
              spellCheck={false}
              rows={Math.max(3, effective.libraryRoots.length + 1)}
              className="font-mono text-xs"
            />
            <div className="text-xs text-muted-foreground">
              {t("settings.paths.effective")}
              <ul className="mt-1 space-y-0.5">
                {effective.libraryRoots.map((r) => (
                  <li key={r} className="font-mono">{r}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("settings.paths.covers")}
            </label>
            <Input
              value={values.coversDir}
              onChange={(e) =>
                setValues((v) => ({ ...v, coversDir: e.target.value }))
              }
              placeholder={effective.coversDir}
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.paths.effective")}{" "}
              <span className="font-mono">{effective.coversDir}</span>
            </p>
          </div>
          <div className="space-y-1.5 border-t pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.includeUnmatchedFolders}
                onChange={(e) => {
                  const next = {
                    ...values,
                    includeUnmatchedFolders: e.target.checked,
                    libraryRoots: rootsFromText,
                  };
                  setValues({
                    ...values,
                    includeUnmatchedFolders: e.target.checked,
                  });
                  void save(next);
                }}
                className="h-4 w-4"
              />
              {t("settings.paths.includeUnmatched")}
            </label>
            <p className="text-xs text-muted-foreground">
              {t("settings.paths.includeUnmatchedHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <span className="text-xs text-amber-500">{t("settings.unsaved")}</span>
        )}
        <Button onClick={() => save()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("settings.save")}
        </Button>
      </div>

      {/* Scan actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.scans.title")}</CardTitle>
          <CardDescription>{t("settings.scans.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ScanRow
            labelKey="settings.scans.incremental"
            hint={t("settings.scans.incrementalHint")}
            icon={<RefreshCw className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "library" })}
          />
          <ScanRow
            labelKey="settings.scans.force"
            hint={t("settings.scans.forceHint")}
            icon={<RotateCw className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "library", force: true })}
          />
          <ScanRow
            labelKey="settings.scans.extras"
            hint={t("settings.scans.extrasHint")}
            icon={<ScrollText className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "library", extras: true })}
          />
          <ScanRow
            labelKey="settings.scans.missingSeiyuu"
            hint={
              missingSeiyuuCount === 0
                ? t("settings.scans.missingSeiyuuNone")
                : t("settings.scans.missingSeiyuuHint", {
                    count: missingSeiyuuCount,
                  })
            }
            icon={<Mic2 className="h-4 w-4" />}
            disabled={scan.busy || missingSeiyuuCount === 0}
            onClick={() => scan.start({ kind: "library", missingSeiyuu: true })}
          />
          <ScanRow
            labelKey="settings.scans.durations"
            hint={t("settings.scans.durationsHint")}
            icon={<Timer className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "durations" })}
          />
          <ScanRow
            labelKey="settings.scans.durationsAll"
            hint={t("settings.scans.durationsAllHint")}
            icon={<Timer className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "durations", all: true })}
          />
        </CardContent>
      </Card>

      {missingWorks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <FolderX className="h-4 w-4" />
              {t("settings.missing.title", { count: missingWorks.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("settings.missing.body")}
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
              {missingWorks.map((w) => (
                <li key={w.id} className="truncate">
                  <span className="font-mono text-muted-foreground">{w.id}</span>{" "}
                  {w.title}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              <Button
                variant="destructive"
                size="sm"
                disabled={removing}
                onClick={async () => {
                  setRemoving(true);
                  const r = await removeMissingWorks();
                  setRemoving(false);
                  if (r.ok) {
                    toast.success(
                      t("settings.missing.removed", { count: r.removed }),
                    );
                    router.refresh();
                  } else {
                    toast.error(r.error);
                  }
                }}
              >
                {t("settings.missing.remove", { count: missingWorks.length })}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("settings.missing.keepHint")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {scan.panel}
    </div>
  );
}

function ScanRow({
  labelKey,
  hint,
  icon,
  disabled,
  onClick,
}: {
  labelKey: TranslationKey;
  hint: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {t(labelKey)}
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {/* Every row's button reads "Run"; the label that says which scan it
          runs is the sibling above. Name the button after its row so it is
          distinguishable to a screen reader (and to a test). */}
      <Button
        variant="outline"
        size="sm"
        aria-label={t(labelKey)}
        onClick={onClick}
        disabled={disabled}
      >
        {t("common.run")}
      </Button>
    </div>
  );
}
