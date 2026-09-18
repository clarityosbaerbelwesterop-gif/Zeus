import type { ToolSideEffect } from "./index";

export type MissionStatus =
  | "draft"
  | "planning"
  | "awaiting_approval"
  | "approved"
  | "running"
  | "blocked"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type SkillSource = "built_in" | "workspace" | "imported" | "generated";
export type SkillTrust = "untrusted" | "candidate" | "reviewed" | "trusted";
export type SkillTestStatus = "untested" | "passing" | "failing";
export type ActionRisk = "low" | "medium" | "high";

const MISSION_TRANSITIONS: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
  draft: ["planning", "cancelled"],
  planning: ["awaiting_approval", "blocked", "failed", "cancelled"],
  awaiting_approval: ["approved", "planning", "cancelled"],
  approved: ["running", "cancelled"],
  running: ["blocked", "verifying", "failed", "cancelled"],
  blocked: ["running", "planning", "failed", "cancelled"],
  verifying: ["completed", "running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function assertMissionTransition(from: MissionStatus, to: MissionStatus): void {
  if (!MISSION_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid mission transition: ${from} -> ${to}`);
  }
}

export function actionRiskForSideEffect(sideEffect: ToolSideEffect): ActionRisk {
  if (sideEffect <= 1) return "low";
  if (sideEffect === 2) return "medium";
  return "high";
}

export interface ApprovalPolicyInput {
  readonly sideEffect: ToolSideEffect;
  readonly mediumRiskAutoApproved: boolean;
  readonly matchingApprovalGranted: boolean;
}

export type ApprovalPolicyDecision =
  | { readonly allowed: true; readonly risk: ActionRisk; readonly approvalRequired: false }
  | {
      readonly allowed: false;
      readonly risk: Exclude<ActionRisk, "low">;
      readonly approvalRequired: true;
      readonly reason: "workspace_policy" | "explicit_approval";
    };

/**
 * Canonical V1 policy for consequential tool execution.
 * Low-risk actions may execute. Medium-risk actions require an explicit workspace policy.
 * High-risk actions always require a matching, already-granted approval.
 */
export function evaluateApprovalPolicy(input: ApprovalPolicyInput): ApprovalPolicyDecision {
  const risk = actionRiskForSideEffect(input.sideEffect);
  if (risk === "low") {
    return { allowed: true, risk, approvalRequired: false };
  }
  if (risk === "medium") {
    if (input.mediumRiskAutoApproved || input.matchingApprovalGranted) {
      return { allowed: true, risk, approvalRequired: false };
    }
    return {
      allowed: false,
      risk,
      approvalRequired: true,
      reason: "workspace_policy",
    };
  }
  if (input.matchingApprovalGranted) {
    return { allowed: true, risk, approvalRequired: false };
  }
  return {
    allowed: false,
    risk,
    approvalRequired: true,
    reason: "explicit_approval",
  };
}

export interface DelegationEnvelope {
  readonly allowedTools: readonly string[];
  readonly allowedConnections: readonly string[];
  readonly maximumSideEffect: ToolSideEffect;
  readonly maxToolCalls: number;
  readonly maxTokens?: number;
  readonly maxEstimatedCost?: number;
}

function isSubset(child: readonly string[], parent: readonly string[]): boolean {
  const parentSet = new Set(parent);
  return child.every((item) => parentSet.has(item));
}

function optionalBudgetWithin(child: number | undefined, parent: number | undefined): boolean {
  if (parent === undefined) return true;
  if (child === undefined) return false;
  return child <= parent;
}

/** Child workers inherit authority by narrowing only. */
export function assertDelegationNarrows(
  parent: DelegationEnvelope,
  child: DelegationEnvelope,
): void {
  if (!isSubset(child.allowedTools, parent.allowedTools)) {
    throw new Error("Child delegation expands tool permissions.");
  }
  if (!isSubset(child.allowedConnections, parent.allowedConnections)) {
    throw new Error("Child delegation expands connection permissions.");
  }
  if (child.maximumSideEffect > parent.maximumSideEffect) {
    throw new Error("Child delegation expands side-effect authority.");
  }
  if (child.maxToolCalls > parent.maxToolCalls) {
    throw new Error("Child delegation expands tool-call budget.");
  }
  if (!optionalBudgetWithin(child.maxTokens, parent.maxTokens)) {
    throw new Error("Child delegation expands token budget.");
  }
  if (!optionalBudgetWithin(child.maxEstimatedCost, parent.maxEstimatedCost)) {
    throw new Error("Child delegation expands cost budget.");
  }
}

export interface SkillDescriptor {
  readonly id: string;
  readonly slug: string;
  readonly version: number;
  readonly source: SkillSource;
  readonly trust: SkillTrust;
  readonly testStatus: SkillTestStatus;
  readonly enabled: boolean;
  readonly requiredTools: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly triggerTags: readonly string[];
}

export interface SkillDiscoveryInput {
  readonly tags: readonly string[];
  readonly availableTools: readonly string[];
  readonly grantedPermissions: readonly string[];
  readonly includeReviewed?: boolean;
}

/**
 * Progressive skill disclosure: only eligible, tested skills whose dependencies are present
 * can enter a run context. Untrusted/candidate generated skills are excluded by default.
 */
export function discoverSkills(
  skills: readonly SkillDescriptor[],
  input: SkillDiscoveryInput,
): readonly SkillDescriptor[] {
  const tags = new Set(input.tags);
  const tools = new Set(input.availableTools);
  const permissions = new Set(input.grantedPermissions);
  const acceptedTrust = input.includeReviewed
    ? new Set<SkillTrust>(["reviewed", "trusted"])
    : new Set<SkillTrust>(["trusted"]);

  return skills.filter((skill) => {
    if (!skill.enabled || skill.testStatus !== "passing" || !acceptedTrust.has(skill.trust)) {
      return false;
    }
    if (!skill.requiredTools.every((tool) => tools.has(tool))) return false;
    if (!skill.requiredPermissions.every((permission) => permissions.has(permission))) return false;
    if (skill.triggerTags.length === 0) return true;
    return skill.triggerTags.some((tag) => tags.has(tag));
  });
}

export interface GeneratedSkillCandidateInput {
  readonly id: string;
  readonly slug: string;
  readonly version?: number;
  readonly requiredTools?: readonly string[];
  readonly requiredPermissions?: readonly string[];
  readonly triggerTags?: readonly string[];
}

/** Generated procedures can be proposed, but never silently gain trust. */
export function createGeneratedSkillCandidate(
  input: GeneratedSkillCandidateInput,
): SkillDescriptor {
  return Object.freeze({
    id: input.id,
    slug: input.slug,
    version: input.version ?? 1,
    source: "generated" as const,
    trust: "candidate" as const,
    testStatus: "untested" as const,
    enabled: false,
    requiredTools: Object.freeze([...(input.requiredTools ?? [])]),
    requiredPermissions: Object.freeze([...(input.requiredPermissions ?? [])]),
    triggerTags: Object.freeze([...(input.triggerTags ?? [])]),
  });
}

export interface UntrustedToolResult {
  readonly source: "tool";
  readonly toolId: string;
  readonly invocationId: string;
  readonly content: unknown;
  readonly trustedForPolicy: false;
}

/** Tool-returned content is data, never authority. */
export function wrapUntrustedToolResult(
  toolId: string,
  invocationId: string,
  content: unknown,
): UntrustedToolResult {
  return Object.freeze({
    source: "tool" as const,
    toolId,
    invocationId,
    content,
    trustedForPolicy: false as const,
  });
}
