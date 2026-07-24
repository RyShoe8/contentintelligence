import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeVoiceProfileRules,
  deriveComposeVoiceProfile,
  detectHeadingStyle,
  detectPerson,
  emptyComposeVoiceProfile,
} from "./compose-voice-profile.js";
import {
  scoreVoiceFidelity,
  voiceFidelityRetryIssues,
  voiceFidelityWarning,
} from "./voice-fidelity.js";

const WE_BRAND_HTML = `
<h2>What we test</h2>
<p>We build every frame in the same workshop we started in twelve years ago.</p>
<p>We never ship a piece that has not sat under load for thirty days.</p>
<h2>Why it matters</h2>
<p>Our customers keep these for decades. That changes what we are willing to sign off on.</p>
<p>We turn down about a third of the commissions we are offered.</p>
`;

const YOU_BRAND_HTML = `
<h2>Understanding the Impact of Modern Workflow Automation on Team Productivity</h2>
<p>You will find that automating your intake process saves considerable time across the week, particularly when your team is handling a high volume of inbound requests that follow predictable patterns and require consistent triage decisions.</p>
<ul><li>Reduce manual triage</li><li>Standardise responses</li></ul>
<h2>Considerations Before You Begin Your Automation Journey</h2>
<p>Your existing tooling will shape what is possible here, so you should audit your current stack before committing to a particular vendor or approach, and you should involve the people who do the work today.</p>
<ul><li>Audit your stack</li><li>Involve your team</li></ul>
`;

describe("detectPerson", () => {
  it("detects first-person plural", () => {
    assert.equal(
      detectPerson(
        "We build things in our own workshop. Our work is our own. We never cut corners, and we do not pretend otherwise when a customer asks us about it.",
      ),
      "first_plural",
    );
  });

  it("detects second person", () => {
    assert.equal(
      detectPerson(
        "You will want to check your settings before you begin your migration. Your existing data stays where it is, so you can roll back if you need to.",
      ),
      "second",
    );
  });

  it("falls back to third person on short or pronoun-free text", () => {
    assert.equal(detectPerson("Short text."), "third");
    assert.equal(
      detectPerson(
        "The report describes a market that expanded steadily through the decade before contracting sharply, and the analysts attribute most of that contraction to a single regulatory change that landed without much warning at all.",
      ),
      "third",
    );
  });
});

describe("detectHeadingStyle", () => {
  it("flags textbook scaffolding headings", () => {
    const result = detectHeadingStyle([
      "Understanding the Basics",
      "Benefits of Automation",
      "Looking Ahead",
    ]);
    assert.equal(result.style, "textbook");
  });

  it("detects punchy headings", () => {
    assert.equal(detectHeadingStyle(["What we test", "Why it matters", "The rule"]).style, "punchy");
  });

  it("detects question headings", () => {
    assert.equal(
      detectHeadingStyle(["Is this worth it?", "How long does it take?", "What breaks first?"]).style,
      "question",
    );
  });

  it("returns descriptive for an empty heading list", () => {
    assert.equal(detectHeadingStyle([]).style, "descriptive");
  });
});

describe("deriveComposeVoiceProfile", () => {
  it("measures a first-person-plural prose brand", () => {
    const profile = deriveComposeVoiceProfile([WE_BRAND_HTML]);
    assert.equal(profile.person, "first_plural");
    assert.equal(profile.sampleCount, 1);
    assert.equal(profile.listShare, 0);
    assert.ok(profile.headingSamples.includes("What we test"));
  });

  it("measures a second-person list-heavy brand differently", () => {
    const profile = deriveComposeVoiceProfile([YOU_BRAND_HTML]);
    assert.equal(profile.person, "second");
    assert.equal(profile.headingStyle, "textbook");
    assert.ok(profile.listShare > 0.3);
    assert.ok(profile.avgParagraphWords > 30);
  });

  it("returns an empty profile for no usable input", () => {
    assert.equal(deriveComposeVoiceProfile([]).sampleCount, 0);
    assert.equal(deriveComposeVoiceProfile(["   "]).sampleCount, 0);
  });
});

describe("composeVoiceProfileRules", () => {
  it("describes the measured brand rather than a fixed house style", () => {
    const weRules = composeVoiceProfileRules(deriveComposeVoiceProfile([WE_BRAND_HTML])).join(" ");
    const youRules = composeVoiceProfileRules(deriveComposeVoiceProfile([YOU_BRAND_HTML])).join(" ");

    assert.ok(weRules.includes("first-person plural"));
    assert.ok(youRules.includes("second person"));
    assert.ok(!youRules.includes("first-person plural"));
  });

  it("tells a prose brand to avoid lists and a list brand to use them", () => {
    const weRules = composeVoiceProfileRules(deriveComposeVoiceProfile([WE_BRAND_HTML])).join(" ");
    const youRules = composeVoiceProfileRules(deriveComposeVoiceProfile([YOU_BRAND_HTML])).join(" ");
    assert.ok(weRules.includes("rarely uses bullet lists"));
    assert.ok(youRules.includes("Bullet lists are common"));
  });

  it("stays brand-neutral with no examples", () => {
    const rules = composeVoiceProfileRules(emptyComposeVoiceProfile()).join(" ");
    assert.ok(!rules.includes("first-person plural"));
    assert.ok(rules.includes("brand examples"));
  });
});

describe("scoreVoiceFidelity", () => {
  it("scores an article against its own source highly", () => {
    const profile = deriveComposeVoiceProfile([WE_BRAND_HTML]);
    const result = scoreVoiceFidelity(WE_BRAND_HTML, profile);
    assert.equal(result.measured, true);
    assert.ok(result.score >= 90, `expected >=90, got ${result.score}`);
    assert.deepEqual(result.issues, []);
  });

  it("scores a mismatched article low and explains why", () => {
    const profile = deriveComposeVoiceProfile([WE_BRAND_HTML]);
    const result = scoreVoiceFidelity(YOU_BRAND_HTML, profile);
    assert.ok(result.score < 70, `expected <70, got ${result.score}`);
    assert.ok(result.issues.some((i) => i.includes("second person")));
  });

  it("reports unmeasured when the voice has no style examples", () => {
    const result = scoreVoiceFidelity(WE_BRAND_HTML, emptyComposeVoiceProfile());
    assert.equal(result.measured, false);
    assert.equal(result.score, 0);
  });

  it("reports unmeasured for an undefined reference", () => {
    assert.equal(scoreVoiceFidelity(WE_BRAND_HTML, undefined).measured, false);
  });
});

describe("voiceFidelityRetryIssues", () => {
  it("returns nothing when the score clears the floor", () => {
    const profile = deriveComposeVoiceProfile([WE_BRAND_HTML]);
    const result = scoreVoiceFidelity(WE_BRAND_HTML, profile);
    assert.deepEqual(voiceFidelityRetryIssues(result, 55), []);
  });

  it("returns targeted issues when below the floor", () => {
    const profile = deriveComposeVoiceProfile([WE_BRAND_HTML]);
    const result = scoreVoiceFidelity(YOU_BRAND_HTML, profile);
    const issues = voiceFidelityRetryIssues(result, 80);
    assert.ok(issues.length > 0);
    assert.ok(issues.length <= 5);
  });

  it("stays silent for unmeasured voices", () => {
    const result = scoreVoiceFidelity(WE_BRAND_HTML, emptyComposeVoiceProfile());
    assert.deepEqual(voiceFidelityRetryIssues(result, 90), []);
  });
});

describe("voiceFidelityWarning", () => {
  it("warns below the threshold and stays quiet above it", () => {
    const profile = deriveComposeVoiceProfile([WE_BRAND_HTML]);
    const bad = scoreVoiceFidelity(YOU_BRAND_HTML, profile);
    const good = scoreVoiceFidelity(WE_BRAND_HTML, profile);
    assert.ok(voiceFidelityWarning(bad, 80)?.includes("below the 80 threshold"));
    assert.equal(voiceFidelityWarning(good, 55), undefined);
  });
});
