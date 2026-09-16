/* eslint-disable */
// In-memory data store for local development / preview when DATABASE_URL is not configured.
type TableName = string;
type Row = Record<string, any>;

const CANONICAL_TEMPLATES = [
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
    role: "AppSec Engineer",
    purpose: "Assesses risks and defends boundaries before release.",
    accent: "#9a4a4d",
    responsibilities: [
      "threat modeling",
      "boundary validation",
      "dependency review",
      "policy enforcement",
      "secret protection",
      "security QA",
    ],
  },
  {
    code: "sara",
    name: "Sara",
    role: "Technical Sales / Solutions",
    purpose: "Connects capabilities to problems and structures commercial value.",
    accent: "#768051",
    responsibilities: [
      "solution framing",
      "customer narratives",
      "proposal drafting",
      "objection handling",
      "qualification",
      "pitch collateral",
    ],
  },
];

class MockDatabase {
  private tables = new Map<TableName, Row[]>();

  constructor() {
    this.seed();
  }

  private seed() {
    const now = new Date();
    const userId = "usr_lead_operator";
    const orgId = "org_default";
    const wsId = "ws_core_mission";

    // 1. Users
    this.tables.set("users", [
      {
        id: userId,
        email: "operator@zeus.local",
        name: "Lead Operator",
        created_at: now,
        updated_at: now,
      },
    ]);

    // 2. Organizations
    this.tables.set("organizations", [
      {
        id: orgId,
        name: "Zeus Core",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 3. Organization Members
    this.tables.set("organization_members", [
      {
        organization_id: orgId,
        user_id: userId,
        role: "owner",
        created_at: now,
      },
    ]);

    // 4. Agent Templates
    const templates = CANONICAL_TEMPLATES.map((agent) => ({
      code: agent.code,
      name: agent.name,
      role: agent.role,
      purpose: agent.purpose,
      accent: agent.accent,
      responsibilities: agent.responsibilities,
      system_owned: true,
    }));
    this.tables.set("agent_templates", templates);

    // 5. Workspaces
    this.tables.set("workspaces", [
      {
        id: wsId,
        organization_id: orgId,
        name: "Zeus Mission Control",
        description: "Calm AI workspace with specialized teammates that plan, build, design, test and sell.",
        objective: "Build and run software workflows with high-leverage AI specialists.",
        success_criteria: "Complete task tracking, transparent activity logs, durable memory and clear run states.",
        current_focus: "Coordinating Jorge, Kai, Lora, Simon, and Sara on active project objectives.",
        status: "active",
        priority: "high",
        created_by: userId,
        archived_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 6. Workspace Members
    this.tables.set("workspace_members", [
      {
        workspace_id: wsId,
        user_id: userId,
        role: "owner",
        created_at: now,
      },
    ]);

    // 7. Workspace Agents
    this.tables.set(
      "workspace_agents",
      templates.map((agent) => ({
        workspace_id: wsId,
        agent_code: agent.code,
        enabled_by: userId,
        created_at: now,
      })),
    );

    // 8. Conversations
    const convTeam = "conv_team_room";
    const convJorge = "conv_direct_jorge";
    const convKai = "conv_direct_kai";
    const convLora = "conv_direct_lora";
    const convSimon = "conv_direct_simon";
    const convSara = "conv_direct_sara";

    this.tables.set("conversations", [
      {
        id: convTeam,
        workspace_id: wsId,
        type: "team",
        title: "Team room",
        agent_code: null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
      {
        id: convJorge,
        workspace_id: wsId,
        type: "direct_agent",
        title: "Jorge",
        agent_code: "jorge",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
      {
        id: convKai,
        workspace_id: wsId,
        type: "direct_agent",
        title: "Kai",
        agent_code: "kai",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
      {
        id: convLora,
        workspace_id: wsId,
        type: "direct_agent",
        title: "Lora",
        agent_code: "lora",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
      {
        id: convSimon,
        workspace_id: wsId,
        type: "direct_agent",
        title: "Simon",
        agent_code: "simon",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
      {
        id: convSara,
        workspace_id: wsId,
        type: "direct_agent",
        title: "Sara",
        agent_code: "sara",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 9. Conversation Participants
    const participants: Row[] = [];
    templates.forEach((agent) => {
      participants.push({ conversation_id: convTeam, agent_code: agent.code });
    });
    participants.push({ conversation_id: convJorge, agent_code: "jorge" });
    participants.push({ conversation_id: convKai, agent_code: "kai" });
    participants.push({ conversation_id: convLora, agent_code: "lora" });
    participants.push({ conversation_id: convSimon, agent_code: "simon" });
    participants.push({ conversation_id: convSara, agent_code: "sara" });
    this.tables.set("conversation_participants", participants);

    // 10. Messages
    this.tables.set("messages", [
      {
        id: "msg_welcome_1",
        conversation_id: convTeam,
        role: "assistant",
        kind: "standard",
        agent_code: "jorge",
        run_id: null,
        content:
          "Welcome to Zeus. I've prepared our workspace with Kai, Lora, Simon, and Sara ready for tasks. What objective should we focus on?",
        status: "complete",
        created_at: new Date(now.getTime() - 1000 * 60 * 15),
      },
      {
        id: "msg_welcome_2",
        conversation_id: convTeam,
        role: "assistant",
        kind: "standard",
        agent_code: "kai",
        run_id: null,
        content:
          "Repository structure and environment constraints are loaded. Ready to build features or run tests.",
        status: "complete",
        created_at: new Date(now.getTime() - 1000 * 60 * 10),
      },
    ]);

    // 11. Tasks
    this.tables.set("tasks", [
      {
        id: "task_1",
        workspace_id: wsId,
        title: "Inspect repository and verify runtime integrity",
        description: "Check monorepo packages, build configurations, and dev server stability.",
        status: "completed",
        priority: "high",
        assigned_agent: "kai",
        assigned_user: null,
        created_by: userId,
        due_at: null,
        completed_at: now,
        created_at: new Date(now.getTime() - 1000 * 60 * 30),
        updated_at: now,
      },
      {
        id: "task_2",
        workspace_id: wsId,
        title: "Review UI responsiveness and design hierarchy",
        description: "Ensure layout math, typography contrast, and mobile breakpoints match specification.",
        status: "in_progress",
        priority: "medium",
        assigned_agent: "lora",
        assigned_user: null,
        created_by: userId,
        due_at: null,
        completed_at: null,
        created_at: new Date(now.getTime() - 1000 * 60 * 20),
        updated_at: now,
      },
      {
        id: "task_3",
        workspace_id: wsId,
        title: "Verify security boundaries and tenant isolation",
        description: "Audit RLS boundaries, input schemas, and authentication fallbacks.",
        status: "ready",
        priority: "critical",
        assigned_agent: "simon",
        assigned_user: null,
        created_by: userId,
        due_at: null,
        completed_at: null,
        created_at: new Date(now.getTime() - 1000 * 60 * 10),
        updated_at: now,
      },
    ]);

    // 12. Memory Entries
    this.tables.set("memory_entries", [
      {
        id: "mem_1",
        workspace_id: wsId,
        type: "goal",
        title: "Workspace Objective",
        content: "Build and ship autonomous agents with complete transparency and verification.",
        source_type: "workspace",
        source_id: wsId,
        created_by: userId,
        archived_at: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: "mem_2",
        workspace_id: wsId,
        type: "decision",
        title: "Model Provider Routing",
        content: "Keep all model routing and secrets strictly server-side.",
        source_type: "workspace",
        source_id: wsId,
        created_by: userId,
        archived_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 13. Plans
    this.tables.set("plans", [
      {
        id: "plan_1",
        workspace_id: wsId,
        title: "Zeus Workspace Activation",
        description: "Coordinate the specialist teammates to initialize the project room.",
        status: "active",
        created_by: userId,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 14. Plan Steps
    this.tables.set("plan_steps", [
      {
        id: "step_1",
        plan_id: "plan_1",
        sequence: 1,
        title: "Initialize workspace team",
        description: "Enable Jorge, Kai, Lora, Simon, and Sara in the workspace room.",
        status: "completed",
        assigned_agent: "jorge",
        assigned_user: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: "step_2",
        plan_id: "plan_1",
        sequence: 2,
        title: "Audit execution environment",
        description: "Confirm container ports and dependencies are aligned.",
        status: "completed",
        assigned_agent: "kai",
        assigned_user: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 15. Runs & Run Steps
    this.tables.set("runs", []);
    this.tables.set("run_steps", []);

    // 16. Files & Artifacts
    this.tables.set("workspace_files", []);
    this.tables.set("artifacts", []);
    this.tables.set("task_artifacts", []);
    this.tables.set("task_conversations", []);
    this.tables.set("task_runs", []);

    // 17. Events
    this.tables.set("workspace_events", [
      {
        id: "evt_1",
        organization_id: orgId,
        workspace_id: wsId,
        actor_type: "user",
        actor_id: userId,
        event_type: "workspace.created",
        entity_type: "workspace",
        entity_id: wsId,
        safe_payload: { name: "Zeus Mission Control" },
        created_at: now,
      },
    ]);
    this.tables.set("audit_events", []);
    this.tables.set("api_tokens", []);

    // 18. Connections (Integrations)
    this.tables.set("connections", [
      {
        id: "conn_unorouter_1",
        workspace_id: wsId,
        owner_id: userId,
        provider: "unorouter",
        kind: "api_key",
        status: "connected",
        scopes: ["chat:completions", "models:all", "routing:adaptive"],
        secret_ref: "vault:uno_primary_key_prod",
        created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3),
        updated_at: now,
      },
      {
        id: "conn_gemini_1",
        workspace_id: wsId,
        owner_id: userId,
        provider: "gemini",
        kind: "api_key",
        status: "connected",
        scopes: ["models/gemini-3.6-flash", "tools:call", "grounding"],
        secret_ref: "vault:gemini_live_adapter",
        created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2),
        updated_at: now,
      },
      {
        id: "conn_github_1",
        workspace_id: wsId,
        owner_id: userId,
        provider: "github",
        kind: "oauth",
        status: "connected",
        scopes: ["repo", "read:user", "pull_requests:write"],
        secret_ref: "vault:github_pat_oauth",
        created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 4),
        updated_at: now,
      },
      {
        id: "conn_neon_1",
        workspace_id: wsId,
        owner_id: userId,
        provider: "neon",
        kind: "platform_native",
        status: "connected",
        scopes: ["database:read_write", "branches:create"],
        secret_ref: "vault:neon_dsn",
        created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5),
        updated_at: now,
      },
      {
        id: "conn_vercel_1",
        workspace_id: wsId,
        owner_id: userId,
        provider: "vercel",
        kind: "api_key",
        status: "not_connected",
        scopes: ["deployments:create"],
        secret_ref: null,
        created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1),
        updated_at: now,
      },
    ]);

    // 19. Usage Records (Telemetry & Cost)
    this.tables.set("usage_records", [
      {
        id: "usage_rec_1",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_1",
        agent_code: "kai",
        provider: "gemini",
        model: "gemini-3.6-flash",
        input_tokens: 3420,
        output_tokens: 812,
        cached_tokens: 1240,
        estimated_cost: "0.00127500",
        latency_ms: 1240,
        created_at: new Date(now.getTime() - 1000 * 60 * 45),
      },
      {
        id: "usage_rec_2",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_2",
        agent_code: "jorge",
        provider: "unorouter",
        model: "anthropic/claude-3.5-sonnet",
        input_tokens: 5890,
        output_tokens: 1420,
        cached_tokens: 3100,
        estimated_cost: "0.00942000",
        latency_ms: 1980,
        created_at: new Date(now.getTime() - 1000 * 60 * 120),
      },
      {
        id: "usage_rec_3",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_3",
        agent_code: "lora",
        provider: "gemini",
        model: "gemini-3.6-flash",
        input_tokens: 2750,
        output_tokens: 640,
        cached_tokens: 950,
        estimated_cost: "0.00098000",
        latency_ms: 890,
        created_at: new Date(now.getTime() - 1000 * 60 * 180),
      },
      {
        id: "usage_rec_4",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_4",
        agent_code: "simon",
        provider: "unorouter",
        model: "openai/gpt-4o",
        input_tokens: 7120,
        output_tokens: 1890,
        cached_tokens: 4200,
        estimated_cost: "0.01425000",
        latency_ms: 2450,
        created_at: new Date(now.getTime() - 1000 * 60 * 360),
      },
      {
        id: "usage_rec_5",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_5",
        agent_code: "sara",
        provider: "gemini",
        model: "gemini-3.6-flash",
        input_tokens: 4190,
        output_tokens: 950,
        cached_tokens: 1800,
        estimated_cost: "0.00164000",
        latency_ms: 1120,
        created_at: new Date(now.getTime() - 1000 * 60 * 720),
      },
      {
        id: "usage_rec_6",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_6",
        agent_code: "kai",
        provider: "gemini",
        model: "gemini-3.6-flash",
        input_tokens: 6100,
        output_tokens: 1540,
        cached_tokens: 2800,
        estimated_cost: "0.00241000",
        latency_ms: 1650,
        created_at: new Date(now.getTime() - 1000 * 60 * 1440),
      },
      {
        id: "usage_rec_7",
        organization_id: orgId,
        workspace_id: wsId,
        run_id: "run_seed_7",
        agent_code: "jorge",
        provider: "unorouter",
        model: "anthropic/claude-3.5-sonnet",
        input_tokens: 8300,
        output_tokens: 2100,
        cached_tokens: 5200,
        estimated_cost: "0.01350000",
        latency_ms: 2200,
        created_at: new Date(now.getTime() - 1000 * 60 * 2880),
      },
    ]);
  }

  getTable(name: string): Row[] {
    const cleanName = name.toLowerCase().replace(/["']/g, "");
    if (!this.tables.has(cleanName)) {
      this.tables.set(cleanName, []);
    }
    return this.tables.get(cleanName)!;
  }

  query(queryArg: any, valuesArg?: any[]): { rows: any[]; rowCount?: number; command?: string } {
    const sql: string = typeof queryArg === "string" ? queryArg : queryArg?.text || "";
    const values: any[] = (typeof queryArg === "object" && queryArg?.values) || valuesArg || [];
    const isArrayMode = typeof queryArg === "object" && queryArg?.rowMode === "array";

    const normalizedSql = sql.trim().replace(/\s+/g, " ");

    // Handle transaction / session primitives
    if (
      /^(begin|commit|rollback)\b/i.test(normalizedSql) ||
      /^set\s+local\b/i.test(normalizedSql) ||
      /^select\s+set_config\b/i.test(normalizedSql) ||
      /pg_advisory/i.test(normalizedSql)
    ) {
      return { rows: [], rowCount: 0, command: "OK" };
    }

    // Handle INSERT
    const insertMatch = normalizedSql.match(/^insert\s+into\s+"?zeus"?\."?([a-z0-9_]+)"?\s*\((.*?)\)\s*values\s*(.*)/i);
    if (insertMatch && insertMatch[1] && insertMatch[2] && insertMatch[3]) {
      const tableName = insertMatch[1];
      const colsStr = insertMatch[2];
      const rest = insertMatch[3];
      const table = this.getTable(tableName);

      const cols = colsStr.split(",").map((s) => s.trim().replace(/["']/g, ""));

      // Match values tuples: ($1, $2, ...) or multiple ($1, $2), ($3, $4)
      const tupleMatches = [...rest.matchAll(/\(([^)]+)\)/g)];
      let valIdx = 0;
      const insertedRows: Row[] = [];

      for (const tuple of tupleMatches) {
        const row: Row = {};
        const tupleContent = tuple[1] || "";
        const placeholders = tupleContent.split(",").map((s) => s.trim());
        for (let i = 0; i < cols.length; i++) {
          const colName = cols[i];
          if (!colName) continue;
          const ph = placeholders[i];
          if (ph && ph.startsWith("$")) {
            const pIndex = parseInt(ph.slice(1), 10) - 1;
            row[colName] = values[pIndex];
          } else if (ph && ph === "now()") {
            row[colName] = new Date();
          } else if (ph && ph === "gen_random_uuid()") {
            row[colName] = crypto.randomUUID();
          } else {
            row[colName] = values[valIdx++];
          }
        }
        if (!row.created_at) row.created_at = new Date();
        if (!row.updated_at) row.updated_at = new Date();

        // Check ON CONFLICT
        const isConflictUpdate = /on\s+conflict\b.*?\bdo\s+update\b/i.test(rest);
        const isConflictNothing = /on\s+conflict\b.*?\bdo\s+nothing\b/i.test(rest);

        const primaryKeyCol = cols[0] || "id";
        const existingIdx = table.findIndex((r) => r[primaryKeyCol] === row[primaryKeyCol]);

        if (existingIdx >= 0) {
          const existingRow = table[existingIdx];
          if (isConflictUpdate && existingRow) {
            table[existingIdx] = { ...existingRow, ...row, updated_at: new Date() };
            insertedRows.push(table[existingIdx]!);
          } else if (isConflictNothing && existingRow) {
            insertedRows.push(existingRow);
          } else {
            table[existingIdx] = row;
            insertedRows.push(row);
          }
        } else {
          table.push(row);
          insertedRows.push(row);
        }
      }

      // Check RETURNING
      const returningMatch = rest.match(/returning\s+(.*)$/i);
      if (returningMatch && returningMatch[1]) {
        const retCols = returningMatch[1].split(",").map((s) => s.trim().replace(/["']/g, ""));
        const rows = insertedRows.map((r) =>
          isArrayMode ? retCols.map((c) => r[c]) : r,
        );
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: insertedRows.length };
    }

    // Handle UPDATE
    const updateMatch = normalizedSql.match(/^update\s+"?zeus"?\."?([a-z0-9_]+)"?\s+set\s+(.*?)(?:\s+where\s+(.*?))?(?:\s+returning\s+.*)?$/i);
    if (updateMatch && updateMatch[1] && updateMatch[2]) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const table = this.getTable(tableName);

      const updates: Record<string, any> = {};
      const setParts = setClause.split(",").map((s) => s.trim());
      for (const part of setParts) {
        const m = part.match(/"?([a-z0-9_]+)"?\s*=\s*(.*)/i);
        if (m && m[1] && m[2]) {
          const col = m[1];
          const valExpr = m[2].trim();
          if (valExpr.startsWith("$")) {
            const pIndex = parseInt(valExpr.slice(1), 10) - 1;
            updates[col] = values[pIndex];
          } else if (valExpr.toLowerCase() === "now()") {
            updates[col] = new Date();
          } else if (valExpr.toLowerCase() === "null") {
            updates[col] = null;
          }
        }
      }

      const matchedRows = this.filterRows(table, whereClause, values);
      for (const row of matchedRows) {
        Object.assign(row, updates);
      }
      return { rows: [], rowCount: matchedRows.length };
    }

    // Handle DELETE
    const deleteMatch = normalizedSql.match(/^delete\s+from\s+"?zeus"?\."?([a-z0-9_]+)"?(?:\s+where\s+(.*?))?$/i);
    if (deleteMatch && deleteMatch[1]) {
      const tableName = deleteMatch[1];
      const whereClause = deleteMatch[2];
      const table = this.getTable(tableName);
      const matched = this.filterRows(table, whereClause, values);
      const matchedSet = new Set(matched);
      const remaining = table.filter((r) => !matchedSet.has(r));
      this.tables.set(tableName.toLowerCase(), remaining);
      return { rows: [], rowCount: matched.length };
    }

    // Handle SELECT
    const selectMatch = normalizedSql.match(/^select\s+(.*?)\s+from\s+"?zeus"?\."?([a-z0-9_]+)"?(?:\s+(?:where|order|limit)\b.*)?$/i);
    if (selectMatch && selectMatch[1] && selectMatch[2]) {
      const colsPart = selectMatch[1];
      const tableName = selectMatch[2];
      const table = this.getTable(tableName);

      let whereClause: string | undefined;
      const whereMatch = normalizedSql.match(/\bwhere\s+(.*?)(?:\s+(?:order\s+by|limit)\b|$)/i);
      if (whereMatch && whereMatch[1]) {
        whereClause = whereMatch[1];
      }

      let filtered = this.filterRows(table, whereClause, values);

      // Handle ORDER BY
      const orderMatch = normalizedSql.match(/\border\s+by\s+(.*?)(?:\s+limit\b|$)/i);
      if (orderMatch && orderMatch[1]) {
        const orderExpr = orderMatch[1].trim();
        const desc = /\bdesc\b/i.test(orderExpr);
        const colMatch = orderExpr.match(/"?([a-z0-9_]+)"?/i);
        if (colMatch && colMatch[1]) {
          const col = colMatch[1];
          filtered.sort((a, b) => {
            const va = a[col];
            const vb = b[col];
            if (va == null && vb == null) return 0;
            if (va == null) return desc ? 1 : -1;
            if (vb == null) return desc ? -1 : 1;
            if (va instanceof Date && vb instanceof Date) {
              return desc ? vb.getTime() - va.getTime() : va.getTime() - vb.getTime();
            }
            if (va < vb) return desc ? 1 : -1;
            if (va > vb) return desc ? -1 : 1;
            return 0;
          });
        }
      }

      // Handle LIMIT
      const limitMatch = normalizedSql.match(/\blimit\s+(\$?\d+)/i);
      if (limitMatch && limitMatch[1]) {
        const limitStr = limitMatch[1];
        const lim = limitStr.startsWith("$")
          ? values[parseInt(limitStr.slice(1), 10) - 1]
          : parseInt(limitStr, 10);
        if (typeof lim === "number") {
          filtered = filtered.slice(0, lim);
        }
      }

      // Format output rows
      if (colsPart.trim() === "count(*)") {
        const countVal = filtered.length;
        const rows = isArrayMode ? [[countVal]] : [{ count: countVal }];
        return { rows, rowCount: 1 };
      }

      const cols = colsPart.split(",").map((s) => {
        // May have aliases: "table"."col" as "col" or just "col"
        const clean = s.trim();
        const asMatch = clean.match(/as\s+"?([a-z0-9_]+)"?$/i);
        if (asMatch && asMatch[1]) return asMatch[1];
        const dotMatch = clean.match(/"?[a-z0-9_]+"?\."?([a-z0-9_]+)"?$/i);
        if (dotMatch && dotMatch[1]) return dotMatch[1];
        return clean.replace(/["']/g, "");
      });

      const formattedRows = filtered.map((row) => {
        if (isArrayMode) {
          return cols.map((col) => row[col]);
        }
        const obj: Row = {};
        for (const col of cols) {
          obj[col] = row[col];
        }
        return obj;
      });

      return { rows: formattedRows, rowCount: formattedRows.length };
    }

    // Default fallback
    return { rows: [], rowCount: 0 };
  }

  private filterRows(rows: Row[], whereClause?: string, values?: any[]): Row[] {
    if (!whereClause) return [...rows];

    // Split by AND (case-insensitive)
    const conditions = whereClause.split(/\s+and\s+/i);

    return rows.filter((row) => {
      for (const cond of conditions) {
        // "col" >= $1, <= $1, > $1, < $1, != $1, = $1
        const cmpParamMatch = cond.match(/"?([a-z0-9_]+)"?\s*(>=|<=|!=|<>|>|<|=)\s*\$(\d+)/i);
        if (cmpParamMatch && cmpParamMatch[1] && cmpParamMatch[2] && cmpParamMatch[3]) {
          const col = cmpParamMatch[1];
          const op = cmpParamMatch[2];
          const valIdx = parseInt(cmpParamMatch[3], 10) - 1;
          const targetVal = values ? values[valIdx] : undefined;
          const rowVal = row[col];

          if (op === "=") {
            if (rowVal !== targetVal) return false;
          } else if (op === "!=" || op === "<>") {
            if (rowVal === targetVal) return false;
          } else {
            const rTime = rowVal instanceof Date ? rowVal.getTime() : rowVal;
            const tTime = targetVal instanceof Date ? targetVal.getTime() : targetVal;
            if (op === ">=" && !(rTime >= tTime)) return false;
            if (op === "<=" && !(rTime <= tTime)) return false;
            if (op === ">" && !(rTime > tTime)) return false;
            if (op === "<" && !(rTime < tTime)) return false;
          }
          continue;
        }

        // "col" is null
        const isNullMatch = cond.match(/"?([a-z0-9_]+)"?\s+is\s+null/i);
        if (isNullMatch && isNullMatch[1]) {
          const col = isNullMatch[1];
          if (row[col] != null) return false;
          continue;
        }

        // "col" is not null
        const isNotNullMatch = cond.match(/"?([a-z0-9_]+)"?\s+is\s+not\s+null/i);
        if (isNotNullMatch && isNotNullMatch[1]) {
          const col = isNotNullMatch[1];
          if (row[col] == null) return false;
          continue;
        }

        // "col" in ($1, $2, ...)
        const inMatch = cond.match(/"?([a-z0-9_]+)"?\s+in\s*\(([^)]+)\)/i);
        if (inMatch && inMatch[1] && inMatch[2]) {
          const col = inMatch[1];
          const phs = inMatch[2].split(",").map((s) => s.trim());
          const targetVals = phs.map((ph) => {
            if (ph.startsWith("$") && values) {
              return values[parseInt(ph.slice(1), 10) - 1];
            }
            return ph.replace(/['"]/g, "");
          });
          if (!targetVals.includes(row[col])) return false;
          continue;
        }

        // "col" = 'literal'
        const eqLitMatch = cond.match(/"?([a-z0-9_]+)"?\s*=\s*['"](.*?)['"]/i);
        if (eqLitMatch && eqLitMatch[1] && eqLitMatch[2]) {
          const col = eqLitMatch[1];
          const val = eqLitMatch[2];
          if (String(row[col]) !== val) return false;
          continue;
        }
      }
      return true;
    });
  }
}

export const mockDbInstance = new MockDatabase();

export function createMockPgClient() {
  return {
    query: async (queryArg: any, valuesArg?: any[]) => {
      return mockDbInstance.query(queryArg, valuesArg);
    },
    release: () => {},
    connect: async () => createMockPgClient(),
    end: async () => {},
    on: () => {},
    removeListener: () => {},
  };
}
