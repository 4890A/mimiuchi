import { TopNav } from "@/components/top-nav";
import { PlayerProvider } from "@/components/player/player-store";
import { PlayerBar } from "@/components/player/player-bar";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <PlayerProvider>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="flex-1">{children}</main>
          <PlayerBar />
        </div>
      </PlayerProvider>
    </LocaleProvider>
  );
}
