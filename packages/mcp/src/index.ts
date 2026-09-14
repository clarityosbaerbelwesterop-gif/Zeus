export type ConnectionProvider =
  "github" | "google_workspace" | "linkedin" | "neon" | "vercel" | "custom";
export type ConnectionStatus = "connected" | "needs_authorization" | "error" | "revoked";
export type ConnectionKind = "oauth" | "api_key" | "mcp";

export interface ConnectionDescriptor {
  readonly provider: ConnectionProvider;
  readonly kind: ConnectionKind;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly status: ConnectionStatus;
  readonly scopes: readonly string[];
  readonly secretRef: string | null;
}

export interface ToolDescriptor {
  readonly name: string;
  readonly provider: ConnectionProvider;
  readonly risk: "low" | "medium" | "high";
  readonly sideEffecting: boolean;
}

export interface ConnectionRegistry {
  list(workspaceId: string): Promise<readonly ConnectionDescriptor[]>;
  tools(connectionId: string): Promise<readonly ToolDescriptor[]>;
}
