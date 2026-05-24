import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDealLink } from "./extract-deal-link.js";

describe("pickDealLink", () => {
  it("skips unsubscribe and prefers promo CTA", () => {
    const html = `
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
      <a href="https://casino.example.com/play">Play Now</a>
    `;
    const links = [
      "https://example.com/unsubscribe",
      "https://casino.example.com/play",
    ];
    assert.equal(
      pickDealLink(links, { html, subject: "Claim your bonus" }),
      "https://casino.example.com/play",
    );
  });

  it("falls back to first non-denylisted link", () => {
    const links = [
      "https://example.com/unsubscribe",
      "https://example.com/about",
    ];
    assert.equal(pickDealLink(links), "https://example.com/about");
  });

  it("returns null when all links are denylisted", () => {
    const links = ["https://example.com/unsubscribe", "https://facebook.com/page"];
    assert.equal(pickDealLink(links), null);
  });
});
