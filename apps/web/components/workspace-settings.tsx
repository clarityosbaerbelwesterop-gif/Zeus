"use client";

import { useMemo, useState, useTransition } from "react";
import type { AgentCode } from "@zeus/agents";
import { TASK_PRIORITIES } from "@zeus/workspace";
import {
  archiveWorkspaceAction,
  createApiTokenAction,
  deleteIntegrationConnectionAction,
  revokeApiTokenAction,
  saveIntegrationConnectionAction,
  saveUserPreferencesAction,
  testIntegrationConnectionAction,
  updateWorkspaceAction,
  updateWorkspaceMemberAction,
} from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { AgentMark } from "./agent-mark";
import { SectionHeader, timeLabel } from "./workspace-ui";

type SettingsTab = "preferences" | "usage" | "integrations" | "workspace";

interface ProviderDefinition {
  id: string;
  name: string;
  category: "ai" | "platform" | "database";
  description: string;
  defaultScopes: string[];
  docUrl: string;
  envVar: string;
  kind: "api_key" | "oauth" | "platform_native" | "mcp_remote";
}

const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
  {
    id: "unorouter",
    name: "UnoRouter High-Throughput",
    category: "ai",
    description:
      "Adaptive multi-model router engineered for high-throughput concurrency and dynamic failover.",
    defaultScopes: ["chat:completions", "routing:adaptive", "models:all"],
    docUrl: "https://unorouter.ai/docs",
    envVar: "UNOROUTER_API_KEY_1",
    kind: "api_key",
  },
  {
    id: "gemini",
    name: "Google Gemini Native",
    category: "ai",
    description:
      "Direct access to Gemini 3.6 Flash & Pro models with high-context reasoning and grounding tools.",
    defaultScopes: ["models/gemini-3.6-flash", "tools:execute", "grounding:google-search"],
    docUrl: "https://ai.google.dev",
    envVar: "GEMINI_API_KEY",
    kind: "api_key",
  },
  {
    id: "openrouter",
    name: "OpenRouter Aggregator",
    category: "ai",
    description:
      "Unified aggregator gateway providing failover access to 200+ models with one unified endpoint.",
    defaultScopes: ["openrouter/auto", "chat:completions"],
    docUrl: "https://openrouter.ai/docs",
    envVar: "OPENROUTER_API_KEY",
    kind: "api_key",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude Direct",
    category: "ai",
    description:
      "Direct Claude 3.5 Sonnet & Haiku access for nuanced architecture and deep security review.",
    defaultScopes: ["claude-3-5-sonnet", "messages:create"],
    docUrl: "https://docs.anthropic.com",
    envVar: "ANTHROPIC_API_KEY",
    kind: "api_key",
  },
  {
    id: "openai",
    name: "OpenAI Platform",
    category: "ai",
    description: "Direct access to OpenAI GPT-4o, o1, and embeddings models.",
    defaultScopes: ["gpt-4o", "chat:completions"],
    docUrl: "https://platform.openai.com",
    envVar: "OPENAI_API_KEY",
    kind: "api_key",
  },
  {
    id: "github",
    name: "GitHub Repository Access",
    category: "platform",
    description:
      "Enables Kai to clone repositories, generate pull requests, examine commits, and review diffs.",
    defaultScopes: ["repo", "read:user", "pull_requests:write"],
    docUrl: "https://github.com/settings/tokens",
    envVar: "GITHUB_TOKEN",
    kind: "oauth",
  },
  {
    id: "vercel",
    name: "Vercel Platform",
    category: "platform",
    description:
      "Deploys preview branches and staging URLs directly for customer demos and automated checks.",
    defaultScopes: ["deployments:create", "projects:read"],
    docUrl: "https://vercel.com/account/tokens",
    envVar: "VERCEL_TOKEN",
    kind: "api_key",
  },
  {
    id: "neon",
    name: "Neon Serverless Postgres",
    category: "database",
    description:
      "Provides ephemeral database branch provisioning for isolated agent code test runs.",
    defaultScopes: ["database:read_write", "branches:create"],
    docUrl: "https://neon.tech",
    envVar: "DATABASE_URL",
    kind: "platform_native",
  },
  {
    id: "custom_mcp",
    name: "Custom MCP Server (Model Context Protocol)",
    category: "platform",
    description: "Connects external tool providers and custom microservice toolkits via JSON-RPC.",
    defaultScopes: ["tools:list", "tools:call"],
    docUrl: "https://modelcontextprotocol.io",
    envVar: "MCP_SERVER_URL",
    kind: "mcp_remote",
  },
];

export function SettingsView({ data, canManage }: { data: WorkspacePageData; canManage: boolean }) {
  const workspace = data.activeWorkspace;
  const [activeTab, setActiveTab] = useState<SettingsTab>("preferences");
  const [timeframe, setTimeframe] = useState<"today" | "7d" | "30d" | "all">("7d");
  const [editingProvider, setEditingProvider] = useState<ProviderDefinition | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [scopesInput, setScopesInput] = useState("");
  const [testResult, setTestResult] = useState<{
    id: string;
    status: "success" | "testing" | "error";
    message?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // New Zeus API Token form state
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [newTokenScopes, setNewTokenScopes] = useState("workspace.read, workspace.manage");
  const [newTokenExpiry, setNewTokenExpiry] = useState("90");

  if (!workspace) return null;

  const preferences = data.userPreferences;

  // Filter usage records by timeframe
  const filteredUsage = useMemo(() => {
    const now = Date.now();
    const records = data.usage || [];
    if (timeframe === "all") return records;

    const limitMs =
      timeframe === "today"
        ? 24 * 60 * 60 * 1000
        : timeframe === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

    return records.filter((rec) => {
      const recTime = new Date(rec.createdAt).getTime();
      return now - recTime <= limitMs;
    });
  }, [data.usage, timeframe]);

  // Aggregate stats
  const usageStats = useMemo(() => {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let totalCost = 0;
    let totalLatency = 0;

    const byAgent: Record<string, { count: number; tokens: number; cost: number }> = {};
    const byModel: Record<string, { count: number; tokens: number; cost: number }> = {};

    for (const rec of filteredUsage) {
      const inp = Number(rec.inputTokens) || 0;
      const out = Number(rec.outputTokens) || 0;
      const cac = Number(rec.cachedTokens) || 0;
      const cost = parseFloat(String(rec.estimatedCost)) || 0;
      const lat = Number(rec.latencyMs) || 0;

      totalInput += inp;
      totalOutput += out;
      totalCached += cac;
      totalCost += cost;
      totalLatency += lat;

      const ag = rec.agentCode || "unknown";
      if (!byAgent[ag]) byAgent[ag] = { count: 0, tokens: 0, cost: 0 };
      byAgent[ag].count += 1;
      byAgent[ag].tokens += inp + out;
      byAgent[ag].cost += cost;

      const mod = rec.model || rec.provider || "unspecified";
      if (!byModel[mod]) byModel[mod] = { count: 0, tokens: 0, cost: 0 };
      byModel[mod].count += 1;
      byModel[mod].tokens += inp + out;
      byModel[mod].cost += cost;
    }

    const avgLatency =
      filteredUsage.length > 0 ? Math.round(totalLatency / filteredUsage.length) : 0;

    return {
      totalTokens: totalInput + totalOutput,
      totalInput,
      totalOutput,
      totalCached,
      totalCost,
      avgLatency,
      byAgent,
      byModel,
      recordCount: filteredUsage.length,
    };
  }, [filteredUsage]);

  const handleTestConnection = (connId: string, providerName: string) => {
    setTestResult({ id: connId, status: "testing" });
    const formData = new FormData();
    formData.append("workspaceId", workspace.id);
    formData.append("connectionId", connId);

    startTransition(async () => {
      try {
        await testIntegrationConnectionAction(formData);
        setTestResult({
          id: connId,
          status: "success",
          message: `Connected & verified with ${providerName}`,
        });
        setTimeout(() => setTestResult(null), 4000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Connection verification failed";
        setTestResult({ id: connId, status: "error", message });
      }
    });
  };

  const openProviderEditor = (prov: ProviderDefinition) => {
    const existing = (data.connections || []).find(
      (c) => c.provider.toLowerCase() === prov.id.toLowerCase(),
    );
    setEditingProvider(prov);
    setKeyInput("");
    setShowSecret(false);
    const existingScopes = Array.isArray(existing?.scopes) ? existing.scopes.join(", ") : "";
    setScopesInput(existingScopes || prov.defaultScopes.join(", "));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8" id="settings-root-panel">
      {/* Header */}
      <div>
        <SectionHeader
          eyebrow="Control Plane"
          title="Settings & Integrations"
          detail="Manage your personal preferences, monitor real-time AI token consumption, configure LLM routing providers, and govern workspace infrastructure."
        />
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-[var(--line)]" id="settings-tab-bar" role="tablist">
        <button
          id="tab-btn-preferences"
          role="tab"
          aria-selected={activeTab === "preferences"}
          onClick={() => setActiveTab("preferences")}
          className={`relative pb-3 pt-1 text-sm font-medium transition-colors ${
            activeTab === "preferences"
              ? "text-[var(--ink)] font-semibold border-b-2 border-[var(--ink)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          Account & Preferences
        </button>
        <button
          id="tab-btn-usage"
          role="tab"
          aria-selected={activeTab === "usage"}
          onClick={() => setActiveTab("usage")}
          className={`relative ml-6 pb-3 pt-1 text-sm font-medium transition-colors ${
            activeTab === "usage"
              ? "text-[var(--ink)] font-semibold border-b-2 border-[var(--ink)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          API Usage & Telemetry
        </button>
        <button
          id="tab-btn-integrations"
          role="tab"
          aria-selected={activeTab === "integrations"}
          onClick={() => setActiveTab("integrations")}
          className={`relative ml-6 pb-3 pt-1 text-sm font-medium transition-colors ${
            activeTab === "integrations"
              ? "text-[var(--ink)] font-semibold border-b-2 border-[var(--ink)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          Integrations
        </button>
        <button
          id="tab-btn-workspace"
          role="tab"
          aria-selected={activeTab === "workspace"}
          onClick={() => setActiveTab("workspace")}
          className={`relative ml-6 pb-3 pt-1 text-sm font-medium transition-colors ${
            activeTab === "workspace"
              ? "text-[var(--ink)] font-semibold border-b-2 border-[var(--ink)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          Workspace & Team
        </button>
      </div>

      {/* TAB 1: Account Preferences */}
      {activeTab === "preferences" && (
        <section id="panel-preferences" className="space-y-6">
          {saveSuccessMsg && (
            <div
              id="pref-save-banner"
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800"
            >
              {saveSuccessMsg}
            </div>
          )}

          <form
            id="form-account-preferences"
            action={async (formData) => {
              await saveUserPreferencesAction(formData);
              setSaveSuccessMsg("Preferences saved successfully.");
              setTimeout(() => setSaveSuccessMsg(null), 3500);
            }}
            className="space-y-6"
          >
            <input type="hidden" name="workspaceId" value={workspace.id} />

            {/* Profile Information */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">Operator Identity</h2>
                <p className="text-xs text-[var(--muted)]">
                  Personal profile details visible across conversations, task assignments, and audit
                  logs.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium text-[var(--ink)]" htmlFor="pref-input-name">
                  Full Name
                  <input
                    id="pref-input-name"
                    name="name"
                    required
                    defaultValue={preferences.name}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                  />
                </label>

                <label className="text-xs font-medium text-[var(--ink)]" htmlFor="pref-input-email">
                  Email Address
                  <input
                    id="pref-input-email"
                    type="email"
                    disabled
                    value={preferences.email}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white/40 px-3.5 py-2.5 text-sm text-[var(--muted)] cursor-not-allowed opacity-75"
                  />
                </label>

                <label
                  className="text-xs font-medium text-[var(--ink)] sm:col-span-2"
                  htmlFor="pref-input-role"
                >
                  Operational Title / Role
                  <input
                    id="pref-input-role"
                    name="roleTitle"
                    defaultValue={preferences.roleTitle}
                    placeholder="e.g. Lead Operator, Staff AI Engineer, Technical Director"
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                  />
                </label>
              </div>
            </div>

            {/* Visual and Editor Appearance */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">
                  Interface & Editor Appearance
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Calibrate typography, spacing density, and UI rendering preferences.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <label
                  className="text-xs font-medium text-[var(--ink)]"
                  htmlFor="pref-select-theme"
                >
                  Color Theme
                  <select
                    id="pref-select-theme"
                    name="theme"
                    defaultValue={preferences.theme}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                  >
                    <option value="system">System Synchronized</option>
                    <option value="light">Warm Editorial Light</option>
                    <option value="dark">Deep Monolithic Dark</option>
                  </select>
                </label>

                <label
                  className="text-xs font-medium text-[var(--ink)]"
                  htmlFor="pref-select-density"
                >
                  Layout Density
                  <select
                    id="pref-select-density"
                    name="density"
                    defaultValue={preferences.density}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                  >
                    <option value="comfortable">Comfortable (Spacious)</option>
                    <option value="compact">Compact (High-Information)</option>
                  </select>
                </label>

                <label
                  className="text-xs font-medium text-[var(--ink)]"
                  htmlFor="pref-select-codefont"
                >
                  Code & Diff Typography
                  <select
                    id="pref-select-codefont"
                    name="codeFont"
                    defaultValue={preferences.codeFont}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                  >
                    <option value="jetbrains">JetBrains Mono</option>
                    <option value="fira">Fira Code Ligatures</option>
                    <option value="geist">Geist Mono</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Specialist Agent Defaults */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">
                  Specialist Agent Defaults
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Designate the default lead specialist when dispatching unassigned instructions or
                  autopilot objectives.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {data.agents.map((agent) => (
                  <label
                    key={agent.code}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                      preferences.defaultAgent === agent.code
                        ? "border-[var(--ink)] bg-white"
                        : "border-[var(--line)] bg-white/50 hover:bg-white/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="defaultAgent"
                      value={agent.code}
                      defaultChecked={preferences.defaultAgent === agent.code}
                      className="accent-[var(--ink)]"
                    />
                    <AgentMark
                      agent={{
                        code: agent.code as AgentCode,
                        name: agent.name,
                        accent: agent.accent,
                      }}
                      size={28}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none text-[var(--ink)]">
                        {agent.name}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{agent.role}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Execution & Safety Controls */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">
                  Execution & Safety Controls
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Fine-tune autonomous agent behaviors, tool safety checks, and completion alerts.
                </p>
              </div>

              <div className="space-y-4">
                <label className="flex items-start gap-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="streamingEnabled"
                    defaultChecked={preferences.streamingEnabled}
                    className="mt-1 h-4 w-4 rounded border-[var(--line)] accent-[var(--ink)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      Real-Time Token Streaming
                    </span>
                    <p className="text-xs text-[var(--muted)]">
                      Stream agent token generation word-by-word into the chat interface as it is
                      calculated.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="autoVerifyCode"
                    defaultChecked={preferences.autoVerifyCode}
                    className="mt-1 h-4 w-4 rounded border-[var(--line)] accent-[var(--ink)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      Automated Verification Step for Kai
                    </span>
                    <p className="text-xs text-[var(--muted)]">
                      Kai automatically executes syntax and compile checks before requesting
                      approval for repository patches.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="soundAlerts"
                    defaultChecked={preferences.soundAlerts}
                    className="mt-1 h-4 w-4 rounded border-[var(--line)] accent-[var(--ink)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      Audio Notification on Completion
                    </span>
                    <p className="text-xs text-[var(--muted)]">
                      Play an unobtrusive audio chime when long-running task workflows or autopilot
                      steps finish.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="requireSideEffectConfirmation"
                    defaultChecked={preferences.requireSideEffectConfirmation}
                    className="mt-1 h-4 w-4 rounded border-[var(--line)] accent-[var(--ink)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      Side-Effect Confirmation Prompts
                    </span>
                    <p className="text-xs text-[var(--muted)]">
                      Require human operator sign-off before running destructive bash shell commands
                      or overwriting existing files.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="telemetrySharing"
                    defaultChecked={preferences.telemetrySharing}
                    className="mt-1 h-4 w-4 rounded border-[var(--line)] accent-[var(--ink)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      Telemetry & Token Accounting
                    </span>
                    <p className="text-xs text-[var(--muted)]">
                      Log prompt token metrics and latency into the workspace telemetry ledger for
                      cost attribution.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex justify-end">
              <button
                id="btn-save-preferences"
                type="submit"
                className="rounded-xl bg-[var(--ink)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Save Account Preferences
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 2: API Usage & Telemetry */}
      {activeTab === "usage" && (
        <section id="panel-usage" className="space-y-6">
          {/* Timeframe Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">
                API Consumption & Token Telemetry
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Aggregated token volume, latency benchmarks, and provider cost accounting.
              </p>
            </div>

            <div
              className="flex rounded-xl border border-[var(--line)] bg-white/50 p-1"
              id="timeframe-selector"
            >
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "7d", label: "Last 7 Days" },
                  { id: "30d", label: "Last 30 Days" },
                  { id: "all", label: "All Time" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  id={`tf-btn-${t.id}`}
                  onClick={() => setTimeframe(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    timeframe === t.id
                      ? "bg-[var(--ink)] text-white shadow-xs"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Top Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[18px] border border-[var(--line)] bg-white/45 p-5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Total Tokens
              </span>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ink)]">
                {usageStats.totalTokens.toLocaleString()}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>Prompt: {usageStats.totalInput.toLocaleString()}</span>
                <span>Comp: {usageStats.totalOutput.toLocaleString()}</span>
              </div>
            </div>

            <div className="rounded-[18px] border border-[var(--line)] bg-white/45 p-5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Context Cached
              </span>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ink)]">
                {usageStats.totalCached.toLocaleString()}
              </p>
              <p className="mt-2 text-[11px] text-emerald-700">Reduced latency & pricing tier</p>
            </div>

            <div className="rounded-[18px] border border-[var(--line)] bg-white/45 p-5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Estimated Spend
              </span>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ink)]">
                ${usageStats.totalCost.toFixed(4)}
              </p>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Across {usageStats.recordCount} discrete runs
              </p>
            </div>

            <div className="rounded-[18px] border border-[var(--line)] bg-white/45 p-5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Average Latency
              </span>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ink)]">
                {usageStats.avgLatency} ms
              </p>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Round-trip agent tool orchestration
              </p>
            </div>
          </div>

          {/* Breakdown Section: Agent Distribution & Model Distribution */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* By Specialist Agent */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Usage by Specialist Agent</h3>
              <p className="text-xs text-[var(--muted)]">
                Token allocation across autonomous team members.
              </p>

              <div className="mt-5 space-y-4">
                {data.agents.map((agent) => {
                  const stat = usageStats.byAgent[agent.code] || { tokens: 0, cost: 0, count: 0 };
                  const pct =
                    usageStats.totalTokens > 0 ? (stat.tokens / usageStats.totalTokens) * 100 : 0;

                  return (
                    <div key={agent.code} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <AgentMark
                            agent={{
                              code: agent.code as AgentCode,
                              name: agent.name,
                              accent: agent.accent,
                            }}
                            size={20}
                          />
                          <span className="font-medium text-[var(--ink)]">{agent.name}</span>
                          <span className="text-[11px] text-[var(--muted)]">
                            ({stat.count} runs)
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-[var(--ink)]">
                            {stat.tokens.toLocaleString()} tokens
                          </span>
                          <span className="font-mono text-[11px] text-[var(--muted)]">
                            ${stat.cost.toFixed(4)}
                          </span>
                        </div>
                      </div>
                      {/* Bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(pct, stat.tokens > 0 ? 3 : 0)}%`,
                            backgroundColor: agent.accent,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Model / Provider */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Usage by Model & Provider</h3>
              <p className="text-xs text-[var(--muted)]">
                LLM routing and model distribution breakdown.
              </p>

              <div className="mt-5 space-y-4">
                {Object.entries(usageStats.byModel).length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--muted)]">
                    No model telemetry recorded in this timeframe.
                  </p>
                ) : (
                  Object.entries(usageStats.byModel).map(([modelName, stat]) => {
                    const pct =
                      usageStats.totalTokens > 0 ? (stat.tokens / usageStats.totalTokens) * 100 : 0;
                    return (
                      <div key={modelName} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className="font-medium text-[var(--ink)] truncate max-w-[200px]"
                            title={modelName}
                          >
                            {modelName}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[11px] text-[var(--ink)]">
                              {stat.tokens.toLocaleString()} tok
                            </span>
                            <span className="font-mono text-[11px] text-[var(--muted)]">
                              ${stat.cost.toFixed(4)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
                          <div
                            className="h-full rounded-full bg-[var(--ink)] transition-all opacity-70"
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Detailed Telemetry Log Table */}
          <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Recent Telemetry Events</h3>
                <p className="text-xs text-[var(--muted)]">
                  Execution log of individual agent calls with latency and token metrics.
                </p>
              </div>
              <span className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-[11px] text-[var(--muted)]">
                {filteredUsage.length} recorded runs
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" id="table-usage-telemetry">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <th className="pb-2.5 font-medium">Timestamp</th>
                    <th className="pb-2.5 font-medium">Agent</th>
                    <th className="pb-2.5 font-medium">Model / Provider</th>
                    <th className="pb-2.5 font-medium text-right">Input</th>
                    <th className="pb-2.5 font-medium text-right">Output</th>
                    <th className="pb-2.5 font-medium text-right">Latency</th>
                    <th className="pb-2.5 font-medium text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredUsage.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[var(--muted)]">
                        No usage records found for this timeframe. Real agent dispatches will
                        populate here automatically.
                      </td>
                    </tr>
                  ) : (
                    filteredUsage.map((rec) => (
                      <tr key={rec.id} className="hover:bg-white/40">
                        <td className="py-3 text-[var(--muted)] whitespace-nowrap">
                          {timeLabel(rec.createdAt)}
                        </td>
                        <td className="py-3 font-medium text-[var(--ink)]">
                          <span className="capitalize">{rec.agentCode || "Zeus"}</span>
                        </td>
                        <td className="py-3">
                          <span className="rounded-md border border-[var(--line)] bg-white/60 px-2 py-0.5 font-mono text-[10px] text-[var(--ink)]">
                            {rec.model || rec.provider}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono text-[var(--ink)]">
                          {(Number(rec.inputTokens) || 0).toLocaleString()}
                        </td>
                        <td className="py-3 text-right font-mono text-[var(--ink)]">
                          {(Number(rec.outputTokens) || 0).toLocaleString()}
                        </td>
                        <td className="py-3 text-right font-mono text-[var(--muted)]">
                          {rec.latencyMs ? `${rec.latencyMs}ms` : "-"}
                        </td>
                        <td className="py-3 text-right font-mono text-[var(--ink)]">
                          ${parseFloat(String(rec.estimatedCost) || "0").toFixed(5)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Integrations */}
      {activeTab === "integrations" && (
        <section id="panel-integrations" className="space-y-6">
          {/* Security Notice */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950">
            <p className="font-semibold">Server environment references</p>
            <p className="mt-1 leading-relaxed text-amber-900/90">
              Connections store <code className="font-mono">env:VAR_NAME</code> references to
              variables already set on the Zeus server. Raw API keys are not encrypted or persisted.
              A provider is connected only when that environment variable exists.
            </p>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              id="test-connection-alert"
              className={`rounded-xl border px-4 py-3 text-xs font-medium ${
                testResult.status === "testing"
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : testResult.status === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {testResult.status === "testing" && "Testing connectivity with provider endpoint..."}
              {testResult.status === "success" && testResult.message}
              {testResult.status === "error" && `Error: ${testResult.message}`}
            </div>
          )}

          {/* Core AI Providers Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--ink)]">
                  AI & LLM Routing Providers
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Primary and fallback inference backends utilized by the agent runtime.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {SUPPORTED_PROVIDERS.filter((p) => p.category === "ai").map((prov) => {
                const conn = (data.connections || []).find(
                  (c) => c.provider.toLowerCase() === prov.id.toLowerCase(),
                );
                const isConnected = conn && conn.status === "connected";

                return (
                  <div
                    key={prov.id}
                    id={`card-provider-${prov.id}`}
                    className="flex flex-col justify-between rounded-[20px] border border-[var(--line)] bg-white/45 p-5 transition-all hover:border-[var(--ink)]/30"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--ink)]">{prov.name}</h3>
                          <span className="mt-0.5 inline-block text-[10px] uppercase tracking-wider text-[var(--muted)]">
                            {prov.kind.replace("_", " ")}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            isConnected
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-black/5 text-[var(--muted)] border border-[var(--line)]"
                          }`}
                        >
                          {isConnected ? "Connected" : "Not Configured"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                        {prov.description}
                      </p>
                    </div>

                    <div className="mt-5 border-t border-[var(--line)] pt-3">
                      <div className="flex items-center justify-between">
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <button
                              id={`btn-test-${prov.id}`}
                              disabled={isPending}
                              onClick={() => handleTestConnection(conn.id, prov.name)}
                              className="rounded-lg border border-[var(--line)] bg-white/60 px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-white disabled:opacity-50"
                            >
                              Test Ping
                            </button>
                            <form action={deleteIntegrationConnectionAction}>
                              <input type="hidden" name="workspaceId" value={workspace.id} />
                              <input type="hidden" name="connectionId" value={conn.id} />
                              <button
                                type="submit"
                                className="rounded-lg px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                              >
                                Revoke
                              </button>
                            </form>
                          </div>
                        ) : (
                          <div />
                        )}

                        <button
                          id={`btn-configure-${prov.id}`}
                          onClick={() => openProviderEditor(prov)}
                          className="rounded-xl bg-[var(--ink)] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        >
                          {isConnected ? "Update env:VAR" : "Set env:VAR"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Platform & Tool Integrations Section */}
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">
                Developer & Platform Integrations
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Connect external repositories, deployment clouds, and ephemeral databases for
                autonomous tool calling.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {SUPPORTED_PROVIDERS.filter((p) => p.category !== "ai").map((prov) => {
                const conn = (data.connections || []).find(
                  (c) => c.provider.toLowerCase() === prov.id.toLowerCase(),
                );
                const isConnected = conn && conn.status === "connected";

                return (
                  <div
                    key={prov.id}
                    id={`card-platform-${prov.id}`}
                    className="flex flex-col justify-between rounded-[20px] border border-[var(--line)] bg-white/45 p-5 transition-all hover:border-[var(--ink)]/30"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--ink)]">{prov.name}</h3>
                          <span className="mt-0.5 inline-block text-[10px] uppercase tracking-wider text-[var(--muted)]">
                            {prov.category} · {prov.kind.replace("_", " ")}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            isConnected
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-black/5 text-[var(--muted)] border border-[var(--line)]"
                          }`}
                        >
                          {isConnected ? "Active" : "Disconnected"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                        {prov.description}
                      </p>
                    </div>

                    <div className="mt-5 border-t border-[var(--line)] pt-3">
                      <div className="flex items-center justify-between">
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <button
                              id={`btn-test-${prov.id}`}
                              disabled={isPending}
                              onClick={() => handleTestConnection(conn.id, prov.name)}
                              className="rounded-lg border border-[var(--line)] bg-white/60 px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-white disabled:opacity-50"
                            >
                              Test Ping
                            </button>
                            <form action={deleteIntegrationConnectionAction}>
                              <input type="hidden" name="workspaceId" value={workspace.id} />
                              <input type="hidden" name="connectionId" value={conn.id} />
                              <button
                                type="submit"
                                className="rounded-lg px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                              >
                                Revoke
                              </button>
                            </form>
                          </div>
                        ) : (
                          <div />
                        )}

                        <button
                          id={`btn-configure-${prov.id}`}
                          onClick={() => openProviderEditor(prov)}
                          className="rounded-xl bg-[var(--ink)] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        >
                          {isConnected ? "Update env:VAR" : "Set env:VAR"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zeus Personal API Tokens (Bearer tokens for CI/CD & Automation) */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--ink)]">
                  Zeus Personal Access Tokens
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Bearer authentication tokens for invoking Zeus agents via REST API, CLI, or GitHub
                  Actions.
                </p>
              </div>
              <button
                id="btn-open-create-token"
                onClick={() => setIsCreatingToken(!isCreatingToken)}
                className="rounded-xl border border-[var(--line)] bg-white/60 px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:bg-white"
              >
                {isCreatingToken ? "Cancel" : "+ Generate New Token"}
              </button>
            </div>

            {/* Token Generation Form Drawer */}
            {isCreatingToken && (
              <form
                id="form-create-token"
                action={async (formData) => {
                  await createApiTokenAction(formData);
                  setIsCreatingToken(false);
                  setNewTokenLabel("");
                }}
                className="rounded-[20px] border border-[var(--ink)]/30 bg-white/80 p-5 space-y-4"
              >
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <h3 className="text-sm font-semibold text-[var(--ink)]">Generate Personal Token</h3>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-xs font-medium text-[var(--ink)]">
                    Token Label
                    <input
                      required
                      name="label"
                      value={newTokenLabel}
                      onChange={(e) => setNewTokenLabel(e.target.value)}
                      placeholder="e.g. CI/CD Release Pipeline"
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs focus:border-[var(--ink)] focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-[var(--ink)]">
                    Granted Scopes
                    <input
                      name="scopes"
                      value={newTokenScopes}
                      onChange={(e) => setNewTokenScopes(e.target.value)}
                      placeholder="workspace.read, workspace.manage"
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs focus:border-[var(--ink)] focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-[var(--ink)]">
                    Expiration
                    <select
                      name="expiresDays"
                      value={newTokenExpiry}
                      onChange={(e) => setNewTokenExpiry(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs focus:border-[var(--ink)] focus:outline-none"
                    >
                      <option value="30">30 Days</option>
                      <option value="90">90 Days</option>
                      <option value="180">180 Days</option>
                      <option value="365">1 Year</option>
                    </select>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingToken(false)}
                    className="rounded-xl px-3.5 py-2 text-xs text-[var(--muted)] hover:bg-black/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[var(--ink)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
                  >
                    Create Token
                  </button>
                </div>
              </form>
            )}

            {/* Existing API Tokens List */}
            <div className="rounded-[20px] border border-[var(--line)] bg-white/45 p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" id="table-api-tokens">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      <th className="pb-2 font-medium">Label</th>
                      <th className="pb-2 font-medium">Prefix</th>
                      <th className="pb-2 font-medium">Scopes</th>
                      <th className="pb-2 font-medium">Created</th>
                      <th className="pb-2 font-medium">Expires</th>
                      <th className="pb-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {(data.apiTokens || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-xs text-[var(--muted)]">
                          No active personal access tokens. Generate one above to access Zeus from
                          external scripts.
                        </td>
                      </tr>
                    ) : (
                      (data.apiTokens || []).map((tok) => {
                        const isRevoked = !!tok.revokedAt;
                        return (
                          <tr key={tok.id} className="hover:bg-white/40">
                            <td className="py-3 font-medium text-[var(--ink)]">{tok.label}</td>
                            <td className="py-3 font-mono text-[11px] text-[var(--muted)]">
                              {tok.prefix}••••••••
                            </td>
                            <td className="py-3">
                              <span className="rounded bg-black/5 px-2 py-0.5 font-mono text-[10px] text-[var(--ink)]">
                                {Array.isArray(tok.scopes) ? tok.scopes.join(", ") : "all"}
                              </span>
                            </td>
                            <td className="py-3 text-[var(--muted)]">{timeLabel(tok.createdAt)}</td>
                            <td className="py-3 text-[var(--muted)]">
                              {tok.expiresAt ? timeLabel(tok.expiresAt) : "Never"}
                            </td>
                            <td className="py-3 text-right">
                              {isRevoked ? (
                                <span className="text-[11px] text-rose-600 font-medium">
                                  Revoked
                                </span>
                              ) : (
                                <form action={revokeApiTokenAction}>
                                  <input type="hidden" name="workspaceId" value={workspace.id} />
                                  <input type="hidden" name="tokenId" value={tok.id} />
                                  <button
                                    type="submit"
                                    className="text-xs text-rose-700 hover:underline"
                                  >
                                    Revoke
                                  </button>
                                </form>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal for env:VAR connection reference */}
          {editingProvider && (
            <div
              id="modal-key-editor-backdrop"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
            >
              <div
                id="modal-key-editor"
                className="w-full max-w-lg rounded-[22px] border border-[var(--line)] bg-[#fbf9f4] p-6 shadow-xl"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--ink)]">
                      Configure {editingProvider.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Save an <span className="font-mono">env:{editingProvider.envVar}</span>{" "}
                      reference. Zeus does not encrypt or store the raw credential.
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingProvider(null)}
                    className="text-[var(--muted)] hover:text-[var(--ink)] text-sm"
                  >
                    ✕
                  </button>
                </div>

                <form
                  id="form-save-connection-key"
                  action={async (formData) => {
                    await saveIntegrationConnectionAction(formData);
                    setEditingProvider(null);
                  }}
                  className="mt-5 space-y-4"
                >
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <input type="hidden" name="provider" value={editingProvider.id} />
                  <input type="hidden" name="kind" value={editingProvider.kind} />

                  <label className="block text-xs font-medium text-[var(--ink)]">
                    Environment variable reference
                    <div className="relative mt-1.5">
                      <input
                        required
                        type={showSecret ? "text" : "password"}
                        name="secret"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={`env:${editingProvider.envVar}`}
                        className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 pr-16 text-xs font-mono text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-2.5 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        {showSecret ? "Hide" : "Reveal"}
                      </button>
                    </div>
                    <p className="mt-1.5 font-normal text-[var(--muted)]">
                      Use <span className="font-mono">env:VAR_NAME</span> or{" "}
                      <span className="font-mono">VAR_NAME</span>. The variable must already exist
                      in the server environment.
                    </p>
                  </label>

                  <label className="block text-xs font-medium text-[var(--ink)]">
                    Assigned Capability Scopes (comma-separated)
                    <input
                      name="scopes"
                      value={scopesInput}
                      onChange={(e) => setScopesInput(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-xs text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                    />
                  </label>

                  <div className="rounded-xl bg-black/5 p-3 text-[11px] text-[var(--muted)]">
                    Official documentation and key generation:{" "}
                    <a
                      href={editingProvider.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--ink)] underline hover:opacity-80"
                    >
                      {editingProvider.docUrl}
                    </a>
                  </div>

                  <div className="flex justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setEditingProvider(null)}
                      className="rounded-xl px-4 py-2 text-xs font-medium text-[var(--muted)] hover:bg-black/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-[var(--ink)] px-5 py-2 text-xs font-medium text-white hover:opacity-90"
                    >
                      Save env:VAR reference
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: Workspace & Team */}
      {activeTab === "workspace" && (
        <section id="panel-workspace" className="space-y-8">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Workspace Metadata</h2>
            <p className="text-xs text-[var(--muted)]">
              Durable project objectives and governance parameters.
            </p>
          </div>

          <form
            id="form-workspace-metadata"
            action={updateWorkspaceAction}
            className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-white/35 p-5 sm:grid-cols-2"
          >
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <label className="text-xs text-[var(--muted)]" htmlFor="ws-field-name">
              Name
              <input
                id="ws-field-name"
                disabled={!canManage}
                required
                name="name"
                defaultValue={workspace.name}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-[var(--muted)]" htmlFor="ws-field-priority">
              Priority
              <select
                id="ws-field-priority"
                disabled={!canManage}
                name="priority"
                defaultValue={workspace.priority}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--muted)] sm:col-span-2" htmlFor="ws-field-desc">
              Description
              <textarea
                id="ws-field-desc"
                disabled={!canManage}
                name="description"
                defaultValue={workspace.description}
                maxLength={2000}
                rows={2}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-[var(--muted)] sm:col-span-2" htmlFor="ws-field-obj">
              Objective
              <textarea
                id="ws-field-obj"
                disabled={!canManage}
                name="objective"
                defaultValue={workspace.objective}
                maxLength={12000}
                rows={3}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              />
            </label>
            <label
              className="text-xs text-[var(--muted)] sm:col-span-2"
              htmlFor="ws-field-criteria"
            >
              Success criteria
              <textarea
                id="ws-field-criteria"
                disabled={!canManage}
                name="successCriteria"
                defaultValue={workspace.successCriteria}
                maxLength={12000}
                rows={3}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-[var(--muted)] sm:col-span-2" htmlFor="ws-field-focus">
              Current focus
              <textarea
                id="ws-field-focus"
                disabled={!canManage}
                name="currentFocus"
                defaultValue={workspace.currentFocus}
                maxLength={4000}
                rows={2}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-[var(--muted)]" htmlFor="ws-field-status">
              Status
              <select
                id="ws-field-status"
                disabled={!canManage}
                name="status"
                defaultValue={workspace.status}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="completed">completed</option>
              </select>
            </label>
            {canManage ? (
              <div className="flex items-end">
                <button
                  id="btn-save-workspace-meta"
                  className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white hover:opacity-90"
                >
                  Save workspace
                </button>
              </div>
            ) : null}
          </form>

          {/* Members List */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Workspace Members</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Roles are enforced by centralized application permissions and tenant isolation.
            </p>
            <div className="mt-4 space-y-2">
              {data.members.map((member) => (
                <div
                  key={member.userId}
                  className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{member.user?.name ?? member.userId}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {member.user?.email ?? member.userId}
                    </p>
                  </div>
                  {canManage ? (
                    <form action={updateWorkspaceMemberAction} className="flex gap-2">
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <input type="hidden" name="userId" value={member.userId} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-xs"
                      >
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <button className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs">
                        Update
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs uppercase text-[var(--muted)]">{member.role}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Danger Zone */}
          <section className="mt-8 rounded-[22px] border border-[#d7c1bb] bg-[#fff8f5] p-5">
            <h2 className="text-lg font-semibold text-rose-900">Danger zone</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Archiving hides the workspace without deleting its history or event trail.
            </p>
            {canManage ? (
              <form
                action={archiveWorkspaceAction}
                className="mt-4 flex flex-col gap-2 sm:flex-row"
              >
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <input
                  required
                  name="confirmation"
                  placeholder={`Type ${workspace.name}`}
                  className="min-w-0 flex-1 rounded-xl border border-[#d7c1bb] bg-white px-3 py-2 text-sm"
                />
                <button className="rounded-xl border border-[#b98e82] bg-white/80 px-4 py-2 text-sm text-rose-800 hover:bg-rose-100">
                  Archive workspace
                </button>
              </form>
            ) : null}
          </section>
        </section>
      )}
    </div>
  );
}
