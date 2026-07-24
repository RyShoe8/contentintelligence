import {
  COMPOSE_REWRITE_PASSES_MAX,
  ensureIndexes,
  getPlatformSettings,
  modelOptionsForTier,
  writerModelWarning,
  type ModelTier,
  type OpenAiModelOption,
} from "@content-resourcer/db";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { Select } from "@/components/ui/select";
import { connectMongo } from "@/lib/mongo";
import { requirePlatformAdmin } from "@/lib/org-auth";
import { updatePlatformSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ saved?: string }>;
};

/** Options for a tier, plus the saved value if it is not in the catalog (env override). */
function optionsWithCurrent(tier: ModelTier, current: string): OpenAiModelOption[] {
  const options = modelOptionsForTier(tier);
  if (options.some((o) => o.id === current)) return options;
  return [
    {
      id: current,
      label: `${current} (custom)`,
      tiers: [tier],
      description: "Set outside the catalog — kept so an env override is not silently replaced.",
    },
    ...options,
  ];
}

function ModelField({
  name,
  tier,
  label,
  help,
  current,
}: {
  name: string;
  tier: ModelTier;
  label: string;
  help: string;
  current: string;
}) {
  const options = optionsWithCurrent(tier, current);
  const selected = options.find((o) => o.id === current);

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-[var(--fg)]">
        {label}
      </label>
      <p className="text-xs text-[var(--muted)]">{help}</p>
      <Select id={name} name={name} defaultValue={current} className="w-full max-w-md">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      {selected ? <p className="text-xs text-[var(--muted)]">{selected.description}</p> : null}
    </div>
  );
}

export default async function AdminSettingsPage({ searchParams }: Props) {
  await requirePlatformAdmin();
  const { saved } = await searchParams;

  const db = await connectMongo();
  await ensureIndexes(db);
  const settings = await getPlatformSettings(db);
  const warning = writerModelWarning(settings.writer_model);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Model selection and generation limits for the whole platform."
      />

      {saved ? <Alert variant="success">Settings saved. New compose jobs use them immediately.</Alert> : null}
      {warning ? <Alert variant="warning">{warning}</Alert> : null}

      <form action={updatePlatformSettingsAction} className="space-y-6">
        <PageSection
          title="Models"
          description="Each tier is a separate OpenAI model. Prose quality is set by the writer tier; the utility tier only does extraction and scoring, so it can stay cheap."
        >
          <div className="space-y-6">
            <ModelField
              name="writer_model"
              tier="writer"
              label="Writer"
              help="Article prose: drafting, humanizing, style transfer, expansion. This is the setting that determines whether articles sound like the brand."
              current={settings.writer_model}
            />
            <ModelField
              name="research_model"
              tier="research"
              label="Research"
              help="Topic research plans, research briefs, and editorial outlines."
              current={settings.research_model}
            />
            <ModelField
              name="utility_model"
              tier="utility"
              label="Utility"
              help="Fact extraction, JSON scoring, example ranking, self-critique. Cheap models are fine here."
              current={settings.utility_model}
            />
          </div>
        </PageSection>

        <PageSection
          title="Compose quality"
          description="Every whole-article rewrite pass pulls prose back toward the model's average. Fewer passes keeps more of the brand's voice; more passes enforces the rules harder."
        >
          <div className="space-y-6">
            <div className="space-y-1.5">
              <label
                htmlFor="compose_rewrite_passes"
                className="block text-sm font-medium text-[var(--fg)]"
              >
                Rewrite passes after the first draft
              </label>
              <p className="text-xs text-[var(--muted)]">
                0–{COMPOSE_REWRITE_PASSES_MAX}. Recommended 2. Above 4, articles reliably flatten out.
              </p>
              <input
                id="compose_rewrite_passes"
                name="compose_rewrite_passes"
                type="number"
                min={0}
                max={COMPOSE_REWRITE_PASSES_MAX}
                defaultValue={settings.compose_rewrite_passes}
                className="ui-input w-24"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="voice_fidelity_min"
                className="block text-sm font-medium text-[var(--fg)]"
              >
                Minimum voice fidelity score
              </label>
              <p className="text-xs text-[var(--muted)]">
                0–100. Articles scoring below this against the voice&apos;s own style examples are
                flagged on the draft. Recommended 55.
              </p>
              <input
                id="voice_fidelity_min"
                name="voice_fidelity_min"
                type="number"
                min={0}
                max={100}
                defaultValue={settings.voice_fidelity_min}
                className="ui-input w-24"
              />
            </div>
          </div>
        </PageSection>

        <div className="flex items-center gap-3">
          <Button type="submit">Save settings</Button>
          {settings.updated_by ? (
            <span className="text-xs text-[var(--muted)]">
              Last updated by {settings.updated_by} on{" "}
              {settings.updated_at.toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
