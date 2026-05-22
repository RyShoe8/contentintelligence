import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ensureIndexes, getContentSignal, getSource } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { auth } from "@/auth";
import { canAccessContentSignal } from "@/lib/org-auth";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const STATE_COOKIE = "gmail_oauth_state";
const RETURN_COOKIE = "gmail_oauth_return";
const STATE_MAX_AGE = 600;

export async function GET(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("source_id")?.trim();
  const contentSignalId = req.nextUrl.searchParams.get("content_signal_id")?.trim();
  const returnPath =
    sourceId && contentSignalId
      ? `/content-signals/${contentSignalId}/sources/${sourceId}`
      : "/content-signals";

  const session = await auth();
  if (!session?.user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", returnPath);
    return NextResponse.redirect(login);
  }
  if (!session.user.organizationId) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (sourceId && contentSignalId) {
    const db = await connectMongo();
    await ensureIndexes(db);
    const contentSignal = await getContentSignal(db, contentSignalId);
    const source = await getSource(db, sourceId);
    if (
      !contentSignal ||
      !source ||
      source.content_signal_id !== contentSignalId ||
      !canAccessContentSignal(contentSignal, session)
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const id = process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!id || !secret || !redirectUri) {
    return NextResponse.json(
      { error: "Gmail OAuth is not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI)" },
      { status: 500 },
    );
  }

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_MAX_AGE,
    path: "/",
  });
  if (sourceId && contentSignalId) {
    cookieStore.set(RETURN_COOKIE, JSON.stringify({ sourceId, contentSignalId }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: STATE_MAX_AGE,
      path: "/",
    });
  }

  const oauth2 = new google.auth.OAuth2(id, secret, redirectUri);
  const loginHint = req.nextUrl.searchParams.get("login_hint")?.trim();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  return NextResponse.redirect(url);
}
