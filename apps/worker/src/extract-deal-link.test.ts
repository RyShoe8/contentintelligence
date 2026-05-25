import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNonDealUrl, sanitizeDealUrl } from "@content-resourcer/db";
import { isNonDealUrl as isNonDealUrlWorker, pickDealLink, stripXmlnsFromHtml } from "./extract-deal-link.js";

describe("sanitizeDealUrl", () => {
  it("returns null for xhtml namespace URLs", () => {
    assert.equal(sanitizeDealUrl("http://www.w3.org/1999/xhtml"), null);
    assert.equal(sanitizeDealUrl("https://casino.example.com/play"), "https://casino.example.com/play");
  });
});

describe("isNonDealUrl", () => {
  it("rejects XHTML namespace URLs", () => {
    assert.equal(isNonDealUrl("http://www.w3.org/1999/xhtml"), true);
    assert.equal(isNonDealUrl("https://www.w3.org/1999/xhtml"), true);
    assert.equal(isNonDealUrlWorker("http://www.w3.org/1999/xhtml"), true);
  });

  it("rejects font and css asset URLs", () => {
    assert.equal(
      isNonDealUrl(
        "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100&display=swap",
      ),
      true,
    );
    assert.equal(isNonDealUrl("https://fonts.gstatic.com/s/roboto/v30/font.woff2"), true);
  });

  it("rejects image and email asset URLs", () => {
    assert.equal(
      isNonDealUrl(
        "https://fun.goldenheartsgames.com/assets/responsysimages/content/goldenhea/GHG-AmericanRiches_FREESPINS_Email_600W.png",
      ),
      true,
    );
    assert.equal(isNonDealUrl("https://cdn.example.com/promo/banner.jpg"), true);
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

  it("returns null when fallback links have no promo signal", () => {
    const links = [
      "https://example.com/unsubscribe",
      "https://example.com/about",
    ];
    assert.equal(pickDealLink(links), null);
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

  it("prefers brand CTA over Google Fonts link (NolimitCoins pattern)", () => {
    const html = `
      <link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet">
      <a href="https://www.nolimitcoins.com/lucky-wheel">Tap the button</a>
    `;
    const links = [
      "https://fonts.googleapis.com/css2?family=Roboto&display=swap",
      "https://www.nolimitcoins.com/lucky-wheel",
    ];
    assert.equal(
      pickDealLink(links, {
        html,
        subject: "Lucky Wheel Just Refreshed",
        from: "NolimitCoins <support@nolimitcoins.com>",
      }),
      "https://www.nolimitcoins.com/lucky-wheel",
    );
  });

  it("prefers PLAY NOW anchor over PNG asset (Golden Hearts pattern)", () => {
    const html = `
      <img src="https://fun.goldenheartsgames.com/assets/responsysimages/content/goldenhea/GHG-AmericanRiches_FREESPINS_Email_600W.png">
      <a href="https://fun.goldenheartsgames.com/play/american-riches">PLAY NOW!</a>
    `;
    const links = [
      "https://fun.goldenheartsgames.com/assets/responsysimages/content/goldenhea/GHG-AmericanRiches_FREESPINS_Email_600W.png",
      "https://fun.goldenheartsgames.com/play/american-riches",
    ];
    assert.equal(
      pickDealLink(links, {
        html,
        subject: "Your Free Spins are ready to roll!",
        from: "Golden Hearts Games <playerrelations@fun.goldenheartsgames.com>",
      }),
      "https://fun.goldenheartsgames.com/play/american-riches",
    );
  });

  it("prefers brand Spin Now CTA over Exponea tracker (Jackpota pattern)", () => {
    const exponea =
      "https://cdn.uk.exponea.com/jackpota/e/.eJwTUsg2XsAl2bFbN3dz/click";
    const brand = "https://www.jackpota.com/tournaments/all-american-gold";
    const html = `
      <a href="${exponea}">Join Now!</a>
      <a href="${brand}">Spin Now</a>
    `;
    assert.equal(
      pickDealLink([exponea, brand], {
        html,
        subject: "All American Gold Tournament is HERE!",
        from: "Jackpota <support@m.jackpota.com>",
      }),
      brand,
    );
  });

  it("returns null when only fonts and png links remain", () => {
    const links = [
      "https://fonts.googleapis.com/css2?family=Roboto&display=swap",
      "https://fun.goldenheartsgames.com/assets/responsysimages/content/goldenhea/GHG.png",
    ];
    assert.equal(pickDealLink(links), null);
  });

  it("returns null for xmlns-only HTML with no real anchors", () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>Promo text only</body></html>`;
    assert.equal(pickDealLink([], { html }), null);
    assert.equal(
      pickDealLink(["http://www.w3.org/1999/xhtml"], { html }),
      null,
    );
  });

  it("stripXmlnsFromHtml removes xmlns attributes", () => {
    const html = '<html xmlns="http://www.w3.org/1999/xhtml"><a href="https://casino.example.com/play">Play</a></html>';
    const stripped = stripXmlnsFromHtml(html);
    assert.doesNotMatch(stripped, /xmlns/i);
    assert.equal(
      pickDealLink([], { html: stripped }),
      "https://casino.example.com/play",
    );
  });

  it("uses Exponea tracker when it is the only promo CTA", () => {
    const exponea =
      "https://cdn.uk.exponea.com/jackpota/e/.eJwTUsg2XsAl2bFbN3dz/click";
    const html = `<a href="${exponea}">Spin Now</a>`;
    assert.equal(
      pickDealLink([exponea], {
        html,
        subject: "All American Gold Tournament is HERE!",
        from: "Jackpota <support@m.jackpota.com>",
      }),
      exponea,
    );
  });
});
