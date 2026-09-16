export type AgentCode = "jorge" | "kai" | "lora" | "simon" | "sara";

export interface AgentTemplate {
  readonly code: AgentCode;
  readonly name: string;
  readonly role: string;
  readonly purpose: string;
  readonly accent: string;
  readonly responsibilities: readonly string[];
}

export const AGENT_TEMPLATES: readonly AgentTemplate[] = Object.freeze([
  {
    code: "kai",
    name: "Kai",
    role: "Management / Orchestration",
    purpose: "Turns approved outcomes into coordinated, durable execution across the Zeus team.",
    accent: "#547a91",
    responsibilities: [
      "objective framing",
      "planning",
      "task graphs",
      "delegation",
      "coordination",
      "progress reporting",
      "escalation",
    ],
  },
  {
    code: "lora",
    name: "Lora",
    role: "Engineering",
    purpose: "Builds and repairs software with durable execution and verification evidence.",
    accent: "#9a78a9",
    responsibilities: [
      "implementation",
      "debugging",
      "architecture",
      "refactoring",
      "repository work",
      "code review",
      "deployment preparation",
    ],
  },
  {
    code: "jorge",
    name: "Jorge",
    role: "Design / Product",
    purpose: "Shapes product direction, customer journeys, interfaces and product decisions.",
    accent: "#c77955",
    responsibilities: [
      "product strategy",
      "product design",
      "UI",
      "UX",
      "information architecture",
      "interaction design",
      "visual QA",
    ],
  },
  {
    code: "simon",
    name: "Simon",
    role: "QA / Research / Verification",
    purpose: "Finds failure modes, researches evidence and proves that work is safe enough to ship.",
    accent: "#5f7f72",
    responsibilities: [
      "testing",
      "research",
      "regression analysis",
      "browser testing",
      "security testing",
      "source verification",
      "vulnerability remediation",
    ],
  },
  {
    code: "sara",
    name: "Sara",
    role: "Growth / Sales / Operations",
    purpose: "Prepares commercial execution, growth work, support workflows and operating follow-through.",
    accent: "#b58a45",
    responsibilities: [
      "prospect research",
      "sales preparation",
      "growth operations",
      "support preparation",
      "CRM workflows",
      "outbound drafts",
      "qualification",
      "follow-ups",
    ],
  },
]);

export type AgentContextCategory =
  | "request"
  | "policy"
  | "task"
  | "workspace"
  | "memory"
  | "conversation"
  | "artifacts";
export type AgentPermissionMode = "read_only" | "supervised" | "autonomous";

export interface AgentCompletionRequirement {
  readonly toolId: string;
  readonly recoveryInstructions: string;
}

export interface AgentRuntimePolicy {
  readonly instructions: string;
  readonly allowedTools: readonly string[];
  readonly deniedTools: readonly string[];
  readonly maximumSideEffect: 0 | 1 | 2 | 3 | 4;
  readonly permissionMode: AgentPermissionMode;
  readonly contextCategories: readonly AgentContextCategory[];
  readonly verification: "deterministic";
  readonly completionRequirement?: AgentCompletionRequirement;
}

const commonReadTools = [
  "workspace.read",
  "tasks.list",
  "tasks.get",
  "plans.list",
  "plans.get",
  "memory.search",
  "memory.list",
  "artifacts.list",
  "conversations.recent",
  "activity.list",
  "agents.list_workspace_agents",
] as const;
const repositoryTools = [
  "repo.attach",
  "repo.map",
  "repo.read_file",
  "repo.search",
  "repo.write_file",
  "repo.run_command",
  "repo.run_quality_gate",
  "repo.git_status",
  "repo.git_diff",
  "repo.git_commit",
  "repo.checkpoint",
  "repo.rewind",
  "repo.complete",
  "repo.prepare_push",
  "repo.prepare_pull_request",
] as const;
const repositoryDenials = [...repositoryTools] as const;
const externalMutationDenials = ["external.send"] as const;

export const AGENT_RUNTIME_POLICIES: Readonly<Record<AgentCode, AgentRuntimePolicy>> = {
  kai: {
    instructions:
      "Coordinate the workspace using persisted plans and tasks. Prefer explicit assignments, concise progress summaries, bounded autonomy and deterministic verification of every mutation. Delegate repository implementation to Lora rather than executing repository tools yourself.",
    allowedTools: [
      ...commonReadTools,
      "tasks.create",
      "tasks.update",
      "tasks.assign",
      "tasks.complete",
      "plans.create",
      "plans.add_step",
      "plans.update_step",
      "memory.create",
      "artifacts.create_text",
    ],
    deniedTools: repositoryDenials,
    maximumSideEffect: 1,
    permissionMode: "supervised",
    contextCategories: [
      "request",
      "policy",
      "task",
      "workspace",
      "memory",
      "conversation",
      "artifacts",
    ],
    verification: "deterministic",
  },
  lora: {
    instructions:
      "Act as Zeus's senior engineering agent. Repository, file, terminal, test and Git work must execute only through the isolated repository tools; never execute generated code in the web process and never claim a command, test, commit, push or pull request without durable tool evidence. Pin work to the exact requested base SHA, use only zeus/* feature branches, repair failing quality gates before completion, and never push or open a pull request without an explicit persisted user approval.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text", ...repositoryTools],
    deniedTools: externalMutationDenials,
    maximumSideEffect: 3,
    permissionMode: "supervised",
    contextCategories: [
      "request",
      "policy",
      "task",
      "workspace",
      "memory",
      "conversation",
      "artifacts",
    ],
    verification: "deterministic",
    completionRequirement: {
      toolId: "repo.complete",
      recoveryInstructions:
        "You have not satisfied Lora's completion contract. Inspect repository status and diff, run the required quality gates, repair failures, then call repo.complete with evidence. Do not claim the engineering task is complete before that tool succeeds.",
    },
  },
  jorge: {
    instructions:
      "Analyze product and interface context, then produce concrete product, UX and UI decisions and artifacts. Delegate repository implementation to Lora and never claim repository execution you did not perform.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    deniedTools: repositoryDenials,
    maximumSideEffect: 1,
    permissionMode: "read_only",
    contextCategories: ["request", "policy", "task", "workspace", "memory", "artifacts"],
    verification: "deterministic",
  },
  simon: {
    instructions:
      "Research and review available workspace and run evidence for correctness, security and regressions. Produce verification plans and security reports, distinguish observed evidence from assumptions, and use Lora for repository mutations.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    deniedTools: repositoryDenials,
    maximumSideEffect: 1,
    permissionMode: "read_only",
    contextCategories: [
      "request",
      "policy",
      "task",
      "workspace",
      "memory",
      "conversation",
      "artifacts",
    ],
    verification: "deterministic",
  },
  sara: {
    instructions:
      "Use workspace commercial context to prepare growth, sales, support and operating plans and outbound drafts. Do not perform external account actions or repository operations and never claim messages were sent.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    deniedTools: repositoryDenials,
    maximumSideEffect: 1,
    permissionMode: "read_only",
    contextCategories: ["request", "policy", "task", "workspace", "memory", "artifacts"],
    verification: "deterministic",
  },
};

export function agentTemplate(code: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((agent) => agent.code === code);
}
export function agentRuntimePolicy(code: AgentCode): AgentRuntimePolicy {
  return AGENT_RUNTIME_POLICIES[code];
}
