import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceLlmString } from "./coerce-llm-field.js";

describe("coerceLlmString", () => {
  it("trims strings", () => {
    assert.equal(coerceLlmString("  hello  "), "hello");
  });

  it("joins string arrays with semicolons", () => {
    assert.equal(coerceLlmString(["sans", "bold"]), "sans; bold");
  });

  it("coerces numbers and booleans", () => {
    assert.equal(coerceLlmString(42), "42");
    assert.equal(coerceLlmString(true), "true");
  });

  it("returns empty for nullish and objects", () => {
    assert.equal(coerceLlmString(null), "");
    assert.equal(coerceLlmString(undefined), "");
    assert.equal(coerceLlmString({}), "");
  });
});
