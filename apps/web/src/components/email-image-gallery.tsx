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

const FEED_MAX_VISIBLE = 4;

export function EmailImageGallery({
  images,
  variant = "detail",
}: {
  images: EmailImage[];
  variant?: "feed" | "detail";
}) {
  if (!images?.length) return null;

  const visible = variant === "feed" ? images.slice(0, FEED_MAX_VISIBLE) : images;
  const extra = variant === "feed" && images.length > FEED_MAX_VISIBLE ? images.length - FEED_MAX_VISIBLE : 0;

  return (
    <div className={variant === "detail" ? "mt-2 flex flex-wrap gap-3 border-t border-[var(--border)] pt-3" : "flex flex-wrap gap-2"}>
      {visible.map((img, i) => {
        const ext = extForMime(img.mime);
        const name = img.filename?.replace(/[^\w.\-]+/g, "_") || `attachment-${i + 1}.${ext}`;
        const href = `data:${img.mime};base64,${img.data_base64}`;
        return (
          <div key={i} className="flex max-w-[5.5rem] flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={href}
              alt=""
              className="h-16 w-full rounded border border-[var(--border)] bg-[var(--card)] object-contain"
            />
            {variant === "detail" ? (
              <a
                download={name}
                href={href}
                className="truncate text-center text-xs text-[var(--primary)] hover:underline"
              >
                Download
              </a>
            ) : null}
          </div>
        );
      })}
      {extra > 0 ? (
        <p className="self-center text-xs text-[var(--muted)]">+{extra} more</p>
      ) : null}
    </div>
  );
}
