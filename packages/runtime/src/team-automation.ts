export type TeamRunStatus =
  | "planning"
  | "ready"
  | "running"
  | "waiting"
  | "blocked"
  | "integrating"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type AutomationScheduleType = "one_time" | "scheduled" | "recurring" | "condition_watch";
export type AgentCode = "jorge" | "kai" | "lora" | "simon" | "sara";

export interface TeamTask {
  readonly id: string;
  readonly agent: AgentCode;
  readonly dependsOn: readonly string[];
  readonly reviewBy?: AgentCode;
  readonly reworkCount?: number;
}

export interface TeamExecutionLimits {
  readonly maxParallel: number;
  readonly maxTasks: number;
  readonly maxRework: number;
}

export const DEFAULT_TEAM_LIMITS: TeamExecutionLimits = Object.freeze({
  maxParallel: 3,
  maxTasks: 12,
  maxRework: 2,
});

export function validateTeamTaskGraph(
  tasks: readonly TeamTask[],
  limits: TeamExecutionLimits = DEFAULT_TEAM_LIMITS,
): void {
  if (!tasks.length) throw new Error("TeamRun requires at least one task.");
  if (tasks.length > limits.maxTasks) throw new Error("TeamRun task limit exceeded.");
  if (limits.maxParallel < 1 || limits.maxParallel > 5) throw new Error("Invalid TeamRun concurrency.");
  const byId = new Map<string, TeamTask>();
  for (const task of tasks) {
    if (!task.id || byId.has(task.id)) throw new Error("TeamRun contains duplicate task IDs.");
    if ((task.reworkCount ?? 0) > limits.maxRework) throw new Error("TeamRun rework limit exceeded.");
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`Unknown TeamRun dependency: ${dependency}`);
      if (dependency === task.id) throw new Error("A task cannot depend on itself.");
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("TeamRun task graph contains a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}

export function readyTeamTasks(
  tasks: readonly TeamTask[],
  completed: ReadonlySet<string>,
  running: ReadonlySet<string>,
  maxParallel = DEFAULT_TEAM_LIMITS.maxParallel,
): readonly TeamTask[] {
  const slots = Math.max(0, Math.min(5, maxParallel) - running.size);
  if (!slots) return [];
  return tasks
    .filter(
      (task) =>
        !completed.has(task.id) &&
        !running.has(task.id) &&
        task.dependsOn.every((dependency) => completed.has(dependency)),
    )
    .slice(0, slots);
}

export interface HandoffInput {
  readonly from: AgentCode;
  readonly to: AgentCode;
  readonly summary: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly openQuestions?: readonly string[];
}

export function safeHandoff(input: HandoffInput): HandoffInput {
  if (input.from === input.to) throw new Error("Handoff requires two different agents.");
  const summary = input.summary.trim();
  if (!summary || summary.length > 8_000) throw new Error("Invalid handoff summary.");
  return Object.freeze({
    from: input.from,
    to: input.to,
    summary,
    evidence: Object.freeze({ ...(input.evidence ?? {}) }),
    openQuestions: Object.freeze([...(input.openQuestions ?? [])].slice(0, 20)),
  });
}

export interface AutomationSchedule {
  readonly type: AutomationScheduleType;
  readonly at?: string;
  readonly intervalMinutes?: number;
}

export function nextAutomationRun(schedule: AutomationSchedule, now: Date): Date | null {
  if (schedule.type === "one_time" || schedule.type === "scheduled") {
    if (!schedule.at) throw new Error("Scheduled automation requires an ISO time.");
    const at = new Date(schedule.at);
    if (!Number.isFinite(at.getTime())) throw new Error("Automation time is invalid.");
    return at.getTime() > now.getTime() ? at : null;
  }
  const minimum = schedule.type === "condition_watch" ? 60 : 15;
  const interval = schedule.intervalMinutes;
  if (!interval || !Number.isInteger(interval) || interval < minimum || interval > 43_200) {
    throw new Error(`Automation interval must be between ${minimum} and 43200 minutes.`);
  }
  return new Date(now.getTime() + interval * 60_000);
}

export function automationMayPerformSideEffect(level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level <= 2;
}
