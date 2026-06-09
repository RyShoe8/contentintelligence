import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractMainContentHtml,
  resolveArticleHtmlFromRssItem,
} from "./extract-article-html.js";
import type { RssFeedItem } from "./parse-rss-feed.js";

describe("extract-article-html", () => {
  it("prefers encoded HTML from the feed item", async () => {
    const item: RssFeedItem = {
      title: "Encoded",
      link: "https://example.com/post",
      guid: "1",
      encodedHtml: "<p>" + "Encoded article body. ".repeat(20) + "</p>",
      summaryText: "short",
    };
    const html = await resolveArticleHtmlFromRssItem(item, async () => null, 50_000);
    assert.match(html ?? "", /Encoded article body/);
  });

  it("extracts main content from fetched page HTML", async () => {
    const item: RssFeedItem = {
      title: "Fetched",
      link: "https://example.com/post",
      guid: "2",
      summaryText: "short",
    };
    const page = `<html><body><nav>Menu</nav><article><p>${"Fetched article text. ".repeat(20)}</p></article></body></html>`;
    const html = await resolveArticleHtmlFromRssItem(item, async () => page, 50_000);
    assert.match(html ?? "", /Fetched article text/);
    assert.doesNotMatch(html ?? "", /Menu/);
  });

  it("returns null when content is too short", async () => {
    const item: RssFeedItem = {
      title: "Tiny",
      link: "https://example.com/tiny",
      guid: "3",
      summaryText: "tiny",
    };
    const html = await resolveArticleHtmlFromRssItem(item, async () => "<html><body><p>Hi</p></body></html>", 50_000);
    assert.equal(html, null);
  });

  it("extractMainContentHtml prefers article tag", () => {
    const html = extractMainContentHtml(
      "<html><body><div>sidebar</div><article><p>Main copy here.</p></article></body></html>",
    );
    assert.match(html, /Main copy here/);
    assert.doesNotMatch(html, /sidebar/);
  });
});
