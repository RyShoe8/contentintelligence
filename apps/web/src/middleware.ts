import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }
  if (pathname === "/api/gmail/oauth/callback") {
    return NextResponse.next();
  }
  if (pathname === "/login") {
    return NextResponse.next();
  }
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    const nextPath = `${pathname}${req.nextUrl.search}`;
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
