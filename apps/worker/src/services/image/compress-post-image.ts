import sharp from "sharp";

export type CompressedPostImage = {
  mime: "image/jpeg" | "image/webp";
  data_base64: string;
};

export type CompressPostImageOpts = {
  maxB64Chars: number;
  maxDimension?: number;
  minJpegQuality?: number;
};

const DEFAULT_QUALITIES: number[] = [85, 70, 55, 40];

async function encodeJpeg(
  pipeline: sharp.Sharp,
  quality: number,
): Promise<{ buf: Buffer; b64: string }> {
  const buf = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  return { buf, b64: buf.toString("base64") };
}

async function encodeWebp(
  pipeline: sharp.Sharp,
  quality: number,
): Promise<{ buf: Buffer; b64: string }> {
  const buf = await pipeline.webp({ quality }).toBuffer();
  return { buf, b64: buf.toString("base64") };
}

async function tryFitUnderLimit(
  input: Buffer,
  maxDimension: number,
  maxB64Chars: number,
  qualities: number[],
): Promise<CompressedPostImage | null> {
  let base = sharp(input, { failOn: "none" }).rotate();

  const meta = await base.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w > maxDimension || h > maxDimension) {
    base = base.resize({
      width: w >= h ? maxDimension : undefined,
      height: h > w ? maxDimension : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  for (const q of qualities) {
    const { b64 } = await encodeJpeg(base.clone(), q);
    if (b64.length <= maxB64Chars) {
      return { mime: "image/jpeg", data_base64: b64 };
    }
  }

  return null;
}

/** Resize and re-encode until base64 fits Mongo storage cap. */
export async function compressImageForPost(
  input: Buffer,
  opts: CompressPostImageOpts,
): Promise<CompressedPostImage> {
  const maxB64Chars = opts.maxB64Chars;
  const maxDimension = opts.maxDimension ?? 1024;
  const minQ = opts.minJpegQuality ?? 40;
  let qualities = DEFAULT_QUALITIES.filter((q) => q >= minQ);
  if (!qualities.length) qualities = [minQ];

  let result = await tryFitUnderLimit(input, maxDimension, maxB64Chars, qualities);
  if (result) return result;

  result = await tryFitUnderLimit(input, 768, maxB64Chars, qualities);
  if (result) return result;

  let base = sharp(input, { failOn: "none" }).rotate().resize(768, 768, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const webp = await encodeWebp(base, 75);
  if (webp.b64.length <= maxB64Chars) {
    return { mime: "image/webp", data_base64: webp.b64 };
  }

  const webpLow = await encodeWebp(base, 50);
  if (webpLow.b64.length <= maxB64Chars) {
    return { mime: "image/webp", data_base64: webpLow.b64 };
  }

  throw new Error("image_too_large");
}
