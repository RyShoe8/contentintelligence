import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCasinoName, parseEmailFrom, casinoNameFromDomain } from "./email-from.js";

describe("parseEmailFrom", () => {
  it("parses display name and email from angle brackets", () => {
    const r = parseEmailFrom("Zula Casino <marketing@zulacasino.com>");
    assert.equal(r.displayName, "Zula Casino");
    assert.equal(r.email, "marketing@zulacasino.com");
  });

  it("parses email-only From", () => {
    const r = parseEmailFrom("support@jackpota.com");
    assert.equal(r.displayName, null);
    assert.equal(r.email, "support@jackpota.com");
  });
});

describe("casinoNameFromDomain", () => {
  it("derives Zula Casino from zulacasino.com", () => {
    assert.equal(casinoNameFromDomain("x@zulacasino.com"), "Zula Casino");
  });

  it("derives Jackpota from jackpota.com", () => {
    assert.equal(casinoNameFromDomain("support@m.jackpota.com"), "Jackpota");
  });
});

describe("extractCasinoName", () => {
  it("prefers display name from From header", () => {
    assert.equal(
      extractCasinoName("Zula Casino <marketing@zulacasino.com>"),
      "Zula Casino",
    );
  });

  it("falls back to domain when From is generic", () => {
    assert.equal(
      extractCasinoName("marketing <promo@nolimitcoins.com>", "Weekly bonus"),
      "Nolimitcoins",
    );
  });

  it("skips noreply-only display names and uses domain", () => {
    const name = extractCasinoName("noreply <noreply@goldenheartsgames.com>");
    assert.ok(name && name.length > 0);
    assert.notEqual(name.toLowerCase(), "noreply");
  });
});
