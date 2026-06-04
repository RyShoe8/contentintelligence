import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearVoicePersonaGenerateInFlight,
  isVoicePersonaGenerateInFlight,
  runVoicePersonaGenerateExclusive,
} from "./voice-generate-lock.js";

describe("runVoicePersonaGenerateExclusive", () => {
  it("allows concurrent jobs for different voice ids", async () => {
    clearVoicePersonaGenerateInFlight();
    const order: string[] = [];
    const a = runVoicePersonaGenerateExclusive("voice-a", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("a-end");
    });
    const b = runVoicePersonaGenerateExclusive("voice-b", async () => {
      order.push("b-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("b-end");
    });
    await Promise.all([a, b]);
    assert.deepEqual(order, ["a-start", "b-start", "b-end", "a-end"]);
    assert.equal(isVoicePersonaGenerateInFlight("voice-a"), false);
    assert.equal(isVoicePersonaGenerateInFlight("voice-b"), false);
  });

  it("rejects duplicate job for same voice id", async () => {
    clearVoicePersonaGenerateInFlight();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const first = runVoicePersonaGenerateExclusive("voice-x", async () => {
      await gate;
    });
    assert.equal(isVoicePersonaGenerateInFlight("voice-x"), true);
    await assert.rejects(
      () =>
        runVoicePersonaGenerateExclusive("voice-x", async () => {
          /* noop */
        }),
      /voice_generate_already_running/,
    );
    release();
    await first;
  });
});
