import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRssFeed } from "./parse-rss-feed.js";

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Blog</title>
    <item>
      <title>First Post</title>
      <link>https://example.com/first-post</link>
      <guid>guid-1</guid>
      <description>Short summary.</description>
      <content:encoded><![CDATA[<p>Full encoded body with enough text to qualify as article content for style learning purposes in our pipeline.</p>]]></content:encoded>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second-post/</link>
      <guid isPermaLink="false">guid-2</guid>
      <description>Another summary.</description>
    </item>
  </channel>
</rss>`;

describe("parseRssFeed", () => {
  it("extracts link, guid, and encoded HTML from RSS items", () => {
    const items = parseRssFeed(SAMPLE_RSS, 5);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.title, "First Post");
    assert.equal(items[0]?.link, "https://example.com/first-post");
    assert.equal(items[0]?.guid, "guid-1");
    assert.match(items[0]?.encodedHtml ?? "", /<p>Full encoded body/);
    assert.equal(items[1]?.link, "https://example.com/second-post");
  });

  it("skips items without https links", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>X</title><link>http://insecure.example</link></item></channel></rss>`;
    assert.equal(parseRssFeed(xml).length, 0);
  });
});
