"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Library, RefreshCw, Mic2, RotateCw, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NsfwBlurToggle } from "@/components/nsfw-blur-toggle";
import { SearchBar } from "@/components/search-bar";
import { cn } from "@/lib/utils";
import { useScanProgress } from "@/components/scan-progress";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function TopNav() {
  const pathname = usePathname();
  const scan = useScanProgress();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-gradient-to-br from-primary to-primary/50 bg-clip-text text-lg text-transparent">
            耳打ち
          </span>
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          <NavLink href="/" active={pathname === "/"} icon={<Library className="h-4 w-4" />}>
            Library
          </NavLink>
          <NavLink href="/liked" active={pathname === "/liked"} icon={<Heart className="h-4 w-4" />}>
            Liked
          </NavLink>
          <NavLink href="/seiyuu" active={pathname.startsWith("/seiyuu")} icon={<Mic2 className="h-4 w-4" />}>
            Seiyuu
          </NavLink>
          <NavLink href="/circles" active={pathname.startsWith("/circles")} icon={<Users className="h-4 w-4" />}>
            Circles
          </NavLink>
        </nav>
        <SearchBar />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                disabled={scan.busy}
                aria-label="Scan library"
                title="Scan library"
              />
            }
          >
            <RefreshCw className={cn("h-5 w-5", scan.busy && "animate-spin")} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[18rem]">
            <DropdownMenuItem
              onClick={() => scan.start({ kind: "library" })}
              className="whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4" />
              Scan library
              <span className="ml-auto pl-4 text-xs text-muted-foreground">incremental</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => scan.start({ kind: "library", force: true })}
              className="whitespace-nowrap"
            >
              <RotateCw className="h-4 w-4" />
              Force full rescan
              <span className="ml-auto pl-4 text-xs text-muted-foreground">re-fetch all metadata</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => scan.start({ kind: "durations" })}
              className="whitespace-nowrap"
            >
              <Timer className="h-4 w-4" />
              Scan track durations
              <span className="ml-auto pl-4 text-xs text-muted-foreground">missing only</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => scan.start({ kind: "durations", all: true })}
              className="whitespace-nowrap"
            >
              <Timer className="h-4 w-4" />
              Re-scan all durations
              <span className="ml-auto pl-4 text-xs text-muted-foreground">every track</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <NsfwBlurToggle />
        <ThemeToggle />
      </div>
      {scan.panel}
      <nav className="flex items-center gap-1 border-t px-3 py-1.5 sm:hidden">
        <NavLink href="/" active={pathname === "/"} icon={<Library className="h-4 w-4" />} compact>
          Library
        </NavLink>
        <NavLink href="/liked" active={pathname === "/liked"} icon={<Heart className="h-4 w-4" />} compact>
          Liked
        </NavLink>
        <NavLink href="/seiyuu" active={pathname.startsWith("/seiyuu")} icon={<Mic2 className="h-4 w-4" />} compact>
          Seiyuu
        </NavLink>
        <NavLink href="/circles" active={pathname.startsWith("/circles")} icon={<Users className="h-4 w-4" />} compact>
          Circles
        </NavLink>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  active,
  icon,
  compact,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        compact && "px-2 py-1 text-xs",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
