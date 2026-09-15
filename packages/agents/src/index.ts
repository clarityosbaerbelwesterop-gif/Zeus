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
    code: "jorge",
    name: "Jorge",
    role: "Manager / Chief of Staff",
    purpose: "Turns objectives into coordinated, visible work.",
    accent: "#c77955",
    responsibilities: [
      "objective framing",
      "task graphs",
      "delegation",
      "coordination",
      "progress reporting",
      "escalation",
    ],
  },
  {
    code: "kai",
    name: "Kai",
    role: "Senior Software Engineer",
    purpose: "Builds and repairs software with verification evidence.",
    accent: "#547a91",
    responsibilities: [
      "implementation",
      "debugging",
      "architecture",
      "refactoring",
      "repository work",
      "code review",
    ],
  },
  {
    code: "lora",
    name: "Lora",
    role: "Product Designer",
    purpose: "Shapes calm, useful interfaces and interaction systems.",
    accent: "#9a78a9",
    responsibilities: [
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
    role: "QA + Security Engineer",
    purpose: "Finds failure modes and proves that work is safe enough to ship.",
    accent: "#5f7f72",
    responsibilities: [
      "testing",
      "regression analysis",
      "browser testing",
      "security testing",
      "dependency review",
      "vulnerability remediation",
    ],
  },
  {
    code: "sara",
    name: "Sara",
    role: "Sales / GTM",
    purpose: "Researches accounts and prepares precise commercial follow-through.",
    accent: "#b58a45",
    responsibilities: [
      "prospect research",
      "sales preparation",
      "CRM workflows",
      "outbound drafts",
      "qualification",
      "follow-ups",
    ],
  },
]);

export type AgentContextCategory =
  "request" | "policy" | "task" | "workspace" | "memory" | "conversation" | "artifacts";

export interface AgentRuntimePolicy {
  readonly instructions: string;
  readonly allowedTools: readonly string[];
  readonly maximumSideEffect: 0 | 1;
  readonly contextCategories: readonly AgentContextCategory[];
  readonly verification: "deterministic";
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

export const AGENT_RUNTIME_POLICIES: Readonly<Record<AgentCode, AgentRuntimePolicy>> = {
  jorge: {
    instructions:
      "Coordinate the workspace using persisted plans and tasks. Prefer explicit assignments, concise progress summaries, and deterministic verification of every mutation.",
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
    maximumSideEffect: 1,
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
  kai: {
    instructions:
      "Act as a senior software engineer using only the workspace information and internal tools available in M3. Create technical plans, reports, and code/text artifacts; do not claim shell or repository execution.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    maximumSideEffect: 1,
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
      "Analyze product and interface context, then produce concrete UX/UI recommendations and design artifacts without inventing external research or completed implementation.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    maximumSideEffect: 1,
    contextCategories: ["request", "policy", "task", "workspace", "memory", "artifacts"],
    verification: "deterministic",
  },
  simon: {
    instructions:
      "Review available workspace evidence for correctness, security, and regressions. Produce verification plans and security reports, and distinguish observed evidence from assumptions.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    maximumSideEffect: 1,
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
      "Use workspace commercial context to prepare sales plans and outbound drafts. Do not perform external account actions or claim messages were sent.",
    allowedTools: [...commonReadTools, "memory.create", "artifacts.create_text"],
    maximumSideEffect: 1,
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
