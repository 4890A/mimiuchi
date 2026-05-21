"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { likes, trackProgress } from "./db/schema";

export async function toggleLike(trackId: number): Promise<{ liked: boolean }> {
  const existing = db.select().from(likes).where(eq(likes.trackId, trackId)).get();
  if (existing) {
    db.delete(likes).where(eq(likes.trackId, trackId)).run();
    revalidatePath("/liked");
    return { liked: false };
  }
  db.insert(likes).values({ trackId }).run();
  revalidatePath("/liked");
  return { liked: true };
}

export async function saveProgress(
  trackId: number,
  positionSeconds: number,
  completed = false,
): Promise<void> {
  db.insert(trackProgress)
    .values({ trackId, positionSeconds, completed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: trackProgress.trackId,
      set: {
        positionSeconds,
        completed,
        updatedAt: new Date(),
      },
    })
    .run();
}
