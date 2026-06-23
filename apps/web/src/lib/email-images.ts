import type { EmailImage, EmailImageMeta } from "@content-resourcer/db/schemas";

type EmailImageLike = EmailImage | EmailImageMeta;

export function emailImagesWithData(images: EmailImageLike[] | undefined): EmailImage[] {
  if (!images?.length) return [];
  const withData: EmailImage[] = [];
  for (const img of images) {
    if ("data_base64" in img && typeof img.data_base64 === "string" && img.data_base64.length > 0) {
      withData.push(img);
    }
  }
  return withData;
}
