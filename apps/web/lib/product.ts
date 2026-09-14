import { randomUUID } from "node:crypto";
import { AGENT_TEMPLATES, type AgentCode } from "@zeus/agents";
import { requireSession } from "@zeus/auth/server";
import {
  agentTemplates,
  apiTokens,
  auditEvents,
  conversations,
  messages,
  organizationMembers,
  organizations,
  runSteps,
  runs,
  users,
  withActor,
  workspaceAgents,
  workspaceMembers,
  workspaces,
} from "@zeus/db";
import { createOpaqueToken, safeAuditMetadata } from "@zeus/security";
import { messageSchema, workspaceNameSchema } from "@zeus/shared";
import { and, count, desc, eq, gte } from "drizzle-orm";

async function actor() {
  const session = await requireSession();
  return {
    id: String(session.user.id),
    email: String(session.user.email ?? "unknown@invalid.local"),
    name: session.user.name ? String(session.user.name) : null,
  };
}

async function audit(
  userId: string,
  organizationId: string,
  input: { workspaceId?: string; action: string; targetType: string; targetId: string; metadata?: Record<string, string | number | boolean | null> },
) {
  await withActor(userId, async (db) => {
    await db.insert(auditEvents).values({
      organizationId,
      workspaceId: input.workspaceId,
      actorId: userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: safeAuditMetadata(input.metadata ?? {}),
    });
  });
}

export async function bootstrapAccount() {
  const user = await actor();
  return withActor(user.id, async (db) => {
    await db
      .insert(users)
      .values({ id: user.id, email: user.email, name: user.name })
      .onConflictDoUpdate({ target: users.id, set: { email: user.email, name: user.name, updatedAt: new Date() } });

    let membership = (
      await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1)
    )[0];
    let created = false;
    if (!membership) {
      const organizationId = randomUUID();
      await db.insert(organizations).values({ id: organizationId, name: user.name ? `${user.name}'s Zeus` : "My Zeus", createdBy: user.id });
      await db.insert(organizationMembers).values({ organizationId, userId: user.id, role: "owner" });
      membership = { organizationId, userId: user.id, role: "owner", createdAt: new Date() };
      created = true;
      await db.insert(auditEvents).values({
        organizationId,
        actorId: user.id,
        action: "organization.created",
        targetType: "organization",
        targetId: organizationId,
        metadata: {},
      });
    }
    return { user, organizationId: membership.organizationId, created };
  });
}

export async function createWorkspace(input: { name: string; description?: string; agents: readonly AgentCode[] }) {
  const account = await bootstrapAccount();
  const name = workspaceNameSchema.parse(input.name);
  const description = (input.description ?? "").trim().slice(0, 2_000);
  const allowed = new Set(AGENT_TEMPLATES.map((item) => item.code));
  const selected = [...new Set(input.agents)].filter((code) => allowed.has(code));
  const workspaceId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await db.insert(workspaces).values({ id: workspaceId, organizationId: account.organizationId, name, description, createdBy: account.user.id });
    await db.insert(workspaceMembers).values({ workspaceId, userId: account.user.id, role: "owner" });
    if (selected.length) {
      await db.insert(workspaceAgents).values(selected.map((agentCode) => ({ workspaceId, agentCode, enabledBy: account.user.id })));
    }
    await db.insert(auditEvents).values({
      organizationId: account.organizationId,
      workspaceId,
      actorId: account.user.id,
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { agentCount: selected.length },
    });
  });
  return workspaceId;
}

export async function renameWorkspace(workspaceId: string, name: string) {
  const account = await bootstrapAccount();
  const parsed = workspaceNameSchema.parse(name);
  await withActor(account.user.id, async (db) => {
    await db.update(workspaces).set({ name: parsed, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  });
  await audit(account.user.id, account.organizationId, { workspaceId, action: "workspace.updated", targetType: "workspace", targetId: workspaceId });
}

export async function toggleWorkspaceAgent(workspaceId: string, agentCode: AgentCode, enabled: boolean) {
  const account = await bootstrapAccount();
  if (!AGENT_TEMPLATES.some((agent) => agent.code === agentCode)) throw new Error("Unknown agent.");
  await withActor(account.user.id, async (db) => {
    if (enabled) {
      await db.insert(workspaceAgents).values({ workspaceId, agentCode, enabledBy: account.user.id }).onConflictDoNothing();
    } else {
      await db.delete(workspaceAgents).where(and(eq(workspaceAgents.workspaceId, workspaceId), eq(workspaceAgents.agentCode, agentCode)));
    }
  });
  await audit(account.user.id, account.organizationId, { workspaceId, action: enabled ? "agent.enabled" : "agent.disabled", targetType: "agent", targetId: agentCode });
}

export async function createConversation(workspaceId: string, agentCode: AgentCode | null) {
  const account = await bootstrapAccount();
  if (agentCode && !AGENT_TEMPLATES.some((agent) => agent.code === agentCode)) throw new Error("Unknown agent.");
  const conversationId = randomUUID();
  const label = agentCode ? AGENT_TEMPLATES.find((agent) => agent.code === agentCode)?.name ?? "Agent" : "Team";
  await withActor(account.user.id, async (db) => {
    await db.insert(conversations).values({ id: conversationId, workspaceId, title: `${label} conversation`, agentCode, createdBy: account.user.id });
    await db.insert(auditEvents).values({ organizationId: account.organizationId, workspaceId, actorId: account.user.id, action: "conversation.created", targetType: "conversation", targetId: conversationId, metadata: { agent: agentCode ?? "team" } });
  });
  return conversationId;
}

export async function sendMessage(conversationId: string, content: string) {
  const account = await bootstrapAccount();
  const text = messageSchema.parse(content);
  return withActor(account.user.id, async (db) => {
    const conversation = (await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1))[0];
    if (!conversation) throw new Error("Conversation not found.");
    const [recentRow] = await db
      .select({ value: count() })
      .from(messages)
      .where(and(eq(messages.authorId, account.user.id), gte(messages.createdAt, new Date(Date.now() - 60_000))));
    const recent = recentRow?.value ?? 0;
    if (recent >= 30) throw new Error("Message rate limit reached. Try again in a minute.");

    await db.insert(messages).values({ conversationId, authorId: account.user.id, role: "user", content: text });
    const runId = randomUUID();
    const agentCode: AgentCode = (conversation.agentCode as AgentCode | null) ?? "jorge";
    await db.insert(runs).values({
      id: runId,
      workspaceId: conversation.workspaceId,
      conversationId,
      agentCode,
      status: "waiting",
      objective: text,
      createdBy: account.user.id,
      startedAt: new Date(),
    });
    await db.insert(runSteps).values({
      runId,
      ordinal: 0,
      status: "waiting",
      title: "Waiting for AI provider",
      safeDetail: "Your message is persisted. Configure a model provider before agent execution is enabled.",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      startedAt: new Date(),
    });
    await db.insert(messages).values({
      conversationId,
      role: "system",
      agentCode,
      content: "AI provider not configured yet. Your message is saved and this run is waiting for a model provider.",
    });
    await db.insert(auditEvents).values({ organizationId: account.organizationId, workspaceId: conversation.workspaceId, actorId: account.user.id, action: "run.started", targetType: "run", targetId: runId, metadata: { state: "waiting_provider" } });
    return runId;
  });
}

export async function workspacePageData(workspaceId?: string, conversationId?: string) {
  const account = await bootstrapAccount();
  return withActor(account.user.id, async (db) => {
    const allWorkspaces = await db.select().from(workspaces).orderBy(desc(workspaces.updatedAt));
    const activeWorkspace = workspaceId ? allWorkspaces.find((item) => item.id === workspaceId) : allWorkspaces[0];
    if (!activeWorkspace) return { account, workspaces: allWorkspaces, activeWorkspace: null, agents: [], conversations: [], activeConversation: null, messages: [], runs: [], steps: [] };

    const enabled = await db.select().from(workspaceAgents).where(eq(workspaceAgents.workspaceId, activeWorkspace.id));
    const templates = await db.select().from(agentTemplates);
    const agentSet = new Set(enabled.map((item) => item.agentCode));
    const agents = templates.map((template) => ({ ...template, enabled: agentSet.has(template.code) }));
    const conversationRows = await db.select().from(conversations).where(eq(conversations.workspaceId, activeWorkspace.id)).orderBy(desc(conversations.updatedAt));
    const activeConversation = conversationId ? conversationRows.find((item) => item.id === conversationId) ?? conversationRows[0] : conversationRows[0];
    const messageRows = activeConversation ? await db.select().from(messages).where(eq(messages.conversationId, activeConversation.id)).orderBy(messages.createdAt) : [];
    const runRows = await db.select().from(runs).where(eq(runs.workspaceId, activeWorkspace.id)).orderBy(desc(runs.createdAt)).limit(8);
    const stepRows = runRows[0] ? await db.select().from(runSteps).where(eq(runSteps.runId, runRows[0].id)).orderBy(runSteps.ordinal) : [];
    return { account, workspaces: allWorkspaces, activeWorkspace, agents, conversations: conversationRows, activeConversation: activeConversation ?? null, messages: messageRows, runs: runRows, steps: stepRows };
  });
}

export async function createApiToken(input: { workspaceId?: string; label: string; scopes: readonly string[]; expiresAt?: Date }) {
  const account = await bootstrapAccount();
  const token = createOpaqueToken();
  const id = randomUUID();
  await withActor(account.user.id, async (db) => {
    await db.insert(apiTokens).values({
      id,
      organizationId: account.organizationId,
      workspaceId: input.workspaceId,
      ownerId: account.user.id,
      label: input.label.trim().slice(0, 120),
      prefix: token.prefix,
      digest: token.digest,
      scopes: [...input.scopes].slice(0, 32),
      expiresAt: input.expiresAt,
    });
    await db.insert(auditEvents).values({ organizationId: account.organizationId, workspaceId: input.workspaceId, actorId: account.user.id, action: "token.created", targetType: "api_token", targetId: id, metadata: { prefix: token.prefix, scopeCount: input.scopes.length } });
  });
  return { id, token: token.raw, prefix: token.prefix };
}
