"use server";

import type { AgentCode } from "@zeus/agents";
import { requireSession } from "@zeus/auth/server";
import {
  isDealStage,
  isMemoryType,
  isTaskPriority,
  isTaskStatus,
  isWorkspaceRole,
} from "@zeus/workspace";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseFormValueCents } from "@/lib/crm-copy";
import { assertTrustedMutationOrigin } from "@/lib/trusted-origin";
import { approveAndExecuteRepositoryChangeRequest } from "@/lib/kai-coding-tools";
import {
  retryAgentRun,
  sendConversationMessageAndRun,
  startDealAgentRun,
  startTaskRun,
  stopAgentRun,
} from "@/lib/agent-runtime";
import {
  addPlanStep,
  archiveMemory,
  archiveWorkspace,
  createApiToken,
  createArtifact,
  createConversation,
  createDeal,
  createMemory,
  createPlan,
  createTask,
  createWorkspace,
  deleteIntegrationConnection,
  revokeApiToken,
  saveIntegrationConnection,
  saveUserPreferences,
  sendDealThreadMessage,
  setSkillLifecycle,
  testIntegrationConnection,
  toggleWorkspaceAgent,
  updateDealStage,
  updateMemory,
  updateTask,
  updateWorkspace,
  updateWorkspaceMember,
  uploadWorkspaceFile,
} from "@/lib/product";

const agentCodes = new Set<AgentCode>(["jorge", "kai", "lora", "simon", "sara"]);

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalField(formData: FormData, key: string): string | null {
  const value = field(formData, key).trim();
  return value ? value : null;
}

function agent(value: FormDataEntryValue | null): AgentCode | null {
  if (typeof value !== "string") return null;
  return agentCodes.has(value as AgentCode) ? (value as AgentCode) : null;
}

function workspaceLocation(
  workspaceId: string,
  view?: string,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams({ workspace: workspaceId });
  if (view) params.set("view", view);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `/app?${params.toString()}`;
}

function dealRoomLocation(workspaceId: string, dealId: string, view?: string): string {
  return workspaceLocation(workspaceId, view || "deal-room", { deal: dealId });
}

export async function createWorkspaceAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const agents = formData
    .getAll("agents")
    .map((value) => agent(value))
    .filter((value): value is AgentCode => Boolean(value));
  const id = await createWorkspace({
    name: field(formData, "name"),
    description: field(formData, "description"),
    objective: field(formData, "objective"),
    agents,
  });
  redirect(workspaceLocation(id));
}

export async function updateWorkspaceAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await updateWorkspace(workspaceId, {
    name: field(formData, "name"),
    description: field(formData, "description"),
    objective: field(formData, "objective"),
    successCriteria: field(formData, "successCriteria"),
    currentFocus: field(formData, "currentFocus"),
    status: field(formData, "status"),
    priority: field(formData, "priority"),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function archiveWorkspaceAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await archiveWorkspace(workspaceId, field(formData, "confirmation"));
  revalidatePath("/app");
  redirect("/app");
}

export async function toggleAgentAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const code = agent(formData.get("agent"));
  if (!code) throw new Error("Unknown agent.");
  await toggleWorkspaceAgent(workspaceId, code, field(formData, "enabled") === "true");
  revalidatePath("/app");
}

export async function createConversationAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const code = agent(formData.get("agent"));
  const id = await createConversation(
    workspaceId,
    code,
    optionalField(formData, "title") ?? undefined,
  );
  redirect(`/app?workspace=${workspaceId}&conversation=${id}`);
}

export async function sendMessageAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const conversationId = field(formData, "conversationId");
  const workspaceId = field(formData, "workspaceId");
  await sendConversationMessageAndRun(conversationId, field(formData, "message"));
  revalidatePath("/app");
  redirect(`/app?workspace=${workspaceId}&conversation=${conversationId}`);
}

export async function runTaskAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await startTaskRun(workspaceId, field(formData, "taskId"));
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "tasks"));
}

export async function stopRunAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await stopAgentRun(field(formData, "runId"));
  revalidatePath("/app");
  const dealId = optionalField(formData, "dealId");
  if (dealId) {
    redirect(dealRoomLocation(workspaceId, dealId, optionalField(formData, "view") ?? undefined));
  }
  const conversationId = optionalField(formData, "conversationId");
  if (conversationId) redirect(`/app?workspace=${workspaceId}&conversation=${conversationId}`);
  redirect(workspaceLocation(workspaceId, optionalField(formData, "view") ?? undefined));
}

export async function retryRunAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await retryAgentRun(field(formData, "runId"));
  revalidatePath("/app");
  const dealId = optionalField(formData, "dealId");
  if (dealId) {
    redirect(dealRoomLocation(workspaceId, dealId, optionalField(formData, "view") ?? undefined));
  }
  const conversationId = optionalField(formData, "conversationId");
  if (conversationId) redirect(`/app?workspace=${workspaceId}&conversation=${conversationId}`);
  redirect(workspaceLocation(workspaceId, optionalField(formData, "view") ?? undefined));
}

export async function createDealAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const title = field(formData, "title");
  const valueCents = parseFormValueCents(field(formData, "value"));
  const conversationId = await createConversation(workspaceId, null, title);
  const dealId = await createDeal({
    workspaceId,
    title,
    ownerUserId: optionalField(formData, "ownerUserId"),
    conversationId,
    valueCents,
    currency: valueCents === null ? null : "EUR",
  });
  revalidatePath("/app");
  redirect(dealRoomLocation(workspaceId, dealId));
}

export async function updateDealStageAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const dealId = field(formData, "dealId");
  const stage = field(formData, "stage");
  if (!isDealStage(stage)) throw new Error("Unknown deal stage.");
  await updateDealStage({ dealId, workspaceId, stage });
  revalidatePath("/app");
  const view = optionalField(formData, "view");
  if (view === "deal-room") redirect(dealRoomLocation(workspaceId, dealId));
  redirect(workspaceLocation(workspaceId, "pipeline"));
}

export async function sendDealMessageAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const dealId = field(formData, "dealId");
  await sendDealThreadMessage({
    workspaceId,
    dealId,
    conversationId: field(formData, "conversationId"),
    content: field(formData, "message"),
  });
  revalidatePath("/app");
  redirect(dealRoomLocation(workspaceId, dealId));
}

export async function startDealAgentRunAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const dealId = field(formData, "dealId");
  await startDealAgentRun(
    workspaceId,
    dealId,
    field(formData, "instruction"),
    agent(formData.get("agentCode")),
  );
  revalidatePath("/app");
  redirect(dealRoomLocation(workspaceId, dealId));
}

export async function createTaskAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const priority = field(formData, "priority");
  await createTask({
    workspaceId,
    title: field(formData, "title"),
    description: field(formData, "description"),
    priority: isTaskPriority(priority) ? priority : "medium",
    assignedAgent: agent(formData.get("assignedAgent")),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "tasks"));
}

export async function updateTaskAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const status = field(formData, "status");
  const priority = field(formData, "priority");
  if (!isTaskStatus(status) || !isTaskPriority(priority)) throw new Error("Invalid task state.");
  await updateTask({
    taskId: field(formData, "taskId"),
    workspaceId,
    title: field(formData, "title"),
    description: field(formData, "description"),
    status,
    priority,
    assignedAgent: agent(formData.get("assignedAgent")),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "tasks"));
}

export async function createPlanAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const planId = await createPlan({
    workspaceId,
    title: field(formData, "title"),
    objective: field(formData, "objective"),
  });
  revalidatePath("/app");
  redirect(`${workspaceLocation(workspaceId, "plans")}&plan=${planId}`);
}

export async function addPlanStepAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await addPlanStep({
    workspaceId,
    planId: field(formData, "planId"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    assignedAgent: agent(formData.get("assignedAgent")),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "plans"));
}

export async function uploadFileAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const value = formData.get("file");
  if (!(value instanceof File)) throw new Error("Choose a file to upload.");
  await uploadWorkspaceFile(workspaceId, value);
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "files"));
}

export async function createMemoryAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const type = field(formData, "type");
  if (!isMemoryType(type)) throw new Error("Unknown memory type.");
  await createMemory({
    workspaceId,
    type,
    title: field(formData, "title"),
    content: field(formData, "content"),
    sourceType: optionalField(formData, "sourceType"),
    sourceId: optionalField(formData, "sourceId"),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "memory"));
}

export async function updateMemoryAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const type = field(formData, "type");
  if (!isMemoryType(type)) throw new Error("Unknown memory type.");
  await updateMemory({
    workspaceId,
    memoryId: field(formData, "memoryId"),
    type,
    title: field(formData, "title"),
    content: field(formData, "content"),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "memory"));
}

export async function archiveMemoryAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await archiveMemory(workspaceId, field(formData, "memoryId"));
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "memory"));
}

export async function createArtifactAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  await createArtifact({
    workspaceId,
    title: field(formData, "title"),
    type: field(formData, "type"),
    mimeType: optionalField(formData, "mimeType"),
    storageKey: optionalField(formData, "storageKey"),
    taskId: optionalField(formData, "taskId"),
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "artifacts"));
}

export async function updateWorkspaceMemberAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const role = field(formData, "role");
  if (!isWorkspaceRole(role)) throw new Error("Unknown workspace role.");
  await updateWorkspaceMember({ workspaceId, userId: field(formData, "userId"), role });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function approveRepositoryChangeAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const requestId = field(formData, "requestId");
  const session = await requireSession();
  await approveAndExecuteRepositoryChangeRequest(String(session.user.id), requestId);
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, field(formData, "view") || "chat"));
}

export async function saveUserPreferencesAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const defaultAgentRaw = field(formData, "defaultAgent");
  const defaultAgent: AgentCode = agentCodes.has(defaultAgentRaw as AgentCode)
    ? (defaultAgentRaw as AgentCode)
    : "jorge";

  await saveUserPreferences({
    workspaceId,
    name: field(formData, "name"),
    roleTitle: field(formData, "roleTitle"),
    theme: (field(formData, "theme") as "system" | "light" | "dark") || "system",
    density: (field(formData, "density") as "comfortable" | "compact") || "comfortable",
    codeFont: (field(formData, "codeFont") as "jetbrains" | "fira" | "geist") || "jetbrains",
    defaultAgent,
    streamingEnabled:
      formData.get("streamingEnabled") === "on" || formData.get("streamingEnabled") === "true",
    autoVerifyCode:
      formData.get("autoVerifyCode") === "on" || formData.get("autoVerifyCode") === "true",
    soundAlerts: formData.get("soundAlerts") === "on" || formData.get("soundAlerts") === "true",
    requireSideEffectConfirmation:
      formData.get("requireSideEffectConfirmation") === "on" ||
      formData.get("requireSideEffectConfirmation") === "true",
    telemetrySharing:
      formData.get("telemetrySharing") === "on" || formData.get("telemetrySharing") === "true",
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function saveIntegrationConnectionAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const connectionId = optionalField(formData, "connectionId") ?? undefined;
  const provider = field(formData, "provider");
  const kind = field(formData, "kind") || "api_key";
  const secret = field(formData, "secret");
  const scopesRaw = field(formData, "scopes");
  const scopes = scopesRaw
    ? scopesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  await saveIntegrationConnection({
    workspaceId,
    connectionId,
    provider,
    kind,
    secret: secret || undefined,
    scopes,
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function testIntegrationConnectionAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const connectionId = field(formData, "connectionId");
  const result = await testIntegrationConnection({ workspaceId, connectionId });
  revalidatePath("/app");
  return result;
}

export async function deleteIntegrationConnectionAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const connectionId = field(formData, "connectionId");
  await deleteIntegrationConnection({ workspaceId, connectionId });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function createApiTokenAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const label = field(formData, "label") || "Default Access Token";
  const scopesRaw = field(formData, "scopes");
  const scopes = scopesRaw
    ? scopesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : ["workspace.read"];
  const expiresDays = parseInt(field(formData, "expiresDays") || "90", 10);
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

  await createApiToken({
    workspaceId: workspaceId || undefined,
    label,
    scopes,
    expiresAt,
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function revokeApiTokenAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const tokenId = field(formData, "tokenId");
  await revokeApiToken({ workspaceId, tokenId });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}

export async function setSkillLifecycleAction(formData: FormData) {
  await assertTrustedMutationOrigin();
  const workspaceId = field(formData, "workspaceId");
  const decision = field(formData, "decision");
  if (!["review", "trust", "enable", "disable", "reject"].includes(decision)) {
    throw new Error("Unknown skill lifecycle decision.");
  }
  await setSkillLifecycle({
    workspaceId,
    skillId: field(formData, "skillId"),
    decision: decision as "review" | "trust" | "enable" | "disable" | "reject",
  });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "skills"));
}
