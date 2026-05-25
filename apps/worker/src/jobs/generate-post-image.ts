import type { Db } from "mongodb";
import {
  findVoiceForContentSignal,
  getPost,
  updatePostImage,
  type GeneratedPostImage,
} from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "../env.js";
import { compressImageForPost } from "../services/image/compress-post-image.js";
import { buildOpenAiImageGenerateParams } from "../services/image/openai-image-generate.js";
import { buildImagePrompt } from "../services/prompt-builder/build-image-prompt.js";
import { fallbackVisualPersonality } from "../services/visual-analysis/extract-visual-personality.js";

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`image_download_failed:${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > env.postImageMaxDownloadBytes) {
    throw new Error("image_download_too_large");
  }
  return buf;
}

export async function runGeneratePostImage(
  db: Db,
  postId: string,
  organizationId: string,
): Promise<{ post_id: string; image_status: string }> {
  const post = await getPost(db, postId);
  if (!post || post.organization_id !== organizationId) {
    throw new Error("post_not_found");
  }

  await updatePostImage(db, postId, organizationId, {
    image_status: "pending",
    image_error: undefined,
  });

  try {
    const voice = await findVoiceForContentSignal(db, post.content_signal_id);
    if (!voice?.brand_profile) {
      throw new Error("voice_brand_profile_required");
    }

    const profile = voice.brand_profile;
    if (!profile.visualPersonality.visualTone) {
      profile.visualPersonality = fallbackVisualPersonality(voice.name);
    }

    const imagePrompt = buildImagePrompt({
      profile,
      post,
      platformCopy: post.social_copy,
    });

    if (!env.openaiApiKey) {
      throw new Error("openai_not_configured");
    }

    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const model = env.openaiImageModel;

    const response = await client.images.generate(
      buildOpenAiImageGenerateParams(model, imagePrompt),
    );

    const item = response.data?.[0];
    let buf: Buffer;
    if (item?.b64_json) {
      buf = Buffer.from(item.b64_json, "base64");
    } else if (item?.url) {
      buf = await downloadImage(item.url);
    } else {
      throw new Error("image_generation_empty");
    }

    const compressed = await compressImageForPost(buf, {
      maxB64Chars: env.postImageMaxB64,
      maxDimension: env.postImageMaxDimension,
    });

    const generated_image: GeneratedPostImage = {
      mime: compressed.mime,
      data_base64: compressed.data_base64,
    };

    await updatePostImage(db, postId, organizationId, {
      image_status: "ready",
      generated_image,
      image_prompt: imagePrompt,
      image_generated_at: new Date(),
      image_error: undefined,
    });

    return { post_id: postId, image_status: "ready" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updatePostImage(db, postId, organizationId, {
      image_status: "failed",
      image_error: message,
    });
    throw e;
  }
}
