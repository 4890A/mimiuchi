import Link from "next/link";
import { Heart } from "lucide-react";
import { listLikedTracks } from "@/lib/db/queries";
import { coverSrc } from "@/lib/cover";
import { LikedTrackList } from "./_liked-list";

export const dynamic = "force-dynamic";

export default async function LikedPage() {
  const tracks = await Promise.resolve(listLikedTracks());

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-500/5 ring-1 ring-red-500/30">
          <Heart className="h-6 w-6 fill-red-500 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Liked tracks</h1>
          <p className="text-sm text-muted-foreground">{tracks.length} tracks</p>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Tap the heart icon on any track to add it here.
          </p>
        </div>
      ) : (
        <LikedTrackList
          tracks={tracks.map((t) => ({
            id: t.trackId,
            title: t.title,
            workId: t.workId,
            workTitle: t.workTitle,
            cover: coverSrc({
              id: t.workId,
              coverUrl: t.coverUrl,
              coverPath: t.coverPath,
              hasLocalCover: Boolean(t.coverPath),
            }),
            circleName: t.circleName,
            durationSeconds: t.durationSeconds,
          }))}
        />
      )}
    </div>
  );
}
