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
import { PlayerSettings } from "./player-settings";

interface Settings {
  dlsiteProxyUrl: string;
  dlsiteProxyEnabled: boolean;
  libraryRoots: string[];
  coversDir: string;
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
}: {
  initial: Settings;
  effective: { libraryRoots: string[]; coversDir: string };
  missingSeiyuuCount: number;
}) {
  const router = useRouter();
  const scan = useScanProgress();
  const [values, setValues] = useState<Settings>(initial);
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
    rootsChanged ||
    values.coversDir !== saved.coversDir;

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
      toast.success("Settings saved");
      router.refresh();
    } catch (err) {
      toast.error(`Failed to save: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function testProxy() {
    if (!values.dlsiteProxyUrl.trim()) {
      setTest({ state: "fail", message: "Enter a proxy URL first" });
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
      {/* Player */}
      <PlayerSettings />

      {/* Proxy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-4 w-4" /> DLsite proxy
          </CardTitle>
          <CardDescription>
            Route DLsite metadata and image requests through an HTTP proxy
            (e.g. a Japan-based proxy like glueton). HVDB is not proxied.
          </CardDescription>
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
            Enable DLsite proxy
          </label>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Proxy URL</label>
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
                Test
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
        </CardContent>
      </Card>

      {/* Paths */}
      <Card>
        <CardHeader>
          <CardTitle>Library paths</CardTitle>
          <CardDescription>
            Leave blank to use env defaults (KIKOERU_LIBRARY_ROOT,
            KIKOERU_COVERS_DIR).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Library roots (one path per line)
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
              Effective:
              <ul className="mt-1 space-y-0.5">
                {effective.libraryRoots.map((r) => (
                  <li key={r} className="font-mono">{r}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Covers directory</label>
            <Input
              value={values.coversDir}
              onChange={(e) =>
                setValues((v) => ({ ...v, coversDir: e.target.value }))
              }
              placeholder={effective.coversDir}
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Effective: <span className="font-mono">{effective.coversDir}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <span className="text-xs text-amber-500">
            Unsaved changes — scans use saved settings only
          </span>
        )}
        <Button onClick={() => save()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </Button>
      </div>

      {/* Scan actions */}
      <Card>
        <CardHeader>
          <CardTitle>Library scans</CardTitle>
          <CardDescription>
            Run scans using the current paths. Progress shows in a panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ScanRow
            label="Incremental scan"
            hint="New works and missing covers/metadata only"
            icon={<RefreshCw className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "library" })}
          />
          <ScanRow
            label="Force full rescan"
            hint="Re-fetch all metadata and covers"
            icon={<RotateCw className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "library", force: true })}
          />
          <ScanRow
            label="Re-scan works missing seiyuu"
            hint={
              missingSeiyuuCount === 0
                ? "No works missing seiyuu"
                : `${missingSeiyuuCount} work${missingSeiyuuCount === 1 ? "" : "s"} have no voice actors`
            }
            icon={<Mic2 className="h-4 w-4" />}
            disabled={scan.busy || missingSeiyuuCount === 0}
            onClick={() => scan.start({ kind: "library", missingSeiyuu: true })}
          />
          <ScanRow
            label="Scan missing track durations"
            hint="Tracks without a stored duration"
            icon={<Timer className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "durations" })}
          />
          <ScanRow
            label="Re-scan all track durations"
            hint="Every track"
            icon={<Timer className="h-4 w-4" />}
            disabled={scan.busy}
            onClick={() => scan.start({ kind: "durations", all: true })}
          />
        </CardContent>
      </Card>

      {scan.panel}
    </div>
  );
}

function ScanRow({
  label,
  hint,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
        Run
      </Button>
    </div>
  );
}
