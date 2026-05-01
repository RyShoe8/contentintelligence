import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const secret = process.env.INTERNAL_UI_SECRET;
  if (!secret) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (path === "/login" || path.startsWith("/login/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("cr_auth")?.value;
  if (token === secret) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
