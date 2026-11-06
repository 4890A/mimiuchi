"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPicker } from "@/components/folder-picker";
import { setupAction, type FormState } from "@/lib/auth/actions";
import { formErrorMessage } from "@/lib/auth/form-errors";
import { cleanPathInput } from "@/lib/paths";
import { useTranslations } from "@/lib/i18n/client";

export function SetupForm({ initialFolders }: { initialFolders: string[] }) {
  const { t } = useTranslations();
  const [state, action, pending] = useActionState<FormState, FormData>(
    setupAction,
    {},
  );
  const [folders, setFolders] = useState<string[]>(initialFolders);
  const [typed, setTyped] = useState("");

  function add(raw: string) {
    const p = cleanPathInput(raw);
    if (p && !folders.includes(p)) setFolders([...folders, p]);
  }

  return (
    <form
      action={action}
      className="space-y-6 rounded-xl border bg-card/60 p-6 shadow-sm backdrop-blur"
    >
      <input type="hidden" name="folders" value={folders.join("\n")} />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("setup.folders.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("setup.folders.hint")}
          </p>
        </div>

        {folders.length > 0 && (
          <ul className="space-y-1.5">
            {folders.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f}>
                  {f}
                </span>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("setup.folders.remove", { path: f })}
                  onClick={() => setFolders(folders.filter((x) => x !== f))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <FolderPicker
            onPick={add}
            label={
              folders.length === 0
                ? t("setup.folders.choose")
                : t("setup.folders.addAnother")
            }
          />
        </div>
        <div className="flex gap-2">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(typed);
                setTyped("");
              }
            }}
            placeholder={t("setup.folders.pastePlaceholder")}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="font-mono text-xs"
            aria-label={t("setup.folders.pastePlaceholder")}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!cleanPathInput(typed)}
            onClick={() => {
              add(typed);
              setTyped("");
            }}
            aria-label={t("setup.folders.add")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="space-y-3 border-t pt-5">
        <div>
          <h2 className="text-sm font-semibold">{t("setup.password.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("setup.password.hint")}
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-xs text-muted-foreground">
            {t("setup.password.new")}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm" className="text-xs text-muted-foreground">
            {t("setup.password.confirm")}
          </label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
      </section>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {formErrorMessage(t, state.error)}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={pending || folders.length === 0}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("setup.submit")}
      </Button>
    </form>
  );
}
