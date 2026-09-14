"use server";

import type { AgentCode } from "@zeus/agents";
import { isMemoryType, isTaskPriority, isTaskStatus, isWorkspaceRole } from "@zeus/workspace";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addPlanStep,
  archiveMemory,
  archiveWorkspace,
  createArtifact,
  createConversation,
  createMemory,
  createPlan,
  createTask,
  createWorkspace,
  sendMessage,
  toggleWorkspaceAgent,
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

function workspaceLocation(workspaceId: string, view?: string): string {
  const params = new URLSearchParams({ workspace: workspaceId });
  if (view) params.set("view", view);
  return `/app?${params.toString()}`;
}

export async function createWorkspaceAction(formData: FormData) {
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
  const workspaceId = field(formData, "workspaceId");
  await archiveWorkspace(workspaceId, field(formData, "confirmation"));
  revalidatePath("/app");
  redirect("/app");
}

export async function toggleAgentAction(formData: FormData) {
  const workspaceId = field(formData, "workspaceId");
  const code = agent(formData.get("agent"));
  if (!code) throw new Error("Unknown agent.");
  await toggleWorkspaceAgent(workspaceId, code, field(formData, "enabled") === "true");
  revalidatePath("/app");
}

export async function createConversationAction(formData: FormData) {
  const workspaceId = field(formData, "workspaceId");
  const code = agent(formData.get("agent"));
  const id = await createConversation(workspaceId, code, optionalField(formData, "title") ?? undefined);
  redirect(`/app?workspace=${workspaceId}&conversation=${id}`);
}

export async function sendMessageAction(formData: FormData) {
  const conversationId = field(formData, "conversationId");
  const workspaceId = field(formData, "workspaceId");
  await sendMessage(conversationId, field(formData, "message"));
  redirect(`/app?workspace=${workspaceId}&conversation=${conversationId}`);
}

export async function createTaskAction(formData: FormData) {
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
  const workspaceId = field(formData, "workspaceId");
  const value = formData.get("file");
  if (!(value instanceof File)) throw new Error("Choose a file to upload.");
  await uploadWorkspaceFile(workspaceId, value);
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "files"));
}

export async function createMemoryAction(formData: FormData) {
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
  const workspaceId = field(formData, "workspaceId");
  await archiveMemory(workspaceId, field(formData, "memoryId"));
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "memory"));
}

export async function createArtifactAction(formData: FormData) {
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
  const workspaceId = field(formData, "workspaceId");
  const role = field(formData, "role");
  if (!isWorkspaceRole(role)) throw new Error("Unknown workspace role.");
  await updateWorkspaceMember({ workspaceId, userId: field(formData, "userId"), role });
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, "settings"));
}
