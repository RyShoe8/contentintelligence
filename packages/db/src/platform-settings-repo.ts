import type { Collection, Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";
import {
  defaultPlatformSettings,
  PLATFORM_SETTINGS_ID,
  platformSettingsSchema,
  platformSettingsUpdateSchema,
  type PlatformSettings,
  type PlatformSettingsUpdate,
} from "./platform-settings.js";

function platformSettings(db: Db): Collection<PlatformSettings> {
  return db.collection<PlatformSettings>(COLLECTIONS.platform_settings);
}

/** Stored settings, or defaults when nothing has been saved yet. Never throws on legacy shapes. */
export async function getPlatformSettings(db: Db): Promise<PlatformSettings> {
  const doc = await platformSettings(db).findOne({ id: PLATFORM_SETTINGS_ID });
  if (!doc) return defaultPlatformSettings();
  const parsed = platformSettingsSchema.safeParse(doc);
  return parsed.success ? parsed.data : defaultPlatformSettings();
}

export async function updatePlatformSettings(
  db: Db,
  patch: PlatformSettingsUpdate,
  updatedBy?: string,
): Promise<PlatformSettings> {
  const parsedPatch = platformSettingsUpdateSchema.parse(patch);
  const current = await getPlatformSettings(db);

  const next = platformSettingsSchema.parse({
    ...current,
    ...parsedPatch,
    id: PLATFORM_SETTINGS_ID,
    updated_by: updatedBy?.trim() || current.updated_by,
    updated_at: new Date(),
  });

  await platformSettings(db).updateOne(
    { id: PLATFORM_SETTINGS_ID },
    { $set: next },
    { upsert: true },
  );
  return next;
}
