import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpenAiImageGenerateParams,
  isDalleImageModel,
  isGptImageModel,
} from "./openai-image-generate.js";

describe("openai image generate params", () => {
  it("detects GPT image models", () => {
    assert.equal(isGptImageModel("gpt-image-1"), true);
    assert.equal(isGptImageModel("gpt-image-1.5"), true);
    assert.equal(isDalleImageModel("dall-e-3"), true);
    assert.equal(isGptImageModel("dall-e-3"), false);
  });

  it("requests jpeg with compression for gpt-image models", () => {
    const params = buildOpenAiImageGenerateParams("gpt-image-1", "A red fox");
    assert.equal(params.output_format, "jpeg");
    assert.equal(params.output_compression, 75);
    assert.equal("response_format" in params, false);
  });

  it("does not pass response_format for dall-e-3 (defaults to url)", () => {
    const params = buildOpenAiImageGenerateParams("dall-e-3", "A red fox");
    assert.equal("response_format" in params, false);
    assert.equal("output_format" in params, false);
  });
});
