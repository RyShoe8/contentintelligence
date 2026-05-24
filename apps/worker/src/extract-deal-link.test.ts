import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNonDealUrl, pickDealLink } from "./extract-deal-link.js";

describe("isNonDealUrl", () => {
  it("rejects XHTML namespace URLs", () => {
    assert.equal(isNonDealUrl("http://www.w3.org/1999/xhtml"), true);
    assert.equal(isNonDealUrl("https://www.w3.org/1999/xhtml"), true);
  });
});

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

  it("ignores xmlns URL and picks real CTA from HTML", () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml">
      <a href="http://promo.example.com/claim-bonus">Claim your bonus</a>
    </html>`;
    const links = ["http://www.w3.org/1999/xhtml"];
    assert.equal(
      pickDealLink(links, { html, subject: "Claim your bonus" }),
      "http://promo.example.com/claim-bonus",
    );
  });

  it("accepts http-only promo CTA from links array", () => {
    const links = [
      "http://www.w3.org/1999/xhtml",
      "http://casino.example.com/play-now",
    ];
    assert.equal(pickDealLink(links, { subject: "Play now" }), "http://casino.example.com/play-now");
  });

  it("falls back to first non-denylisted https link", () => {
    const links = [
      "https://example.com/unsubscribe",
      "https://example.com/about",
    ];
    assert.equal(pickDealLink(links), "https://example.com/about");
  });

  it("returns null when all links are denylisted or junk", () => {
    const links = [
      "http://www.w3.org/1999/xhtml",
      "https://example.com/unsubscribe",
      "https://facebook.com/page",
    ];
    assert.equal(pickDealLink(links), null);
  });

  it("returns null for namespace-only email", () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>Hello</body></html>`;
    assert.equal(pickDealLink(["http://www.w3.org/1999/xhtml"], { html }), null);
  });
});
