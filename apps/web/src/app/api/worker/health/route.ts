import { NextResponse } from "next/server";
import { auth } from "@/auth";

function gmailClientIdSuffix(clientId: string | undefined): string | null {
  if (!clientId || clientId.length < 6) return null;
  return clientId.slice(-6);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vercelGmail = {
    configured: Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET),
    clientIdSuffix: gmailClientIdSuffix(process.env.GMAIL_CLIENT_ID),
  };

  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({
      workerConfigured: false,
      vercelGmail,
      workerGmail: null,
      clientIdMatch: null,
    });
  }

  try {
    const r = await fetch(`${base}/health`, { next: { revalidate: 0 } });
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      gmail?: { configured?: boolean; clientIdSuffix?: string | null };
    };
    const workerGmail = body.gmail ?? null;
    const clientIdMatch =
      vercelGmail.clientIdSuffix && workerGmail?.clientIdSuffix
        ? vercelGmail.clientIdSuffix === workerGmail.clientIdSuffix
        : null;

    return NextResponse.json({
      workerConfigured: true,
      workerOk: r.ok && body.ok === true,
      vercelGmail,
      workerGmail,
      clientIdMatch,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json({
      workerConfigured: true,
      workerOk: false,
      vercelGmail,
      workerGmail: null,
      clientIdMatch: null,
      error: msg,
    });
  }
}
