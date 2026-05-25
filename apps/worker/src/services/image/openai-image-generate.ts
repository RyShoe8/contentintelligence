import type OpenAI from "openai";
import { env } from "../../env.js";

export function isDalleImageModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith("dall-e-2") || m.startsWith("dall-e-3");
}

export function isGptImageModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith("gpt-image");
}

/**
 * Build Images API params. `response_format` is only valid for dall-e-2/3;
 * GPT image models (gpt-image-1, etc.) reject it and return base64 by default.
 */
export function buildOpenAiImageGenerateParams(
  model: string,
  prompt: string,
): OpenAI.Images.ImageGenerateParams {
  const normalized = model.trim();
  const params: OpenAI.Images.ImageGenerateParams = {
    model: normalized,
    prompt: prompt.slice(0, 3800),
    n: 1,
    size: "1024x1024",
  };

  if (isGptImageModel(normalized)) {
    params.output_format = "jpeg";
    params.output_compression = Math.max(
      0,
      Math.min(100, Math.round(env.postImageJpegQuality)),
    );
  }

  return params;
}
