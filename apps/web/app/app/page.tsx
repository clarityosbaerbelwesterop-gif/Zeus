import { AppShell } from "@/components/app-shell";
import { workspacePageData } from "@/lib/product";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string;
    conversation?: string;
    view?: string;
    q?: string;
    plan?: string;
    deal?: string;
  }>;
}) {
  const query = await searchParams;
  const data = await workspacePageData(
    query.workspace,
    query.conversation,
    query.view ?? "home",
    query.q ?? "",
    query.plan,
    query.deal,
  );
  return <AppShell data={data} />;
}
