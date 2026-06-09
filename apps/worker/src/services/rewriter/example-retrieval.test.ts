import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(moduleDir, "example-retrieval.ts"), "utf8");

describe("example-retrieval firewall", () => {
  it("loads only saved Writer articles, not Feed posts", () => {
    assert.match(source, /listSavedWriterExamplesForVoice/);
    assert.doesNotMatch(source, /listPostsForVoice/);
    assert.doesNotMatch(source, /primarySocialCopy/);
    assert.doesNotMatch(source, /content_signal_ids/);
  });
});
