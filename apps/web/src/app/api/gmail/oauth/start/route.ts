import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const STATE_COOKIE = "gmail_oauth_state";
const STATE_MAX_AGE = 600;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", "/signals");
    return NextResponse.redirect(login);
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
