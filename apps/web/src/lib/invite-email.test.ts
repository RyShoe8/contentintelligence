import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  appendEmailStatusQuery,
  parseInviteSender,
  sendMemberAddedEmail,
  sendOrgInviteEmail,
} from "./invite-email.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

describe("parseInviteSender", () => {
  it("parses Name <email> format", () => {
    assert.deepEqual(parseInviteSender("Content Intelligence <noreply@example.com>"), {
      name: "Content Intelligence",
      email: "noreply@example.com",
    });
  });

  it("parses plain email", () => {
    assert.deepEqual(parseInviteSender("noreply@example.com"), {
      name: "noreply",
      email: "noreply@example.com",
    });
  });

  it("returns null for empty", () => {
    assert.equal(parseInviteSender(""), null);
  });
});

describe("appendEmailStatusQuery", () => {
  it("leaves path unchanged on sent", () => {
    assert.equal(appendEmailStatusQuery("/org/members?added=1", "sent"), "/org/members?added=1");
  });

  it("appends email_failed", () => {
    assert.equal(
      appendEmailStatusQuery("/org/members?invited=1", "failed"),
      "/org/members?invited=1&email_failed=1",
    );
  });

  it("appends email_skipped", () => {
    assert.equal(
      appendEmailStatusQuery("/org/members?added=1", "skipped"),
      "/org/members?added=1&email_skipped=1",
    );
  });
});

describe("sendOrgInviteEmail", () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.INVITE_EMAIL_FROM = "Test <sender@example.com>";
    process.env.AUTH_URL = "https://app.example.com";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns skipped when BREVO_API_KEY unset", async () => {
    delete process.env.BREVO_API_KEY;
    const result = await sendOrgInviteEmail({
      to: "invitee@example.com",
      orgName: "Acme",
      invitedBy: "owner@example.com",
    });
    assert.equal(result, "skipped");
  });

  it("returns sent on 201", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ messageId: "x" }), { status: 201 });

    const result = await sendOrgInviteEmail({
      to: "invitee@example.com",
      orgName: "Acme",
      invitedBy: "owner@example.com",
    });
    assert.equal(result, "sent");
  });

  it("returns failed on non-2xx", async () => {
    globalThis.fetch = async () => new Response("bad", { status: 400 });

    const result = await sendMemberAddedEmail({
      to: "member@example.com",
      orgName: "Acme",
      invitedBy: "owner@example.com",
    });
    assert.equal(result, "failed");
  });
});
