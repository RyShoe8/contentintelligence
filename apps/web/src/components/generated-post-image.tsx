import type { GeneratedPostImage } from "@content-resourcer/db";

export function GeneratedPostImageDisplay({ image }: { image: GeneratedPostImage }) {
  const href = `data:${image.mime};base64,${image.data_base64}`;
  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <p className="mb-2 text-xs font-medium text-[var(--muted)]">Generated brand image</p>
      <a href={href} target="_blank" rel="noopener noreferrer" title="Open full size" className="block max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt="Generated brand image"
          className="w-full cursor-pointer rounded border border-[var(--border)] object-contain transition-opacity hover:opacity-90"
        />
      </a>
    </div>
  );
}
