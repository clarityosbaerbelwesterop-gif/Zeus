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
    responsibilities: ["objective framing", "task graphs", "delegation", "coordination", "progress reporting", "escalation"],
  },
  {
    code: "kai",
    name: "Kai",
    role: "Senior Software Engineer",
    purpose: "Builds and repairs software with verification evidence.",
    accent: "#547a91",
    responsibilities: ["implementation", "debugging", "architecture", "refactoring", "repository work", "code review"],
  },
  {
    code: "lora",
    name: "Lora",
    role: "Product Designer",
    purpose: "Shapes calm, useful interfaces and interaction systems.",
    accent: "#9a78a9",
    responsibilities: ["product design", "UI", "UX", "information architecture", "interaction design", "visual QA"],
  },
  {
    code: "simon",
    name: "Simon",
    role: "QA + Security Engineer",
    purpose: "Finds failure modes and proves that work is safe enough to ship.",
    accent: "#5f7f72",
    responsibilities: ["testing", "regression analysis", "browser testing", "security testing", "dependency review", "vulnerability remediation"],
  },
  {
    code: "sara",
    name: "Sara",
    role: "Sales / GTM",
    purpose: "Researches accounts and prepares precise commercial follow-through.",
    accent: "#b58a45",
    responsibilities: ["prospect research", "sales preparation", "CRM workflows", "outbound drafts", "qualification", "follow-ups"],
  },
]);

export function agentTemplate(code: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((agent) => agent.code === code);
}
