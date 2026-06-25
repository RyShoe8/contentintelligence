import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RewriterPage({
  searchParams,
}: {
  searchParams: Promise<{
    article_id?: string;
    import_from?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "rewrite" });
  if (sp.article_id) params.set("article_id", sp.article_id);
  if (sp.import_from) params.set("import_from", sp.import_from);
  if (sp.saved) params.set("saved", sp.saved);
  if (sp.deleted) params.set("deleted", sp.deleted);
  if (sp.error) params.set("error", sp.error);
  redirect(`/studio?${params.toString()}`);
}
