export interface ExecutionEnvironment {
  readonly id: string;
  readonly kind: string;
}

export interface SandboxProvider {
  create(input: {
    readonly workspaceId: string;
    readonly runId: string;
  }): Promise<ExecutionEnvironment>;
  destroy(environment: ExecutionEnvironment): Promise<void>;
}

export interface RepositoryTool {
  readonly repositoryId: string;
  readonly readOnly: boolean;
}

export interface FileWorkspace {
  readonly workspaceId: string;
  readonly root: string;
}

export interface RuntimeDelegationHook {
  delegate(input: {
    readonly parentRunId: string;
    readonly objective: string;
    readonly agent: string;
  }): Promise<{ readonly childRunId: string }>;
}

export class SandboxNotAvailableError extends Error {
  constructor() {
    super("Sandbox execution belongs to PRODUCT M4 and is not available in M3.");
    this.name = "SandboxNotAvailableError";
  }
}
