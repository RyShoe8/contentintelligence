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

export function EmailImageGallery({
  images,
  variant = "detail",
}: {
  images: EmailImage[];
  variant?: "feed" | "detail";
}) {
  if (!images?.length) return null;

  const isFeed = variant === "feed";

  return (
    <div
      className={
        isFeed
          ? "flex flex-wrap gap-2"
          : "mt-2 flex flex-wrap gap-3 border-t border-[var(--border)] pt-3"
      }
    >
      {images.map((img, i) => {
        const ext = extForMime(img.mime);
        const name = img.filename?.replace(/[^\w.\-]+/g, "_") || `attachment-${i + 1}.${ext}`;
        const href = `data:${img.mime};base64,${img.data_base64}`;
        return (
          <div key={i} className={isFeed ? "flex max-w-[5.5rem] flex-col gap-1" : "flex max-w-[10rem] flex-col gap-1"}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full size"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={href}
                alt=""
                className={
                  isFeed
                    ? "h-16 w-full cursor-pointer rounded border border-[var(--border)] bg-[var(--card)] object-contain transition-opacity hover:opacity-90"
                    : "h-20 w-full cursor-pointer rounded border border-[var(--border)] object-contain transition-opacity hover:opacity-90"
                }
              />
            </a>
            <a
              download={name}
              href={href}
              className="truncate text-center text-xs text-[var(--primary)] hover:underline"
            >
              Download
            </a>
          </div>
        );
      })}
    </div>
  );
}
