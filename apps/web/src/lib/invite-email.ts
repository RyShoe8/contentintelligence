export type InviteEmailResult = "sent" | "skipped" | "failed";

export type InviteEmailParams = {
  to: string;
  orgName: string;
  invitedBy: string;
};

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function loginUrl(): string {
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  return base ? `${base}/login` : "/login";
}

/** Parse `Name <email@domain.com>` or plain `email@domain.com`. */
export function parseInviteSender(from: string): { name: string; email: string } | null {
  const trimmed = from.trim();
  if (!trimmed) return null;
  const bracketed = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (bracketed) {
    const email = bracketed[2]!.trim();
    if (email.includes("@")) {
      return { name: bracketed[1]!.trim() || email.split("@")[0]!, email };
    }
    return null;
  }
  if (trimmed.includes("@")) {
    return { name: trimmed.split("@")[0]!, email: trimmed };
  }
  return null;
}

async function sendBrevoTransactional(payload: {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}): Promise<InviteEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return "skipped";

  const fromRaw = process.env.INVITE_EMAIL_FROM?.trim();
  const sender = fromRaw ? parseInviteSender(fromRaw) : null;
  if (!sender) {
    console.warn("[invite-email] INVITE_EMAIL_FROM missing or invalid; skipping send");
    return "skipped";
  }

  try {
    const res = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: sender.name, email: sender.email },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.htmlContent,
        textContent: payload.textContent,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[invite-email] Brevo error", res.status, body.slice(0, 500));
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[invite-email] send failed", e);
    return "failed";
  }
}

export async function sendOrgInviteEmail(params: InviteEmailParams): Promise<InviteEmailResult> {
  const orgName = params.orgName.trim() || "your organization";
  const invitedBy = params.invitedBy.trim() || "A team owner";
  const signIn = loginUrl();

  const subject = `You're invited to ${orgName}`;
  const textContent = [
    `${invitedBy} invited you to join ${orgName} on Content Intelligence.`,
    "",
    `Sign in with Google using ${params.to}:`,
    signIn,
    "",
    "If you did not expect this invite, you can ignore this email.",
  ].join("\n");

  const htmlContent = `
<p>${escapeHtml(invitedBy)} invited you to join <strong>${escapeHtml(orgName)}</strong> on Content Intelligence.</p>
<p>Sign in with Google using <strong>${escapeHtml(params.to)}</strong>:</p>
<p><a href="${escapeAttr(signIn)}">Sign in</a></p>
<p style="color:#666;font-size:12px;">If you did not expect this invite, you can ignore this email.</p>
`.trim();

  return sendBrevoTransactional({
    to: params.to,
    subject,
    htmlContent,
    textContent,
  });
}

export async function sendMemberAddedEmail(params: InviteEmailParams): Promise<InviteEmailResult> {
  const orgName = params.orgName.trim() || "your organization";
  const invitedBy = params.invitedBy.trim() || "A team owner";
  const signIn = loginUrl();

  const subject = `You've been added to ${orgName}`;
  const textContent = [
    `${invitedBy} added you to ${orgName} on Content Intelligence.`,
    "",
    `Sign in with Google using ${params.to} to access your organization's feed:`,
    signIn,
  ].join("\n");

  const htmlContent = `
<p>${escapeHtml(invitedBy)} added you to <strong>${escapeHtml(orgName)}</strong> on Content Intelligence.</p>
<p>Sign in with Google using <strong>${escapeHtml(params.to)}</strong> to access your feed:</p>
<p><a href="${escapeAttr(signIn)}">Sign in</a></p>
`.trim();

  return sendBrevoTransactional({
    to: params.to,
    subject,
    htmlContent,
    textContent,
  });
}

/** Append email delivery status to a redirect path that already has query params. */
export function appendEmailStatusQuery(path: string, result: InviteEmailResult): string {
  if (result === "sent") return path;
  const sep = path.includes("?") ? "&" : "?";
  if (result === "failed") return `${path}${sep}email_failed=1`;
  return `${path}${sep}email_skipped=1`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
