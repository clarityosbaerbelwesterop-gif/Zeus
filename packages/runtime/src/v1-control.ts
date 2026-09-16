export type MissionStatus =
  | "draft"
  | "planning"
  | "awaiting_approval"
  | "approved"
  | "running"
  | "verifying"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

const MISSION_TRANSITIONS: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
  draft: ["planning", "cancelled"],
  planning: ["awaiting_approval", "blocked", "cancelled"],
  awaiting_approval: ["approved", "planning", "cancelled"],
  approved: ["running", "cancelled"],
  running: ["verifying", "blocked", "failed", "cancelled"],
  verifying: ["completed", "running", "blocked", "failed", "cancelled"],
  completed: [],
  blocked: ["planning", "running", "cancelled"],
  failed: ["planning", "cancelled"],
  cancelled: [],
};

export function assertMissionTransition(from: MissionStatus, to: MissionStatus): void {
  if (!MISSION_TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal mission transition: ${from} -> ${to}`);
  }
}

export type ActionRisk = "low" | "medium" | "high";

export interface ActionRiskInput {
  readonly action: string;
  readonly sideEffectLevel: 0 | 1 | 2 | 3 | 4;
  readonly external?: boolean;
  readonly destructive?: boolean;
  readonly spendsMoney?: boolean;
  readonly legalCommitment?: boolean;
  readonly publishesPublicly?: boolean;
  readonly sendsAsUser?: boolean;
  readonly credentialMutation?: boolean;
  readonly productionMutation?: boolean;
  readonly reversible?: boolean;
}

export interface WorkspaceAutonomyPolicy {
  readonly mediumRiskAllowed: boolean;
  readonly maximumAutomaticSideEffect: 0 | 1 | 2 | 3 | 4;
}

export function classifyActionRisk(input: ActionRiskInput): ActionRisk {
  if (
    input.destructive ||
    input.spendsMoney ||
    input.legalCommitment ||
    input.publishesPublicly ||
    input.sendsAsUser ||
    input.credentialMutation ||
    (input.productionMutation && input.reversible !== true) ||
    input.sideEffectLevel >= 4
  ) {
    return "high";
  }
  if (input.external || input.productionMutation || input.sideEffectLevel >= 2) return "medium";
  return "low";
}

export function requiresApproval(
  input: ActionRiskInput,
  policy: WorkspaceAutonomyPolicy,
): boolean {
  const risk = classifyActionRisk(input);
  if (risk === "high") return true;
  if (input.sideEffectLevel > policy.maximumAutomaticSideEffect) return true;
  return risk === "medium" && !policy.mediumRiskAllowed;
}

export interface ApprovalEnvelope {
  readonly what: string;
  readonly why: string;
  readonly impact: string;
  readonly target: string;
  readonly agent: string;
  readonly risk: ActionRisk;
  readonly rollbackPossible: boolean;
}

export function buildApprovalEnvelope(
  action: ActionRiskInput,
  detail: Omit<ApprovalEnvelope, "risk">,
): ApprovalEnvelope {
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === "string" && value.trim().length === 0) {
      throw new Error(`Approval ${key} must not be empty.`);
    }
  }
  return { ...detail, risk: classifyActionRisk(action) };
}

export interface SkillDescriptor {
  readonly id: string;
  readonly slug: string;
  readonly scope: "built_in" | "workspace" | "imported" | "generated";
  readonly status: "candidate" | "validated" | "active" | "disabled" | "rejected";
  readonly trustLevel: "system" | "reviewed" | "untrusted";
  readonly triggerKeywords: readonly string[];
  readonly requiredTools: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly testStatus: "pending" | "passed" | "failed";
  readonly securityStatus: "pending" | "passed" | "failed";
}

export interface SkillDiscoveryInput {
  readonly taskText: string;
  readonly availableTools: ReadonlySet<string>;
  readonly permissions: ReadonlySet<string>;
  readonly maximumSkills?: number;
}

function isSubset(values: readonly string[], available: ReadonlySet<string>): boolean {
  return values.every((value) => available.has(value));
}

export function canActivateSkill(skill: SkillDescriptor): boolean {
  if (skill.status !== "active") return false;
  if (skill.testStatus !== "passed" || skill.securityStatus !== "passed") return false;
  if (skill.scope === "generated" && skill.trustLevel !== "reviewed") return false;
  return skill.trustLevel === "system" || skill.trustLevel === "reviewed";
}

export function discoverSkills(
  skills: readonly SkillDescriptor[],
  input: SkillDiscoveryInput,
): readonly SkillDescriptor[] {
  const text = input.taskText.toLocaleLowerCase();
  const limit = Math.min(Math.max(input.maximumSkills ?? 5, 1), 12);
  return skills
    .filter(canActivateSkill)
    .filter((skill) => isSubset(skill.requiredTools, input.availableTools))
    .filter((skill) => isSubset(skill.requiredPermissions, input.permissions))
    .map((skill) => ({
      skill,
      score: skill.triggerKeywords.reduce(
        (total, keyword) => total + (text.includes(keyword.toLocaleLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ skill, score }) => score > 0 || skill.triggerKeywords.length === 0)
    .sort((left, right) => right.score - left.score || left.skill.slug.localeCompare(right.skill.slug))
    .slice(0, limit)
    .map(({ skill }) => skill);
}

export interface MemoryProvenance {
  readonly source: string;
  readonly observedAt: string;
  readonly runId?: string;
  readonly taskId?: string;
}

export interface MemoryCandidate {
  readonly title: string;
  readonly content: string;
  readonly scope: "run" | "project" | "company" | "user" | "procedure" | "workspace";
  readonly confidence: number | null;
  readonly provenance: MemoryProvenance;
  readonly validationStatus: "candidate";
}

export interface ValidatedMemory extends Omit<MemoryCandidate, "validationStatus"> {
  readonly validationStatus: "validated";
  readonly validatedBy: string;
}

export function createMemoryCandidate(
  input: Omit<MemoryCandidate, "validationStatus">,
): MemoryCandidate {
  if (!input.title.trim() || !input.content.trim()) throw new Error("Memory content is required.");
  if (!input.provenance.source.trim() || !input.provenance.observedAt.trim()) {
    throw new Error("Memory provenance is required.");
  }
  if (input.confidence !== null && (input.confidence < 0 || input.confidence > 1)) {
    throw new Error("Memory confidence must be between 0 and 1.");
  }
  return { ...input, validationStatus: "candidate" };
}

export function validateMemoryCandidate(
  candidate: MemoryCandidate,
  validatedBy: string,
): ValidatedMemory {
  if (!validatedBy.trim()) throw new Error("A memory validator is required.");
  return { ...candidate, validationStatus: "validated", validatedBy };
}

export interface ChildDelegation {
  readonly permissions: readonly string[];
  readonly toolIds: readonly string[];
  readonly budgetUnits: number;
  readonly maximumConcurrency: number;
}

export function narrowChildDelegation(
  parent: ChildDelegation,
  requested: ChildDelegation,
): ChildDelegation {
  const parentPermissions = new Set(parent.permissions);
  const parentTools = new Set(parent.toolIds);
  if (!isSubset(requested.permissions, parentPermissions)) {
    throw new Error("Child agent permission escalation denied.");
  }
  if (!isSubset(requested.toolIds, parentTools)) {
    throw new Error("Child agent tool escalation denied.");
  }
  if (requested.budgetUnits < 0 || requested.budgetUnits > parent.budgetUnits) {
    throw new Error("Child agent budget escalation denied.");
  }
  if (
    requested.maximumConcurrency < 1 ||
    requested.maximumConcurrency > parent.maximumConcurrency ||
    requested.maximumConcurrency > 5
  ) {
    throw new Error("Child agent concurrency escalation denied.");
  }
  return {
    permissions: [...requested.permissions],
    toolIds: [...requested.toolIds],
    budgetUnits: requested.budgetUnits,
    maximumConcurrency: requested.maximumConcurrency,
  };
}

export interface ExecutionLimits {
  readonly timeoutMs: number;
  readonly cpuUnits: number;
  readonly memoryMb: number;
  readonly network: "none" | "allowlist" | "open";
  readonly allowedHosts?: readonly string[];
}

export interface ExecutionRequest {
  readonly workspaceId: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly limits: ExecutionLimits;
}

export interface ExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly artifactPaths: readonly string[];
}

export interface ExecutionBackend {
  readonly id: string;
  readonly isolated: boolean;
  isAvailable(): Promise<boolean>;
  execute(request: ExecutionRequest, signal: AbortSignal): Promise<ExecutionResult>;
  teardown(workspaceId: string): Promise<void>;
}

export class UnavailableExecutionBackend implements ExecutionBackend {
  readonly id = "unavailable";
  readonly isolated = true;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async execute(_request: ExecutionRequest, _signal: AbortSignal): Promise<ExecutionResult> {
    throw new Error("No verified isolated execution backend is configured.");
  }

  async teardown(_workspaceId: string): Promise<void> {
    return Promise.resolve();
  }
}
