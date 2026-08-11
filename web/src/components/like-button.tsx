"use client";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleLike } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export function LikeButton({
  trackId,
  initialLiked,
  size = "icon",
}: {
  trackId: number;
  initialLiked: boolean;
  size?: "icon" | "sm";
}) {
  const { t } = useTranslations();
  const [liked, setLiked] = useState(initialLiked);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={liked ? t("track.unlike") : t("track.like")}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !liked;
        setLiked(next);
        startTransition(async () => {
          const r = await toggleLike(trackId);
          setLiked(r.liked);
        });
      }}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          liked ? "fill-red-500 text-red-500" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
