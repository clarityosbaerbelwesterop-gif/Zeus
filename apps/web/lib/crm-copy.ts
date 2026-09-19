import type { DealStage } from "@zeus/workspace";

export const DEAL_STAGE_COPY: Record<DealStage, { de: string; en: string }> = {
  lead: { de: "Lead", en: "Lead" },
  qualified: { de: "Qualifiziert", en: "Qualified" },
  proposal: { de: "Angebot", en: "Proposal" },
  negotiation: { de: "Verhandlung", en: "Negotiation" },
  won: { de: "Gewonnen", en: "Won" },
  lost: { de: "Verloren", en: "Lost" },
};

export const crmCopy = {
  pipelineEyebrow: "Pipeline",
  pipelineTitle: "Deals nach Phase",
  pipelineDetail:
    "Spalten sind Phasen. Karten sind Deals — Wert, Inhaber und der nächste Agent-Schritt aus bestehenden Läufen.",
  createDeal: "Deal anlegen",
  dealTitle: "Deal-Titel",
  dealValue: "Wert",
  dealOwner: "Inhaber",
  emptyPipelineTitle: "Noch keine Deals",
  emptyPipelineDetail:
    "Lege einen Deal an. Deal-Room ist die bestehende Conversation, Agent-Runs sind bestehende Läufe.",
  dealRoomEyebrow: "Deal-Room",
  dealRoomTitle: "Kontext, Kontakte, Freigaben",
  dealRoomDetail:
    "Links der Deal-Thread. Rechts Agent-Runs — 1:1 auf Runs, Plan-Schritte und Team-Agenten.",
  backToPipeline: "Zur Pipeline",
  contacts: "Kontakte",
  owner: "Inhaber",
  approvals: "Freigaben",
  noApprovals: "Keine offenen Freigaben für die verknüpften Läufe.",
  thread: "Deal-Thread",
  noMessages: "Noch keine Nachrichten in diesem Deal.",
  threadPlaceholder: "Kontext an das Team geben…",
  send: "Senden",
  save: "Speichern",
  agentRunsEyebrow: "Agent-Runs",
  agentRunsTitle: "Läufe, Plan-Schritte, Team",
  agentRunsDetail: "Bestehende Runs, Plan-Schritte und Workspace-Agenten. Kein zweites Laufsystem.",
  startRun: "Agent-Lauf starten",
  runInstruction: "Was soll der Agent tun?",
  noRuns: "Noch keine Agent-Runs für diesen Deal.",
  planSteps: "Plan-Schritte",
  teamAgents: "Team-Agenten",
  latestRun: "Aktueller Lauf",
  nextStep: "Nächster Agent-Schritt",
  stage: "Phase",
  noConversation: "Dieser Deal hat noch keinen Thread.",
} as const;

export function formatDealValue(valueCents: number | null, currency: string | null): string {
  if (valueCents === null) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(valueCents / 100);
}

export function parseFormValueCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s/gu, "");
  let amount: number;
  if (compact.includes(",")) {
    amount = Number(compact.replace(/\./gu, "").replace(",", "."));
  } else if (/^\d+\.\d{1,2}$/u.test(compact)) {
    amount = Number(compact);
  } else {
    amount = Number(compact.replace(/[.,]/gu, ""));
  }
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid deal value.");
  const cents = Math.round(amount * 100);
  if (!Number.isInteger(cents) || cents > 2_147_483_647) throw new Error("Invalid deal value.");
  return cents;
}
