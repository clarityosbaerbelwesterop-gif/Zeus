"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveAndRunBusinessAutopilot,
  draftBusinessAutopilot,
} from "@/lib/business-autopilot";

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function autopilotLocation(workspaceId: string): string {
  return `/app?workspace=${encodeURIComponent(workspaceId)}&view=autopilot`;
}

export async function draftBusinessAutopilotAction(formData: FormData) {
  const workspaceId = field(formData, "workspaceId");
  await draftBusinessAutopilot({
    workspaceId,
    businessName: field(formData, "businessName"),
    objective: field(formData, "objective"),
  });
  revalidatePath("/app");
  redirect(autopilotLocation(workspaceId));
}

export async function approveBusinessAutopilotAction(formData: FormData) {
  const workspaceId = field(formData, "workspaceId");
  await approveAndRunBusinessAutopilot({
    workspaceId,
    planId: field(formData, "planId"),
    teamRunId: field(formData, "teamRunId"),
  });
  revalidatePath("/app");
  redirect(autopilotLocation(workspaceId));
}
