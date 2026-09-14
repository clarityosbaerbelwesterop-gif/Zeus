import { AppShell } from "@/components/app-shell";
import { workspacePageData } from "@/lib/product";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; conversation?: string }>;
}) {
  const query = await searchParams;
  const data = await workspacePageData(query.workspace, query.conversation);
  return <AppShell data={data} />;
}
