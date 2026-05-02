import type { EmailImage } from "@content-resourcer/db";

function extForMime(m: EmailImage["mime"]): string {
  switch (m) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "img";
  }
}

export function EmailImageGallery({ images }: { images: EmailImage[] }) {
  if (!images?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-3 border-t border-[var(--border)] pt-3">
      {images.map((img, i) => {
        const ext = extForMime(img.mime);
        const name = img.filename?.replace(/[^\w.\-]+/g, "_") || `attachment-${i + 1}.${ext}`;
        const href = `data:${img.mime};base64,${img.data_base64}`;
        return (
          <div key={i} className="flex max-w-[10rem] flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={href} alt="" className="h-20 w-full rounded border border-[var(--border)] object-contain" />
            <a
              download={name}
              href={href}
              className="truncate text-center text-xs text-[var(--accent)] hover:underline"
            >
              Download
            </a>
          </div>
        );
      })}
    </div>
  );
}
