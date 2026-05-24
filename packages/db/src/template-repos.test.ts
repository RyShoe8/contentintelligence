import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentSignalToTemplatePayload } from "./template-repos.js";
import type { ContentSignal } from "./schemas.js";

const baseSignal: ContentSignal = {
  id: "11111111-1111-1111-1111-111111111111",
  organization_id: "22222222-2222-2222-2222-222222222222",
  name: "Casinos",
  description: "Promo mail",
  keywords: ["bonus", "cosmic"],
  lookback_window_hours: 72,
  deal_unit_tokens: ["SC", "GC"],
  active: true,
  post_min_deal_pct: 40,
  ingest_interval_minutes: 60,
  created_at: new Date("2026-05-01T00:00:00Z"),
  updated_at: new Date("2026-05-01T00:00:00Z"),
};

describe("contentSignalToTemplatePayload", () => {
  it("maps signal config fields without ingest state", () => {
    const payload = contentSignalToTemplatePayload(
      baseSignal,
      "Casinos starter",
      "user@example.com",
    );
    assert.equal(payload.name, "Casinos starter");
    assert.equal(payload.description, "Promo mail");
    assert.deepEqual(payload.keywords, ["bonus", "cosmic"]);
    assert.equal(payload.lookback_window_hours, 72);
    assert.deepEqual(payload.deal_unit_tokens, ["SC", "GC"]);
    assert.equal(payload.active, true);
    assert.equal(payload.post_min_deal_pct, 40);
    assert.equal(payload.ingest_interval_minutes, 60);
  });

  it("trims template name", () => {
    const payload = contentSignalToTemplatePayload(baseSignal, "  My template  ", "user@example.com");
    assert.equal(payload.name, "My template");
  });
});
