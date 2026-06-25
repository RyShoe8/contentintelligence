import {
  ensureIndexes,
  listVoices,
  listContentSignals,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import { LaunchWizard } from "@/components/launch-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launch Wizard",
};

export default async function LaunchPage() {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const [voices, topics] = await Promise.all([
    listVoices(db, orgId),
    listContentSignals(db, { organizationId: orgId }),
  ]);

  const workerConfigured = !!process.env.WORKER_URL;
  const firstVoice = voices[0] ?? null;
  const firstTopic = topics[0] ?? null;

  // Determine starting step
  let startStep = 1;
  if (voices.length > 0 && voices[0].persona_status === "ready") startStep = 2;
  if (startStep === 2 && topics.length > 0) startStep = 3;

  return (
    <LaunchWizard
      workerConfigured={workerConfigured}
      initialStep={startStep}
      initialVoice={firstVoice ? { id: firstVoice.id, name: firstVoice.name, personaStatus: firstVoice.persona_status } : null}
      initialTopic={firstTopic ? { id: firstTopic.id, name: firstTopic.name } : null}
    />
  );
}
