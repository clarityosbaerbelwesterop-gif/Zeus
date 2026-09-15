import { z } from "zod";

export const idSchema = z.string().uuid();
export const externalUserIdSchema = z.string().min(1).max(255);
export const workspaceNameSchema = z.string().trim().min(1).max(120);
export const messageSchema = z.string().trim().min(1).max(20_000);
export const safeDescriptionSchema = z.string().trim().max(2_000);
export const workspaceObjectiveSchema = z.string().trim().max(12_000);
export const shortTitleSchema = z.string().trim().min(1).max(240);
export const longTextSchema = z.string().trim().max(12_000);
export const searchQuerySchema = z.string().trim().max(120);

export type RunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "waiting"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused"
  | "needs_user_input"
  | "needs_authorization";

export type RunStepStatus =
  "pending" | "running" | "waiting" | "completed" | "failed" | "skipped" | "cancelled";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
