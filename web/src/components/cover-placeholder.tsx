import { Music4 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stands in for a cover a work does not have.
 *
 * Fills the same box an `<img>` would, so it drops into any of the cover slots
 * without disturbing the layout around it. Decorative: every one of those slots
 * already sits inside a link labelled with the work's title.
 */
export function CoverPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-muted to-muted/40",
        className,
      )}
    >
      <Music4 className="h-1/3 max-h-12 w-1/3 max-w-12 text-muted-foreground/40" />
    </div>
  );
}
