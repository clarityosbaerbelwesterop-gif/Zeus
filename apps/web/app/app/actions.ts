"use server";

import type { AgentCode } from "@zeus/agents";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createConversation,
  createWorkspace,
  renameWorkspace,
  sendMessage,
  toggleWorkspaceAgent,
} from "@/lib/product";

const agentCodes = new Set<AgentCode>(["jorge", "kai", "lora", "simon", "sara"]);

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function agent(value: FormDataEntryValue | null): AgentCode | null {
  if (typeof value !== "string") return null;
  return agentCodes.has(value as AgentCode) ? (value as AgentCode) : null;
}

export async function createWorkspaceAction(formData: FormData) {
  const agents = formData
    .getAll("agents")
    .map((value) => agent(value))
    .filter((value): value is AgentCode => Boolean(value));
  const id = await createWorkspace({
    name: field(formData, "name"),
    description: field(formData, "description"),
    agents,
  });
  redirect(`/app?workspace=${id}`);
}

export async function renameWorkspaceAction(formData: FormData) {
  const workspaceId = field(formData, "workspaceId");
  await renameWorkspace(workspaceId, field(formData, "name"));
  revalidatePath("/app");
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
  const id = await createConversation(workspaceId, code);
  redirect(`/app?workspace=${workspaceId}&conversation=${id}`);
}

export async function sendMessageAction(formData: FormData) {
  const conversationId = field(formData, "conversationId");
  const workspaceId = field(formData, "workspaceId");
  await sendMessage(conversationId, field(formData, "message"));
  redirect(`/app?workspace=${workspaceId}&conversation=${conversationId}`);
}
