"use server";

import type { AgentCode } from "@zeus/agents";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createConversation, createWorkspace, renameWorkspace, sendMessage, toggleWorkspaceAgent } from "@/lib/product";

const agentCodes = new Set<AgentCode>(["jorge", "kai", "lora", "simon", "sara"]);
function agent(value: FormDataEntryValue | null): AgentCode | null {
  const code = String(value ?? "");
  return agentCodes.has(code as AgentCode) ? (code as AgentCode) : null;
}

export async function createWorkspaceAction(formData: FormData) {
  const agents = formData.getAll("agents").map((value) => agent(value)).filter((value): value is AgentCode => Boolean(value));
  const id = await createWorkspace({ name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? ""), agents });
  redirect(`/app?workspace=${id}`);
}

export async function renameWorkspaceAction(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await renameWorkspace(workspaceId, String(formData.get("name") ?? ""));
  revalidatePath("/app");
}

export async function toggleAgentAction(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const code = agent(formData.get("agent"));
  if (!code) throw new Error("Unknown agent.");
  await toggleWorkspaceAgent(workspaceId, code, String(formData.get("enabled")) === "true");
  revalidatePath("/app");
}

export async function createConversationAction(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const code = agent(formData.get("agent"));
  const id = await createConversation(workspaceId, code);
  redirect(`/app?workspace=${workspaceId}&conversation=${id}`);
}

export async function sendMessageAction(formData: FormData) {
  const conversationId = String(formData.get("conversationId") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await sendMessage(conversationId, String(formData.get("message") ?? ""));
  redirect(`/app?workspace=${workspaceId}&conversation=${conversationId}`);
}
