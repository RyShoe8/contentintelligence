import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preprocessResearchBriefForVoice } from "./compose-voice-brief.js";

describe("preprocessResearchBriefForVoice", () => {
  it("returns original brief when empty", async () => {
    const result = await preprocessResearchBriefForVoice({
      voice: { persona_status: "ready" } as never,
      topic: "Senior living design",
      researchBrief: "",
    });
    assert.equal(result, "");
  });

  it("returns original brief when openai not configured", async () => {
    const brief = "Key facts\n- Fact one\n- Fact two";
    const result = await preprocessResearchBriefForVoice({
      voice: { persona_status: "ready" } as never,
      topic: "Senior living design",
      researchBrief: brief,
    });
    assert.equal(result, brief);
  });
});
