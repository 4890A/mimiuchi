"use client";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "@/lib/i18n/client";
import { TAG_CHIP_CLASS } from "@/lib/tag-chip";
import { cn } from "@/lib/utils";

export interface MoreTag {
  id: number;
  name: string;
  /** Already carries the current filters — built by the card, server-side. */
  href: string;
}

/**
 * The "+3" closing a card's tag row: opens the tags that did not fit, each one
 * a link that adds it to the filters just like the visible chips do.
 *
 * The counter deliberately mirrors the voice-actor row's overflow one line up,
 * and the popup lays its tags out as the same chips rather than as menu rows,
 * so opening it reads as the row continuing.
 */
export function MoreTags({ tags }: { tags: MoreTag[] }) {
  const { t } = useTranslations();
  if (tags.length === 0) return null;

  const label = t("work.moreTags", { count: tags.length });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className="cursor-pointer self-center text-[10px] text-muted-foreground transition-colors hover:text-foreground data-popup-open:text-foreground"
      >
        +{tags.length}
      </DropdownMenuTrigger>
      {/* The trigger is a couple of characters wide, so drop the anchor-width
          sizing the menu uses by default and let the chips set the width. */}
      <DropdownMenuContent
        align="start"
        className="flex w-auto max-w-56 min-w-0 flex-wrap gap-1 p-2"
      >
        {tags.map((tag) => (
          <DropdownMenuItem
            key={tag.id}
            render={<Link href={tag.href} />}
            className={cn(
              TAG_CHIP_CLASS,
              // Keyboard focus gets the chip's own hover treatment instead of
              // the menu's full-width highlight, which would break the row look.
              "cursor-pointer focus:border-primary/40 focus:bg-transparent focus:text-foreground",
            )}
          >
            {tag.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
