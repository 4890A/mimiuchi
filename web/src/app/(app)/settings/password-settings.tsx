"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { changePasswordAction, type FormState } from "@/lib/auth/actions";
import { formErrorMessage } from "@/lib/auth/form-errors";
import type { PasswordSource } from "@/lib/auth/password";
import { useTranslations } from "@/lib/i18n/client";

export function PasswordSettings({ source }: { source: PasswordSource }) {
  const { t } = useTranslations();
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success(t("settings.password.changed"));
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> {t("settings.password.title")}
        </CardTitle>
        <CardDescription>
          {source === "env"
            ? t("settings.password.envManaged")
            : t("settings.password.description")}
        </CardDescription>
      </CardHeader>
      {source !== "env" && (
        <CardContent>
          <form ref={formRef} action={action} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                name="current"
                type="password"
                autoComplete="current-password"
                placeholder={t("settings.password.current")}
                aria-label={t("settings.password.current")}
                required
              />
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={t("settings.password.new")}
                aria-label={t("settings.password.new")}
                required
              />
              <Input
                name="confirm"
                type="password"
                autoComplete="new-password"
                placeholder={t("settings.password.confirm")}
                aria-label={t("settings.password.confirm")}
                required
              />
            </div>
            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {formErrorMessage(t, state.error)}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("settings.password.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
