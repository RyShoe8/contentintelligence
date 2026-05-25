import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { compressImageForPost } from "./compress-post-image.js";

describe("compressImageForPost", () => {
  it("compresses a large PNG under the base64 cap", async () => {
    const width = 1024;
    const height = 1024;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (i >> 8)) % 256;

    const largePng = await sharp(raw, { raw: { width, height, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const result = await compressImageForPost(largePng, {
      maxB64Chars: 400_000,
      maxDimension: 1024,
    });

    assert.ok(result.data_base64.length <= 400_000);
    assert.ok(result.data_base64.length > 1000);
    assert.ok(["image/jpeg", "image/webp"].includes(result.mime));
  });
});
