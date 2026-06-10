import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIXED_RHYTHM_SAMPLE_PERSONA_MESSAGE,
  formatPersonaErrorForDisplay,
  isFixedRhythmSamplePersonaError,
} from "./persona-error-display.js";

describe("isFixedRhythmSamplePersonaError", () => {
  it("detects rhythmSample null Zod JSON", () => {
    const raw = `[{"code":"invalid_type","expected":"string","received":"null","path":["compose_style_kit","rhythmSample"],"message":"Expected string, received null"}]`;
    assert.equal(isFixedRhythmSamplePersonaError(raw), true);
  });

  it("returns false for unrelated errors", () => {
    assert.equal(isFixedRhythmSamplePersonaError("persona_generation_timeout"), false);
  });
});

describe("formatPersonaErrorForDisplay", () => {
  it("replaces fixed rhythmSample error with friendly message", () => {
    const raw = `[{"code":"invalid_type","path":["compose_style_kit","rhythmSample"],"message":"Expected string, received null"}]`;
    assert.equal(formatPersonaErrorForDisplay(raw), FIXED_RHYTHM_SAMPLE_PERSONA_MESSAGE);
  });

  it("formats other Zod JSON as path and message", () => {
    const raw = `[{"code":"too_small","path":["name"],"message":"String must contain at least 1 character(s)"}]`;
    assert.equal(formatPersonaErrorForDisplay(raw), "name: String must contain at least 1 character(s)");
  });

  it("passes through plain text errors", () => {
    assert.equal(formatPersonaErrorForDisplay("WORKER_URL is not configured"), "WORKER_URL is not configured");
  });
});
