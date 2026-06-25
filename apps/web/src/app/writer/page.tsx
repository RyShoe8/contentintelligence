import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WriterPage({
  searchParams,
}: {
  searchParams: Promise<{
    article_id?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "compose" });
  if (sp.article_id) params.set("article_id", sp.article_id);
  if (sp.saved) params.set("saved", sp.saved);
  if (sp.deleted) params.set("deleted", sp.deleted);
  if (sp.error) params.set("error", sp.error);
  redirect(`/studio?${params.toString()}`);
}
