import { z } from "zod";

export const idSchema = z.string().uuid();
export const externalUserIdSchema = z.string().min(1).max(255);
export const workspaceNameSchema = z.string().trim().min(1).max(120);
export const messageSchema = z.string().trim().min(1).max(20_000);
export const safeDescriptionSchema = z.string().trim().max(2_000);

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export type WorkspaceRole = "owner" | "admin" | "member";

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
