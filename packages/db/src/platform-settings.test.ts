import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPOSE_REWRITE_PASSES_DEFAULT,
  DEFAULT_UTILITY_MODEL,
  DEFAULT_WRITER_MODEL,
  defaultPlatformSettings,
  findModelOption,
  modelOptionsForTier,
  modelSelectionFromSettings,
  platformSettingsSchema,
  platformSettingsUpdateSchema,
  writerModelWarning,
} from "./platform-settings.js";

describe("platformSettingsSchema", () => {
  it("fills defaults from an empty document", () => {
    const settings = defaultPlatformSettings();
    assert.equal(settings.writer_model, DEFAULT_WRITER_MODEL);
    assert.equal(settings.utility_model, DEFAULT_UTILITY_MODEL);
    assert.equal(settings.compose_rewrite_passes, COMPOSE_REWRITE_PASSES_DEFAULT);
  });

  it("coerces null and empty model ids back to defaults", () => {
    const settings = platformSettingsSchema.parse({
      id: "platform",
      writer_model: null,
      utility_model: "",
      research_model: "  gpt-4.1  ",
    });
    assert.equal(settings.writer_model, DEFAULT_WRITER_MODEL);
    assert.equal(settings.utility_model, DEFAULT_UTILITY_MODEL);
    assert.equal(settings.research_model, "gpt-4.1");
  });

  it("accepts model ids outside the catalog so env overrides still parse", () => {
    const settings = platformSettingsSchema.parse({
      id: "platform",
      writer_model: "gpt-6-unreleased",
    });
    assert.equal(settings.writer_model, "gpt-6-unreleased");
  });

  it("clamps rewrite passes to the allowed range", () => {
    assert.equal(
      platformSettingsSchema.safeParse({ id: "platform", compose_rewrite_passes: 99 }).success,
      false,
    );
    assert.equal(
      platformSettingsSchema.parse({ id: "platform", compose_rewrite_passes: 0 })
        .compose_rewrite_passes,
      0,
    );
  });
});

describe("modelSelectionFromSettings", () => {
  it("maps settings onto the three tiers", () => {
    const selection = modelSelectionFromSettings(
      platformSettingsSchema.parse({
        id: "platform",
        writer_model: "gpt-5",
        utility_model: "gpt-4o-mini",
        research_model: "gpt-4.1-mini",
      }),
    );
    assert.deepEqual(selection, {
      writer: "gpt-5",
      utility: "gpt-4o-mini",
      research: "gpt-4.1-mini",
    });
  });
});

describe("model catalog", () => {
  it("offers writer options and excludes the weak prose model from them", () => {
    const writerIds = modelOptionsForTier("writer").map((m) => m.id);
    assert.ok(writerIds.length > 0);
    assert.ok(!writerIds.includes("gpt-4o-mini"));
  });

  it("looks up options by id and trims input", () => {
    assert.equal(findModelOption("  gpt-4.1  ")?.label, "GPT-4.1");
    assert.equal(findModelOption("nope"), undefined);
  });
});

describe("writerModelWarning", () => {
  it("warns for cost-optimised models", () => {
    assert.ok(writerModelWarning("gpt-4o-mini")?.includes("generic"));
  });

  it("stays quiet for capable models", () => {
    assert.equal(writerModelWarning("gpt-4.1"), undefined);
  });
});

describe("platformSettingsUpdateSchema", () => {
  it("allows partial patches", () => {
    const patch = platformSettingsUpdateSchema.parse({ writer_model: "gpt-5" });
    assert.deepEqual(Object.keys(patch), ["writer_model"]);
  });
});
