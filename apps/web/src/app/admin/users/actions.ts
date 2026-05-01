"use server";

import { auth } from "@/auth";
import clientPromise from "@/lib/mongo-auth-adapter";
import { revalidatePath } from "next/cache";

const dbName = process.env.MONGODB_DB_NAME ?? "content_resourcer";

export async function updateUserRoleAction(formData: FormData) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    throw new Error("Forbidden");
  }
  const email = String(formData.get("email") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "");
  const role = roleRaw === "admin" ? "admin" : "member";
  if (!email) {
    throw new Error("Missing email");
  }
  const client = await clientPromise;
  await client.db(dbName).collection("users").updateOne({ email }, { $set: { role } });
  revalidatePath("/admin/users");
}
