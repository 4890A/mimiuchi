"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { useTranslations } from "@/lib/i18n/client";

/**
 * The work's cover, tappable to see it full size.
 *
 * The thumbnail is cropped to 4:3 by `object-cover`, so a tall or square cover
 * loses its edges on the page — the enlarged view is `object-contain` and shows
 * the whole thing.
 *
 * Not built on `DialogContent`: that is a small padded card, and undoing its
 * background, ring, padding and width would leave nothing of it. The portal and
 * a darker backdrop are reused, and the popup is composed here instead.
 */
export function CoverLightbox({
  src,
  alt,
  nsfw,
}: {
  src: string;
  alt: string;
  nsfw: boolean;
}) {
  const { t } = useTranslations();

  return (
    <Dialog>
      <DialogPrimitive.Trigger
        // Carries the blur toggle's hook. A focused button matches
        // `:focus-within` itself, so keyboard users reveal it the same way a
        // mouse does on hover — and on a phone, where neither fires, opening
        // the lightbox is now the way to see a blurred cover at all.
        data-nsfw-cover={nsfw ? "true" : undefined}
        aria-label={t("work.enlargeCover")}
        className="block w-full cursor-zoom-in overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/20 ring-1 ring-black/5 transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="aspect-[4/3] w-full object-cover" />
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/80 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          {/* The popup fills the screen so the backdrop stays clickable through
              the padding; the image itself must not swallow that click. */}
          <DialogPrimitive.Close
            aria-label={t("common.close")}
            className="absolute inset-0 cursor-zoom-out"
          />
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="pointer-events-none relative max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
          <DialogPrimitive.Close
            aria-label={t("common.close")}
            className="absolute top-3 right-3 rounded-md bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <XIcon className="h-5 w-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
