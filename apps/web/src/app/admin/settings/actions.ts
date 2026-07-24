"use server";

import {
  COMPOSE_REWRITE_PASSES_MAX,
  ensureIndexes,
  updatePlatformSettings,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { requirePlatformAdmin } from "@/lib/org-auth";

function readModel(formData: FormData, key: string): string | undefined {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || undefined;
}

function readInt(formData: FormData, key: string, min: number, max: number): number | undefined {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function updatePlatformSettingsAction(formData: FormData) {
  const session = await requirePlatformAdmin();

  const db = await connectMongo();
  await ensureIndexes(db);

  await updatePlatformSettings(
    db,
    {
      writer_model: readModel(formData, "writer_model"),
      utility_model: readModel(formData, "utility_model"),
      research_model: readModel(formData, "research_model"),
      compose_rewrite_passes: readInt(
        formData,
        "compose_rewrite_passes",
        0,
        COMPOSE_REWRITE_PASSES_MAX,
      ),
      voice_fidelity_min: readInt(formData, "voice_fidelity_min", 0, 100),
    },
    session.user.email ?? undefined,
  );

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}
