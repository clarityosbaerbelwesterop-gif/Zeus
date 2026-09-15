import { createHash, randomUUID } from "node:crypto";
import { AGENT_TEMPLATES, type AgentCode } from "@zeus/agents";
import { requireSession } from "@zeus/auth/server";
import {
  agentTemplates,
  apiTokens,
  artifacts,
  auditEvents,
  conversationParticipants,
  conversations,
  fileObjects,
  memoryEntries,
  messages,
  organizationMembers,
  organizations,
  planSteps,
  plans,
  runSteps,
  runs,
  taskArtifacts,
  taskConversations,
  taskRuns,
  tasks,
  users,
  withActor,
  type ActorDatabase,
  workspaceAgents,
  workspaceEvents,
  workspaceFiles,
  workspaceMembers,
  workspaces,
} from "@zeus/db";
import { createOpaqueToken, safeAuditMetadata } from "@zeus/security";
import {
  longTextSchema,
  messageSchema,
  shortTitleSchema,
  workspaceNameSchema,
  workspaceObjectiveSchema,
} from "@zeus/shared";
import {
  assertTaskTransition,
  can,
  deriveAgentPresence,
  fileStorageKey,
  isArtifactType,
  isMemoryType,
  isTaskPriority,
  isTaskStatus,
  isWorkspaceRole,
  normalizeSearchQuery,
  normalizeSequence,
  safeFileName,
  validateUpload,
  type ArtifactType,
  type MemoryType,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceCapability,
  type WorkspaceContextSnapshot,
  type WorkspaceRole,
} from "@zeus/workspace";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

interface Actor {
  id: string;
  email: string;
  name: string | null;
}

interface Account {
  user: Actor;
  organizationId: string;
  created: boolean;
}

async function actor(): Promise<Actor> {
  const session = await requireSession();
  return {
    id: String(session.user.id),
    email: String(session.user.email ?? "unknown@invalid.local"),
    name: session.user.name ? String(session.user.name) : null,
  };
}

async function requireCapability(
  db: ActorDatabase,
  userId: string,
  workspaceId: string,
  capability: WorkspaceCapability,
): Promise<WorkspaceRole> {
  const membership = (
    await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .limit(1)
  )[0];
  if (!membership || !isWorkspaceRole(membership.role) || !can(membership.role, capability)) {
    throw new Error("You do not have permission for this workspace action.");
  }
  return membership.role;
}

async function recordEvent(
  db: ActorDatabase,
  account: Account,
  input: {
    workspaceId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorType?: "user" | "agent" | "system";
    actorId?: string | null;
    payload?: Record<string, string | number | boolean | null>;
    audit?: boolean;
  },
): Promise<void> {
  const safePayload = safeAuditMetadata(input.payload ?? {});
  await db.insert(workspaceEvents).values({
    organizationId: account.organizationId,
    workspaceId: input.workspaceId,
    actorType: input.actorType ?? "user",
    actorId: input.actorId === undefined ? account.user.id : input.actorId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    safePayload,
  });
  if (input.audit) {
    await db.insert(auditEvents).values({
      organizationId: account.organizationId,
      workspaceId: input.workspaceId,
      actorId: account.user.id,
      action: input.eventType,
      targetType: input.entityType,
      targetId: input.entityId,
      metadata: safePayload,
    });
  }
}

export async function bootstrapAccount(): Promise<Account> {
  const user = await actor();
  return withActor(user.id, async (db) => {
    await db
      .insert(users)
      .values({ id: user.id, email: user.email, name: user.name })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: user.email, name: user.name, updatedAt: new Date() },
      });

    let membership = (
      await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id))
        .limit(1)
    )[0];
    let created = false;
    if (!membership) {
      const organizationId = randomUUID();
      await db.insert(organizations).values({
        id: organizationId,
        name: user.name ? `${user.name}'s Zeus` : "My Zeus",
        createdBy: user.id,
      });
      await db
        .insert(organizationMembers)
        .values({ organizationId, userId: user.id, role: "owner" });
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

function knownAgent(value: string | null | undefined): value is AgentCode {
  return Boolean(value && AGENT_TEMPLATES.some((agent) => agent.code === value));
}

async function enabledAgent(
  db: ActorDatabase,
  workspaceId: string,
  agentCode: AgentCode,
): Promise<void> {
  const row = (
    await db
      .select({ agentCode: workspaceAgents.agentCode })
      .from(workspaceAgents)
      .where(
        and(eq(workspaceAgents.workspaceId, workspaceId), eq(workspaceAgents.agentCode, agentCode)),
      )
      .limit(1)
  )[0];
  if (!row) throw new Error("That agent is not enabled in this workspace.");
}

async function ensureDirectConversation(
  db: ActorDatabase,
  userId: string,
  workspaceId: string,
  agentCode: AgentCode,
): Promise<string> {
  const existing = (
    await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, workspaceId),
          eq(conversations.agentCode, agentCode),
          eq(conversations.type, "direct_agent"),
        ),
      )
      .limit(1)
  )[0];
  if (existing) return existing.id;
  const template = AGENT_TEMPLATES.find((item) => item.code === agentCode);
  const conversationId = randomUUID();
  await db.insert(conversations).values({
    id: conversationId,
    workspaceId,
    type: "direct_agent",
    title: template?.name ?? agentCode,
    agentCode,
    createdBy: userId,
  });
  await db.insert(conversationParticipants).values({ conversationId, agentCode });
  return conversationId;
}

export async function createWorkspace(input: {
  name: string;
  description?: string;
  objective?: string;
  agents: readonly AgentCode[];
}): Promise<string> {
  const account = await bootstrapAccount();
  const name = workspaceNameSchema.parse(input.name);
  const description = (input.description ?? "").trim().slice(0, 2_000);
  const objective = workspaceObjectiveSchema.parse(input.objective ?? "");
  const allowed = new Set(AGENT_TEMPLATES.map((item) => item.code));
  const selected = [...new Set(input.agents)].filter((code) => allowed.has(code));
  const workspaceId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await db.insert(workspaces).values({
      id: workspaceId,
      organizationId: account.organizationId,
      name,
      description,
      objective,
      createdBy: account.user.id,
    });
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: account.user.id, role: "owner" });
    if (selected.length) {
      await db
        .insert(workspaceAgents)
        .values(
          selected.map((agentCode) => ({ workspaceId, agentCode, enabledBy: account.user.id })),
        );
      for (const agentCode of selected) {
        await ensureDirectConversation(db, account.user.id, workspaceId, agentCode);
      }
      const teamConversationId = randomUUID();
      await db.insert(conversations).values({
        id: teamConversationId,
        workspaceId,
        type: "team",
        title: "Team room",
        createdBy: account.user.id,
      });
      await db
        .insert(conversationParticipants)
        .values(selected.map((agentCode) => ({ conversationId: teamConversationId, agentCode })));
    }
    if (objective) {
      await db.insert(memoryEntries).values({
        workspaceId,
        type: "goal",
        title: "Workspace objective",
        content: objective,
        sourceType: "workspace",
        sourceId: workspaceId,
        createdBy: account.user.id,
      });
    }
    await recordEvent(db, account, {
      workspaceId,
      eventType: "workspace.created",
      entityType: "workspace",
      entityId: workspaceId,
      payload: { agentCount: selected.length },
      audit: true,
    });
  });
  return workspaceId;
}

export async function updateWorkspace(
  workspaceId: string,
  input: {
    name: string;
    description: string;
    objective: string;
    successCriteria: string;
    currentFocus: string;
    status: string;
    priority: string;
  },
): Promise<void> {
  const account = await bootstrapAccount();
  const name = workspaceNameSchema.parse(input.name);
  const description = input.description.trim().slice(0, 2_000);
  const objective = workspaceObjectiveSchema.parse(input.objective);
  const successCriteria = workspaceObjectiveSchema.parse(input.successCriteria);
  const currentFocus = input.currentFocus.trim().slice(0, 4_000);
  const status = ["active", "paused", "completed"].includes(input.status) ? input.status : "active";
  const priority = isTaskPriority(input.priority) ? input.priority : "medium";
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "workspace.manage");
    await db
      .update(workspaces)
      .set({
        name,
        description,
        objective,
        successCriteria,
        currentFocus,
        status,
        priority,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    await recordEvent(db, account, {
      workspaceId,
      eventType: "workspace.updated",
      entityType: "workspace",
      entityId: workspaceId,
      audit: true,
    });
  });
}

export async function archiveWorkspace(workspaceId: string, confirmation: string): Promise<void> {
  const account = await bootstrapAccount();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "workspace.manage");
    const workspace = (
      await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    )[0];
    if (!workspace || confirmation.trim() !== workspace.name) {
      throw new Error("Type the workspace name exactly to archive it.");
    }
    await recordEvent(db, account, {
      workspaceId,
      eventType: "workspace.archived",
      entityType: "workspace",
      entityId: workspaceId,
      audit: true,
    });
    await db
      .update(workspaces)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
  });
}

export async function toggleWorkspaceAgent(
  workspaceId: string,
  agentCode: AgentCode,
  enabled: boolean,
): Promise<void> {
  const account = await bootstrapAccount();
  if (!knownAgent(agentCode)) throw new Error("Unknown agent.");
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "workspace.manage");
    if (enabled) {
      await db
        .insert(workspaceAgents)
        .values({ workspaceId, agentCode, enabledBy: account.user.id })
        .onConflictDoNothing();
      await ensureDirectConversation(db, account.user.id, workspaceId, agentCode);
    } else {
      await db
        .delete(workspaceAgents)
        .where(
          and(
            eq(workspaceAgents.workspaceId, workspaceId),
            eq(workspaceAgents.agentCode, agentCode),
          ),
        );
    }
    await recordEvent(db, account, {
      workspaceId,
      eventType: enabled ? "agent.enabled" : "agent.disabled",
      entityType: "agent",
      entityId: agentCode,
      audit: true,
    });
  });
}

export async function createConversation(
  workspaceId: string,
  agentCode: AgentCode | null,
  title?: string,
): Promise<string> {
  const account = await bootstrapAccount();
  const conversationId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "conversation.write");
    if (agentCode) {
      if (!knownAgent(agentCode)) throw new Error("Unknown agent.");
      await enabledAgent(db, workspaceId, agentCode);
      const id = await ensureDirectConversation(db, account.user.id, workspaceId, agentCode);
      return id;
    }
    const enabled = await db
      .select({ agentCode: workspaceAgents.agentCode })
      .from(workspaceAgents)
      .where(eq(workspaceAgents.workspaceId, workspaceId));
    await db.insert(conversations).values({
      id: conversationId,
      workspaceId,
      type: "team",
      title: shortTitleSchema.parse(title?.trim() || "Team conversation"),
      createdBy: account.user.id,
    });
    if (enabled.length) {
      await db
        .insert(conversationParticipants)
        .values(enabled.map((item) => ({ conversationId, agentCode: item.agentCode })));
    }
    await recordEvent(db, account, {
      workspaceId,
      eventType: "conversation.created",
      entityType: "conversation",
      entityId: conversationId,
      payload: { participantCount: enabled.length },
    });
  });
  if (agentCode) {
    return withActor(account.user.id, async (db) =>
      ensureDirectConversation(db, account.user.id, workspaceId, agentCode),
    );
  }
  return conversationId;
}

export async function sendMessage(conversationId: string, content: string): Promise<string> {
  const account = await bootstrapAccount();
  const text = messageSchema.parse(content);
  return withActor(account.user.id, async (db) => {
    const conversation = (
      await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
    )[0];
    if (!conversation) throw new Error("Conversation not found.");
    await requireCapability(db, account.user.id, conversation.workspaceId, "conversation.write");
    const [recentRow] = await db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.authorId, account.user.id),
          sql`${messages.createdAt} >= ${new Date(Date.now() - 60_000)}`,
        ),
      );
    if ((recentRow?.value ?? 0) >= 30)
      throw new Error("Message rate limit reached. Try again in a minute.");

    const messageId = randomUUID();
    await db.insert(messages).values({
      id: messageId,
      conversationId,
      authorId: account.user.id,
      role: "user",
      kind: "message",
      content: text,
      status: "complete",
    });
    const runId = randomUUID();
    const agentCode: AgentCode = knownAgent(conversation.agentCode)
      ? conversation.agentCode
      : "jorge";
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
      safeDetail:
        "Your message is persisted. Configure a model provider before agent execution is enabled.",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      startedAt: new Date(),
    });
    await db.insert(messages).values({
      conversationId,
      role: "system",
      kind: "run_reference",
      agentCode,
      runId,
      content: "AI provider not configured. Your message is saved and this run is waiting.",
      status: "complete",
    });
    await recordEvent(db, account, {
      workspaceId: conversation.workspaceId,
      eventType: "message.created",
      entityType: "message",
      entityId: messageId,
    });
    await recordEvent(db, account, {
      workspaceId: conversation.workspaceId,
      eventType: "run.started",
      entityType: "run",
      entityId: runId,
      payload: { state: "waiting_provider", agent: agentCode },
      audit: true,
    });
    return runId;
  });
}

export async function createTask(input: {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: string;
  assignedAgent?: AgentCode | null;
  dueAt?: Date | null;
}): Promise<string> {
  const account = await bootstrapAccount();
  const title = shortTitleSchema.parse(input.title);
  const description = longTextSchema.parse(input.description ?? "");
  const requestedPriority = input.priority ?? "medium";
  const priority: TaskPriority = isTaskPriority(requestedPriority) ? requestedPriority : "medium";
  const taskId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "task.write");
    if (input.assignedAgent) await enabledAgent(db, input.workspaceId, input.assignedAgent);
    await db.insert(tasks).values({
      id: taskId,
      workspaceId: input.workspaceId,
      title,
      description,
      status: "backlog",
      priority,
      assignedAgent: input.assignedAgent ?? null,
      createdBy: account.user.id,
      dueAt: input.dueAt ?? null,
    });
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "task.created",
      entityType: "task",
      entityId: taskId,
      payload: { priority, assignedAgent: input.assignedAgent ?? null },
    });
  });
  return taskId;
}

export async function updateTask(input: {
  taskId: string;
  workspaceId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedAgent?: AgentCode | null;
}): Promise<void> {
  const account = await bootstrapAccount();
  const title = shortTitleSchema.parse(input.title);
  const description = longTextSchema.parse(input.description);
  const status = input.status;
  const priority = input.priority;
  if (!isTaskStatus(status)) throw new Error("Unknown task status.");
  if (!isTaskPriority(priority)) throw new Error("Unknown task priority.");
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "task.write");
    const current = (await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1))[0];
    if (!current || current.workspaceId !== input.workspaceId) throw new Error("Task not found.");
    if (!isTaskStatus(current.status)) throw new Error("Task has an invalid persisted status.");
    assertTaskTransition(current.status, status);
    if (input.assignedAgent) await enabledAgent(db, input.workspaceId, input.assignedAgent);
    await db
      .update(tasks)
      .set({
        title,
        description,
        status,
        priority,
        assignedAgent: input.assignedAgent ?? null,
        completedAt: status === "completed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId));
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "task.updated",
      entityType: "task",
      entityId: input.taskId,
      payload: { status, assignedAgent: input.assignedAgent ?? null },
    });
  });
}

export async function createPlan(input: {
  workspaceId: string;
  title: string;
  objective: string;
}): Promise<string> {
  const account = await bootstrapAccount();
  const planId = randomUUID();
  const title = shortTitleSchema.parse(input.title);
  const objective = workspaceObjectiveSchema.parse(input.objective);
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "plan.write");
    await db.insert(plans).values({
      id: planId,
      workspaceId: input.workspaceId,
      title,
      objective,
      status: "active",
      createdBy: account.user.id,
    });
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "plan.created",
      entityType: "plan",
      entityId: planId,
    });
  });
  return planId;
}

export async function addPlanStep(input: {
  workspaceId: string;
  planId: string;
  title: string;
  description?: string;
  assignedAgent?: AgentCode | null;
}): Promise<string> {
  const account = await bootstrapAccount();
  const stepId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "plan.write");
    const plan = (await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1))[0];
    if (!plan || plan.workspaceId !== input.workspaceId) throw new Error("Plan not found.");
    if (input.assignedAgent) await enabledAgent(db, input.workspaceId, input.assignedAgent);
    const [row] = await db
      .select({ value: count() })
      .from(planSteps)
      .where(eq(planSteps.planId, input.planId));
    const sequence = Number(row?.value ?? 0) + 1;
    await db.insert(planSteps).values({
      id: stepId,
      planId: input.planId,
      sequence,
      title: shortTitleSchema.parse(input.title),
      description: (input.description ?? "").trim().slice(0, 8_000),
      assignedAgent: input.assignedAgent ?? null,
    });
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "plan.step_created",
      entityType: "plan_step",
      entityId: stepId,
      payload: { planId: input.planId, sequence },
    });
  });
  return stepId;
}

export async function uploadWorkspaceFile(workspaceId: string, file: File): Promise<string> {
  const account = await bootstrapAccount();
  const filename = validateUpload({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  });
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const fileId = randomUUID();
  const storageKey = fileStorageKey(workspaceId, fileId);
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "file.write");
    await db.insert(workspaceFiles).values({
      id: fileId,
      organizationId: account.organizationId,
      workspaceId,
      uploadedBy: account.user.id,
      filename,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      storageKey,
      checksum,
    });
    await db.insert(fileObjects).values({
      fileId,
      workspaceId,
      contentBase64: bytes.toString("base64"),
    });
    await recordEvent(db, account, {
      workspaceId,
      eventType: "file.uploaded",
      entityType: "file",
      entityId: fileId,
      payload: { filename, size: file.size, contentType: file.type || "application/octet-stream" },
      audit: true,
    });
  });
  return fileId;
}

export async function getWorkspaceFile(fileId: string): Promise<{
  filename: string;
  contentType: string;
  checksum: string;
  body: Buffer;
}> {
  const account = await bootstrapAccount();
  return withActor(account.user.id, async (db) => {
    const file = (
      await db.select().from(workspaceFiles).where(eq(workspaceFiles.id, fileId)).limit(1)
    )[0];
    if (!file) throw new Error("File not found.");
    await requireCapability(db, account.user.id, file.workspaceId, "file.read");
    const object = (
      await db.select().from(fileObjects).where(eq(fileObjects.fileId, fileId)).limit(1)
    )[0];
    if (!object) throw new Error("Stored file content is unavailable.");
    return {
      filename: safeFileName(file.filename),
      contentType: file.contentType,
      checksum: file.checksum,
      body: Buffer.from(object.contentBase64, "base64"),
    };
  });
}

export async function createMemory(input: {
  workspaceId: string;
  type: string;
  title: string;
  content: string;
  sourceType?: string | null;
  sourceId?: string | null;
}): Promise<string> {
  const account = await bootstrapAccount();
  if (!isMemoryType(input.type)) throw new Error("Unknown memory type.");
  const memoryId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "memory.write");
    await db.insert(memoryEntries).values({
      id: memoryId,
      workspaceId: input.workspaceId,
      type: input.type,
      title: shortTitleSchema.parse(input.title),
      content: messageSchema.parse(input.content),
      sourceType: input.sourceType?.trim().slice(0, 80) || null,
      sourceId: input.sourceId?.trim().slice(0, 255) || null,
      createdBy: account.user.id,
    });
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: input.type === "decision" ? "decision.recorded" : "memory.created",
      entityType: "memory",
      entityId: memoryId,
      payload: { type: input.type },
    });
  });
  return memoryId;
}

export async function updateMemory(input: {
  workspaceId: string;
  memoryId: string;
  type: string;
  title: string;
  content: string;
}): Promise<void> {
  const account = await bootstrapAccount();
  if (!isMemoryType(input.type)) throw new Error("Unknown memory type.");
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "memory.write");
    await db
      .update(memoryEntries)
      .set({
        type: input.type,
        title: shortTitleSchema.parse(input.title),
        content: messageSchema.parse(input.content),
        updatedAt: new Date(),
      })
      .where(
        and(eq(memoryEntries.id, input.memoryId), eq(memoryEntries.workspaceId, input.workspaceId)),
      );
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "memory.updated",
      entityType: "memory",
      entityId: input.memoryId,
    });
  });
}

export async function archiveMemory(workspaceId: string, memoryId: string): Promise<void> {
  const account = await bootstrapAccount();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "memory.write");
    await db
      .update(memoryEntries)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(memoryEntries.id, memoryId), eq(memoryEntries.workspaceId, workspaceId)));
    await recordEvent(db, account, {
      workspaceId,
      eventType: "memory.archived",
      entityType: "memory",
      entityId: memoryId,
    });
  });
}

export async function createArtifact(input: {
  workspaceId: string;
  title: string;
  type: string;
  mimeType?: string | null;
  storageKey?: string | null;
  taskId?: string | null;
  runId?: string | null;
  conversationId?: string | null;
  creatingAgent?: AgentCode | null;
}): Promise<string> {
  const account = await bootstrapAccount();
  if (!isArtifactType(input.type)) throw new Error("Unknown artifact type.");
  const artifactId = randomUUID();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "artifact.write");
    await db.insert(artifacts).values({
      id: artifactId,
      workspaceId: input.workspaceId,
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      conversationId: input.conversationId ?? null,
      title: shortTitleSchema.parse(input.title),
      kind: input.type,
      mimeType: input.mimeType?.trim().slice(0, 200) || null,
      contentType: input.mimeType?.trim().slice(0, 200) || null,
      storageKey: input.storageKey?.trim().slice(0, 1000) || null,
      createdBy: account.user.id,
      creatingAgent: input.creatingAgent ?? null,
    });
    if (input.taskId) {
      await db
        .insert(taskArtifacts)
        .values({ taskId: input.taskId, artifactId })
        .onConflictDoNothing();
    }
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "artifact.created",
      entityType: "artifact",
      entityId: artifactId,
      payload: { type: input.type, creatingAgent: input.creatingAgent ?? null },
    });
  });
  return artifactId;
}

export async function linkTask(input: {
  workspaceId: string;
  taskId: string;
  conversationId?: string | null;
  runId?: string | null;
  artifactId?: string | null;
}): Promise<void> {
  const account = await bootstrapAccount();
  await withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, input.workspaceId, "task.write");
    const task = (await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1))[0];
    if (!task || task.workspaceId !== input.workspaceId) throw new Error("Task not found.");
    if (input.conversationId) {
      await db
        .insert(taskConversations)
        .values({ taskId: input.taskId, conversationId: input.conversationId })
        .onConflictDoNothing();
    }
    if (input.runId) {
      await db
        .insert(taskRuns)
        .values({ taskId: input.taskId, runId: input.runId })
        .onConflictDoNothing();
    }
    if (input.artifactId) {
      await db
        .insert(taskArtifacts)
        .values({ taskId: input.taskId, artifactId: input.artifactId })
        .onConflictDoNothing();
    }
  });
}

export async function updateWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
  role: string;
}): Promise<void> {
  const account = await bootstrapAccount();
  if (!isWorkspaceRole(input.role)) throw new Error("Unknown workspace role.");
  await withActor(account.user.id, async (db) => {
    const actorRole = await requireCapability(
      db,
      account.user.id,
      input.workspaceId,
      "member.manage",
    );
    if (input.role === "owner" && actorRole !== "owner")
      throw new Error("Only an owner can grant ownership.");
    const current = (
      await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, input.userId),
          ),
        )
        .limit(1)
    )[0];
    if (!current) {
      await db.insert(workspaceMembers).values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
      });
    } else {
      if (current.role === "owner" && actorRole !== "owner")
        throw new Error("Only an owner can change an owner.");
      await db
        .update(workspaceMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, input.userId),
          ),
        );
    }
    await recordEvent(db, account, {
      workspaceId: input.workspaceId,
      eventType: "member.updated",
      entityType: "workspace_member",
      entityId: input.userId,
      payload: { role: input.role },
      audit: true,
    });
  });
}

export async function getWorkspaceContext(workspaceId: string): Promise<WorkspaceContextSnapshot> {
  const account = await bootstrapAccount();
  return withActor(account.user.id, async (db) => {
    await requireCapability(db, account.user.id, workspaceId, "workspace.read");
    const workspace = (
      await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    )[0];
    if (!workspace) throw new Error("Workspace not found.");
    const activePlan = (
      await db
        .select()
        .from(plans)
        .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
        .orderBy(desc(plans.updatedAt))
        .limit(1)
    )[0];
    const assignedTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(desc(tasks.updatedAt))
      .limit(20);
    const importantMemory = await db
      .select()
      .from(memoryEntries)
      .where(and(eq(memoryEntries.workspaceId, workspaceId), isNull(memoryEntries.archivedAt)))
      .orderBy(desc(memoryEntries.updatedAt))
      .limit(20);
    const recentDecisions = importantMemory
      .filter((entry) => entry.type === "decision")
      .slice(0, 8);
    const relevantFiles = await db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.workspaceId, workspaceId))
      .orderBy(desc(workspaceFiles.createdAt))
      .limit(12);
    return {
      workspaceId,
      objective: workspace.objective,
      successCriteria: workspace.successCriteria,
      currentFocus: workspace.currentFocus,
      ...(activePlan
        ? {
            activePlan: {
              id: activePlan.id,
              title: activePlan.title,
              objective: activePlan.objective,
            },
          }
        : {}),
      assignedTasks: assignedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: isTaskStatus(task.status) ? task.status : "backlog",
        assignedAgent: knownAgent(task.assignedAgent) ? task.assignedAgent : null,
      })),
      importantMemory: importantMemory
        .filter((entry): entry is typeof entry & { type: MemoryType } => isMemoryType(entry.type))
        .map((entry) => ({
          id: entry.id,
          type: entry.type,
          title: entry.title,
          content: entry.content,
        })),
      recentDecisions: recentDecisions.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
      })),
      relevantFiles: relevantFiles.map((file) => ({
        id: file.id,
        filename: file.filename,
        contentType: file.contentType,
      })),
    };
  });
}

interface SearchItem {
  type: "workspace" | "conversation" | "message" | "task" | "plan" | "file" | "artifact" | "memory";
  id: string;
  workspaceId: string;
  title: string;
  detail: string;
}

async function searchWorkspace(
  db: ActorDatabase,
  workspaceId: string,
  rawQuery: string,
): Promise<SearchItem[]> {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < 2) return [];
  const match = (left: unknown) =>
    sql<boolean>`to_tsvector('simple', ${left}) @@ websearch_to_tsquery('simple', ${query})`;
  const [conversationRows, messageRows, taskRows, planRows, fileRows, artifactRows, memoryRows] =
    await Promise.all([
      db
        .select({ id: conversations.id, title: conversations.title })
        .from(conversations)
        .where(and(eq(conversations.workspaceId, workspaceId), match(conversations.title)))
        .limit(6),
      db
        .select({
          id: messages.id,
          content: messages.content,
          conversationId: messages.conversationId,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(and(eq(conversations.workspaceId, workspaceId), match(messages.content)))
        .limit(6),
      db
        .select({ id: tasks.id, title: tasks.title, description: tasks.description })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            match(sql`${tasks.title} || ' ' || ${tasks.description}`),
          ),
        )
        .limit(6),
      db
        .select({ id: plans.id, title: plans.title, objective: plans.objective })
        .from(plans)
        .where(
          and(
            eq(plans.workspaceId, workspaceId),
            match(sql`${plans.title} || ' ' || ${plans.objective}`),
          ),
        )
        .limit(6),
      db
        .select({
          id: workspaceFiles.id,
          filename: workspaceFiles.filename,
          contentType: workspaceFiles.contentType,
        })
        .from(workspaceFiles)
        .where(and(eq(workspaceFiles.workspaceId, workspaceId), match(workspaceFiles.filename)))
        .limit(6),
      db
        .select({ id: artifacts.id, title: artifacts.title, kind: artifacts.kind })
        .from(artifacts)
        .where(and(eq(artifacts.workspaceId, workspaceId), match(artifacts.title)))
        .limit(6),
      db
        .select({
          id: memoryEntries.id,
          title: memoryEntries.title,
          content: memoryEntries.content,
          type: memoryEntries.type,
        })
        .from(memoryEntries)
        .where(
          and(
            eq(memoryEntries.workspaceId, workspaceId),
            isNull(memoryEntries.archivedAt),
            match(sql`${memoryEntries.title} || ' ' || ${memoryEntries.content}`),
          ),
        )
        .limit(6),
    ]);
  return [
    ...conversationRows.map((row) => ({
      type: "conversation" as const,
      id: row.id,
      workspaceId,
      title: row.title,
      detail: "Conversation",
    })),
    ...messageRows.map((row) => ({
      type: "message" as const,
      id: row.id,
      workspaceId,
      title: row.content.slice(0, 100),
      detail: `Conversation ${row.conversationId.slice(0, 8)}`,
    })),
    ...taskRows.map((row) => ({
      type: "task" as const,
      id: row.id,
      workspaceId,
      title: row.title,
      detail: row.description.slice(0, 120),
    })),
    ...planRows.map((row) => ({
      type: "plan" as const,
      id: row.id,
      workspaceId,
      title: row.title,
      detail: row.objective.slice(0, 120),
    })),
    ...fileRows.map((row) => ({
      type: "file" as const,
      id: row.id,
      workspaceId,
      title: row.filename,
      detail: row.contentType,
    })),
    ...artifactRows.map((row) => ({
      type: "artifact" as const,
      id: row.id,
      workspaceId,
      title: row.title,
      detail: row.kind,
    })),
    ...memoryRows.map((row) => ({
      type: "memory" as const,
      id: row.id,
      workspaceId,
      title: row.title,
      detail: `${row.type} · ${row.content.slice(0, 100)}`,
    })),
  ];
}

async function globalSearch(
  db: ActorDatabase,
  allWorkspaces: readonly { id: string; name: string; description: string }[],
  rawQuery: string,
): Promise<SearchItem[]> {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < 2) return [];
  const lower = query.toLocaleLowerCase();
  const workspaceMatches: SearchItem[] = allWorkspaces
    .filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase().includes(lower))
    .slice(0, 6)
    .map((item) => ({
      type: "workspace",
      id: item.id,
      workspaceId: item.id,
      title: item.name,
      detail: item.description.slice(0, 120),
    }));
  const workspaceResults = await Promise.all(
    allWorkspaces.slice(0, 12).map((workspace) => searchWorkspace(db, workspace.id, query)),
  );
  return [...workspaceMatches, ...workspaceResults.flat()].slice(0, 40);
}

export async function workspacePageData(
  workspaceId?: string,
  conversationId?: string,
  view = "home",
  searchQuery = "",
) {
  const account = await bootstrapAccount();
  return withActor(account.user.id, async (db) => {
    const allWorkspaces = await db
      .select()
      .from(workspaces)
      .where(isNull(workspaces.archivedAt))
      .orderBy(desc(workspaces.updatedAt));
    const activeWorkspace = workspaceId
      ? allWorkspaces.find((item) => item.id === workspaceId)
      : allWorkspaces[0];
    if (!activeWorkspace) {
      return {
        account,
        view,
        searchQuery,
        workspaces: allWorkspaces,
        activeWorkspace: null,
        membershipRole: null,
        agents: [],
        conversations: [],
        participants: [],
        activeConversation: null,
        messages: [],
        runs: [],
        steps: [],
        tasks: [],
        plans: [],
        planSteps: [],
        files: [],
        artifacts: [],
        memory: [],
        decisions: [],
        activity: [],
        members: [],
        searchResults: [] as SearchItem[],
        globalSearchResults: [] as SearchItem[],
      };
    }
    const membershipRole = await requireCapability(
      db,
      account.user.id,
      activeWorkspace.id,
      "workspace.read",
    );
    const [
      enabled,
      templates,
      conversationRows,
      runRows,
      taskRows,
      planRows,
      fileRows,
      artifactRows,
      memoryRows,
      eventRows,
      memberRows,
    ] = await Promise.all([
      db.select().from(workspaceAgents).where(eq(workspaceAgents.workspaceId, activeWorkspace.id)),
      db.select().from(agentTemplates),
      db
        .select()
        .from(conversations)
        .where(eq(conversations.workspaceId, activeWorkspace.id))
        .orderBy(desc(conversations.updatedAt)),
      db
        .select()
        .from(runs)
        .where(eq(runs.workspaceId, activeWorkspace.id))
        .orderBy(desc(runs.createdAt))
        .limit(30),
      db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, activeWorkspace.id))
        .orderBy(desc(tasks.updatedAt))
        .limit(100),
      db
        .select()
        .from(plans)
        .where(eq(plans.workspaceId, activeWorkspace.id))
        .orderBy(desc(plans.updatedAt))
        .limit(30),
      db
        .select()
        .from(workspaceFiles)
        .where(eq(workspaceFiles.workspaceId, activeWorkspace.id))
        .orderBy(desc(workspaceFiles.createdAt))
        .limit(50),
      db
        .select()
        .from(artifacts)
        .where(eq(artifacts.workspaceId, activeWorkspace.id))
        .orderBy(desc(artifacts.updatedAt))
        .limit(50),
      db
        .select()
        .from(memoryEntries)
        .where(
          and(eq(memoryEntries.workspaceId, activeWorkspace.id), isNull(memoryEntries.archivedAt)),
        )
        .orderBy(desc(memoryEntries.updatedAt))
        .limit(80),
      db
        .select()
        .from(workspaceEvents)
        .where(eq(workspaceEvents.workspaceId, activeWorkspace.id))
        .orderBy(desc(workspaceEvents.createdAt))
        .limit(60),
      db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, activeWorkspace.id)),
    ]);

    const participantRows = conversationRows.length
      ? await db
          .select()
          .from(conversationParticipants)
          .where(
            inArray(
              conversationParticipants.conversationId,
              conversationRows.map((row) => row.id),
            ),
          )
      : [];
    const activeConversation = conversationId
      ? (conversationRows.find((item) => item.id === conversationId) ?? conversationRows[0])
      : conversationRows[0];
    const messageRows = activeConversation
      ? await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, activeConversation.id))
          .orderBy(asc(messages.createdAt))
      : [];
    const stepRows = runRows[0]
      ? await db
          .select()
          .from(runSteps)
          .where(eq(runSteps.runId, runRows[0].id))
          .orderBy(asc(runSteps.ordinal))
      : [];
    const activePlan = planRows.find((plan) => plan.status === "active") ?? planRows[0];
    const activePlanSteps = activePlan
      ? normalizeSequence(
          await db.select().from(planSteps).where(eq(planSteps.planId, activePlan.id)),
        )
      : [];
    const agentSet = new Set(enabled.map((item) => item.agentCode));
    const latestByAgent = new Map<string, (typeof runRows)[number]>();
    for (const run of runRows)
      if (!latestByAgent.has(run.agentCode)) latestByAgent.set(run.agentCode, run);
    const agents = templates.map((template) => ({
      ...template,
      enabled: agentSet.has(template.code),
      presence: deriveAgentPresence(latestByAgent.get(template.code)),
      currentRun: latestByAgent.get(template.code) ?? null,
    }));
    const memberUserIds = memberRows.map((member) => member.userId);
    const visibleUsers = memberUserIds.length
      ? await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(inArray(users.id, memberUserIds))
      : [];
    const userMap = new Map(visibleUsers.map((user) => [user.id, user]));
    const members = memberRows.map((member) => ({
      ...member,
      user: userMap.get(member.userId) ?? null,
    }));
    const searchResults = await searchWorkspace(db, activeWorkspace.id, searchQuery);
    const globalSearchResults = await globalSearch(db, allWorkspaces, searchQuery);
    return {
      account,
      view,
      searchQuery,
      workspaces: allWorkspaces,
      activeWorkspace,
      membershipRole,
      agents,
      conversations: conversationRows,
      participants: participantRows,
      activeConversation: activeConversation ?? null,
      messages: messageRows,
      runs: runRows.slice(0, 12),
      steps: stepRows,
      tasks: taskRows,
      plans: planRows,
      activePlan: activePlan ?? null,
      planSteps: activePlanSteps,
      files: fileRows,
      artifacts: artifactRows,
      memory: memoryRows,
      decisions: memoryRows.filter((entry) => entry.type === "decision"),
      activity: eventRows,
      members,
      searchResults,
      globalSearchResults,
    };
  });
}

export async function createApiToken(input: {
  workspaceId?: string;
  label: string;
  scopes: readonly string[];
  expiresAt?: Date;
}) {
  const account = await bootstrapAccount();
  const token = createOpaqueToken();
  const id = randomUUID();
  await withActor(account.user.id, async (db) => {
    if (input.workspaceId) {
      await requireCapability(db, account.user.id, input.workspaceId, "workspace.manage");
    }
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
    await db.insert(auditEvents).values({
      organizationId: account.organizationId,
      workspaceId: input.workspaceId,
      actorId: account.user.id,
      action: "token.created",
      targetType: "api_token",
      targetId: id,
      metadata: { prefix: token.prefix, scopeCount: input.scopes.length },
    });
  });
  return { id, token: token.raw, prefix: token.prefix };
}

export type WorkspaceSearchItem = SearchItem;
export type WorkspacePageData = Awaited<ReturnType<typeof workspacePageData>>;
export type { ArtifactType, MemoryType, TaskStatus };
