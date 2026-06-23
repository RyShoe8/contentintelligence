import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listSignalItemsForFeed,
  listSignalItemsForPostSync,
  signalItemFeedExcludeHeavyFieldsStage,
  signalItemFeedSlimStages,
  signalItemFeedTrimImagesStage,
  signalItemPostDisplayStages,
} from "./repos.js";
import { signalItemFeedRowSchema, signalItemPostDisplayRowSchema } from "./schemas.js";

describe("listSignalItemsForPostSync", () => {
  it("reuses the feed slim query", () => {
    assert.equal(listSignalItemsForPostSync, listSignalItemsForFeed);
  });
});

describe("signalItemFeedTrimImagesStage", () => {
  it("trims email_images with $addFields and $map", () => {
    const addFields = signalItemFeedTrimImagesStage.$addFields as Record<string, unknown>;
    const emailImages = addFields.email_images as Record<string, unknown>;
    assert.ok(emailImages.$cond);
    const then = (emailImages.$cond as { then: Record<string, unknown> }).then;
    assert.ok(then.$map);
  });
});

describe("signalItemFeedExcludeHeavyFieldsStage", () => {
  it("excludes only raw_content and email_html_preview", () => {
    const project = signalItemFeedExcludeHeavyFieldsStage.$project as Record<string, unknown>;
    assert.equal(project.raw_content, 0);
    assert.equal(project.email_html_preview, 0);
    assert.equal(Object.keys(project).length, 2);
  });
});

describe("signalItemFeedSlimStages", () => {
  it("runs trim before exclude", () => {
    assert.equal(signalItemFeedSlimStages.length, 2);
    assert.ok("$addFields" in signalItemFeedSlimStages[0]);
    assert.ok("$project" in signalItemFeedSlimStages[1]);
  });
});

describe("signalItemFeedRowSchema", () => {
  it("parses feed rows without raw_content or image base64", () => {
    const row = signalItemFeedRowSchema.parse({
      id: "631fd55f-d944-4b51-8f96-97742f545d3e",
      organization_id: "631fd55f-d944-4b51-8f96-97742f545d3f",
      content_signal_id: "631fd55f-d944-4b51-8f96-97742f545d3a",
      source_id: "631fd55f-d944-4b51-8f96-97742f545d3b",
      source_type: "email_gmail",
      source_name: "Casinos",
      sender_from: "test@example.com",
      title: "Test deal",
      extracted_text: "Preview text",
      detected_keywords: [],
      relevance_score: 8,
      external_id: "gmail:abc",
      created_at: new Date("2026-06-01T00:00:00Z"),
      email_images: [{ mime: "image/png", filename: "deal.png" }],
    });

    assert.equal(row.title, "Test deal");
    assert.equal("raw_content" in row, false);
    assert.equal(row.email_images?.[0]?.mime, "image/png");
    assert.equal("data_base64" in (row.email_images?.[0] ?? {}), false);
  });
});

describe("signalItemPostDisplayStages", () => {
  it("excludes heavy fields only (keeps image base64)", () => {
    assert.equal(signalItemPostDisplayStages.length, 1);
    assert.ok("$project" in signalItemPostDisplayStages[0]);
  });
});

describe("signalItemPostDisplayRowSchema", () => {
  it("parses post display rows with image base64", () => {
    const row = signalItemPostDisplayRowSchema.parse({
      id: "631fd55f-d944-4b51-8f96-97742f545d3e",
      organization_id: "631fd55f-d944-4b51-8f96-97742f545d3f",
      content_signal_id: "631fd55f-d944-4b51-8f96-97742f545d3a",
      source_id: "631fd55f-d944-4b51-8f96-97742f545d3b",
      source_type: "email_gmail",
      source_name: "Casinos",
      sender_from: "test@example.com",
      title: "Test deal",
      extracted_text: "Preview text",
      detected_keywords: [],
      relevance_score: 8,
      external_id: "gmail:abc",
      created_at: new Date("2026-06-01T00:00:00Z"),
      email_images: [
        { mime: "image/png", filename: "deal.png", data_base64: "iVBORw0KGgo=" },
      ],
    });

    assert.equal("raw_content" in row, false);
    assert.equal("email_html_preview" in row, false);
    assert.equal(row.email_images?.[0]?.data_base64, "iVBORw0KGgo=");
  });
});
