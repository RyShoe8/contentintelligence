import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError, z } from "zod";
import { formatJobErrorMessage } from "./format-job-error.js";

describe("formatJobErrorMessage", () => {
  it("formats ZodError with path and message", () => {
    const err = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "null",
        path: ["compose_style_kit", "rhythmSample"],
        message: "Expected string, received null",
      },
    ]);
    assert.match(formatJobErrorMessage(err), /compose_style_kit\.rhythmSample/);
    assert.match(formatJobErrorMessage(err), /Expected string, received null/);
  });

  it("passes through Error message", () => {
    assert.equal(formatJobErrorMessage(new Error("persona_generation_timeout")), "persona_generation_timeout");
  });
});
