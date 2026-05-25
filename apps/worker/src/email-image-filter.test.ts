import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readImageDimensionsFromBuffer,
  shouldSkipEmailImage,
} from "./email-image-filter.js";

function minimalPngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("readImageDimensionsFromBuffer", () => {
  it("reads PNG IHDR dimensions", () => {
    const dims = readImageDimensionsFromBuffer(minimalPngBuffer(48, 48));
    assert.deepEqual(dims, { width: 48, height: 48 });
  });

  it("reads wide banner PNG dimensions", () => {
    const dims = readImageDimensionsFromBuffer(minimalPngBuffer(600, 200));
    assert.deepEqual(dims, { width: 600, height: 200 });
  });
});

describe("shouldSkipEmailImage", () => {
  it("skips social icon URLs", () => {
    assert.equal(
      shouldSkipEmailImage({ url: "https://cdn.example.com/icons/facebook.png" }),
      true,
    );
    assert.equal(
      shouldSkipEmailImage({ url: "https://apps.apple.com/app/id123/badge.png" }),
      true,
    );
  });

  it("skips generic filenames", () => {
    assert.equal(shouldSkipEmailImage({ filename: "app-store-badge.png" }), true);
    assert.equal(shouldSkipEmailImage({ filename: "footer-social-icon.jpg" }), true);
  });

  it("keeps promo URLs and filenames", () => {
    assert.equal(
      shouldSkipEmailImage({ url: "https://cdn.zulacasino.com/promo/hero-banner.jpg" }),
      false,
    );
    assert.equal(shouldSkipEmailImage({ filename: "hero-promo-spring.jpg" }), false);
  });

  it("skips small square icon payloads", () => {
    const b64 = minimalPngBuffer(48, 48).toString("base64");
    assert.equal(shouldSkipEmailImage({ dataBase64: b64 }), true);
  });

  it("keeps large banner payloads", () => {
    const b64 = minimalPngBuffer(600, 200).toString("base64");
    assert.equal(shouldSkipEmailImage({ dataBase64: b64 }), false);
  });
});
