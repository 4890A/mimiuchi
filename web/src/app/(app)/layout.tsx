import { TopNav } from "@/components/top-nav";
import { PlayerProvider } from "@/components/player/player-store";
import { PlayerBar } from "@/components/player/player-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
        <PlayerBar />
      </div>
    </PlayerProvider>
  );
}
