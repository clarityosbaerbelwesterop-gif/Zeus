import { requireSession } from "@zeus/auth/server";
import { runtimeRuns, withActor } from "@zeus/db";
import { and, desc, eq } from "drizzle-orm";

export async function latestRuntimeRunId(input: {
  workspaceId: string;
  taskId?: string;
  conversationId?: string;
}): Promise<string | null> {
  const session = await requireSession();
  const actorId = String(session.user.id);
  return withActor(actorId, async (db) => {
    const clauses = [eq(runtimeRuns.workspaceId, input.workspaceId)];
    if (input.taskId) clauses.push(eq(runtimeRuns.taskId, input.taskId));
    if (input.conversationId) clauses.push(eq(runtimeRuns.conversationId, input.conversationId));
    const row = (
      await db
        .select({ id: runtimeRuns.id })
        .from(runtimeRuns)
        .where(and(...clauses))
        .orderBy(desc(runtimeRuns.createdAt))
        .limit(1)
    )[0];
    return row?.id ?? null;
  });
}
