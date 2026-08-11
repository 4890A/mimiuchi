export const dynamic = "force-dynamic";

import { loginAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTranslations } from "@/lib/i18n/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error } = await searchParams;
  const { t } = await getTranslations();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">耳打ち</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>
        <form
          action={loginAction}
          className="space-y-4 rounded-xl border bg-card/60 p-6 shadow-sm backdrop-blur"
        >
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t("login.password")}
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{t("login.error")}</p>
          )}
          <Button type="submit" className="w-full">
            {t("login.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
