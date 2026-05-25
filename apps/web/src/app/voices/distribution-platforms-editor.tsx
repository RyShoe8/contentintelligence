import { SOCIAL_PLATFORMS, type SocialPlatformId } from "@content-resourcer/db";

type Props = {
  defaultPlatforms?: SocialPlatformId[];
};

export function DistributionPlatformsEditor({ defaultPlatforms = [] }: Props) {
  const selected = new Set(defaultPlatforms);

  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="font-medium">Distribution platforms</legend>
      <p className="text-xs text-[var(--muted)]">
        Select where you publish. Posts will generate tailored copy for each platform with its character
        limit and formatting rules.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => (
          <label
            key={platform.id}
            className="flex cursor-pointer gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 hover:border-[var(--primary)]"
          >
            <input
              type="checkbox"
              name="distribution_platforms"
              value={platform.id}
              defaultChecked={selected.has(platform.id)}
              className="mt-1 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-[var(--fg)]">{platform.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Max {platform.maxChars.toLocaleString()} characters · {platform.promptRules}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
