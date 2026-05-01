"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const secret = process.env.INTERNAL_UI_SECRET;
  if (!secret) redirect("/feed");

  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/feed");
  if (password !== secret) {
    redirect("/login?error=1");
  }
  (await cookies()).set("cr_auth", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") ? next : "/feed");
}
