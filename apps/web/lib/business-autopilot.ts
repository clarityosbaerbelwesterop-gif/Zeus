import { randomUUID } from "node:crypto";
import type { AgentCode } from "@zeus/agents";
import { requireSession } from "@zeus/auth/server";
import {
  companies,
  missions,
  planSteps,
  plans,
  runtimeRuns,
  taskDependencies,
  tasks,
  teamRunMembers,
  teamRuns,
  withActor,
  workspaceAgents,
  workspaceEvents,
  workspaceMembers,
  workspaces,
} from "@zeus/db";
import {
  readyTeamTasks,
  validateTeamTaskGraph,
  type TeamTask,
} from "@zeus/runtime/team-automation";
import { shortTitleSchema, workspaceObjectiveSchema } from "@zeus/shared";
import { can, isWorkspaceRole } from "@zeus/workspace";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { startTaskRun } from "./agent-runtime";

const AUTOPILOT_AGENTS: readonly AgentCode[] = ["kai", "lora", "jorge", "simon", "sara"];

interface AutopilotTaskTemplate {
  readonly key: string;
  readonly title: string;
  readonly agent: AgentCode;
  readonly description: string;
  readonly dependsOn: readonly string[];
}

const AUTOPILOT_TASKS: readonly AutopilotTaskTemplate[] = [
  {
    key: "operate",
    title: "Define the operating system and execution brief",
    agent: "kai",
    description:
      "Turn the approved business objective into a concrete execution brief. Define milestones, owners, dependencies, success metrics, known constraints and the order of work. Persist important decisions and leave the workspace in a state the specialist agents can execute without inventing authority.",
    dependsOn: [],
  },
  {
    key: "build",
    title: "Build the product and production foundation",
    agent: "lora",
    description:
      "Implement the approved product and technical foundation using the connected repository and infrastructure that are actually available. Reuse existing architecture, produce durable artifacts and verification evidence, and do not claim deployment or integration work that was not performed.",
    dependsOn: ["operate"],
  },
  {
    key: "design",
    title: "Design the product experience and customer journey",
    agent: "jorge",
    description:
      "Shape the approved product into a coherent end-to-end user experience. Define the information architecture, onboarding, ChatHub/work surface, operating states, approval moments and visual QA requirements while staying inside the approved business plan.",
    dependsOn: ["operate"],
  },
  {
    key: "go-to-market",
    title: "Prepare go-to-market, support and commercial operations",
    agent: "sara",
    description:
      "Prepare the launch and ongoing commercial workflow: positioning, customer qualification, support handoff, CRM-ready operating steps and outbound drafts. Do not send external communications or make commitments that require separate authorization.",
    dependsOn: ["operate"],
  },
  {
    key: "verify",
    title: "Verify security, quality and launch readiness",
    agent: "simon",
    description:
      "Research and audit the delivered product, UX and operational setup. Run the available tests, inspect security boundaries and regression risks, verify evidence from the other agents and record concrete blockers. Only mark work ready when the evidence supports it.",
    dependsOn: ["build", "design", "go-to-market"],
  },
];

async function actorId(): Promise<string> {
  const session = await requireSession();
  return String(session.user.id);
}

async function requireAutopilotAccess(userId: string, workspaceId: string): Promise<void> {
  await withActor(userId, async (db) => {
    const membership = (
      await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
        )
        .limit(1)
    )[0];
    if (
      !membership ||
      !isWorkspaceRole(membership.role) ||
      !can(membership.role, "workspace.manage") ||
      !can(membership.role, "plan.write") ||
      !can(membership.role, "task.write")
    ) {
      throw new Error("Business Autopilot requires workspace management access.");
    }
  });
}

export async function draftBusinessAutopilot(input: {
  workspaceId: string;
  businessName: string;
  objective: string;
}): Promise<{ planId: string; teamRunId: string; missionId: string }> {
  const userId = await actorId();
  await requireAutopilotAccess(userId, input.workspaceId);
  const businessName = shortTitleSchema.parse(input.businessName.trim());
  const objective = workspaceObjectiveSchema.parse(input.objective);
  const planId = randomUUID();
  const teamRunId = randomUUID();
  const missionId = randomUUID();

  await withActor(userId, async (db) => {
    const workspace = (
      await db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, input.workspaceId))
        .limit(1)
    )[0];
    if (!workspace) throw new Error("Workspace not found.");

    const existingCompany = (
      await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.workspaceId, input.workspaceId))
        .limit(1)
    )[0];
    const companyId = existingCompany?.id ?? randomUUID();
    if (existingCompany) {
      await db
        .update(companies)
        .set({ name: businessName, mission: objective, status: "planning", updatedAt: new Date() })
        .where(eq(companies.id, companyId));
    } else {
      await db.insert(companies).values({
        id: companyId,
        organizationId: workspace.organizationId,
        workspaceId: input.workspaceId,
        name: businessName,
        mission: objective,
        status: "planning",
        createdBy: userId,
      });
    }

    await db
      .insert(workspaceAgents)
      .values(
        AUTOPILOT_AGENTS.map((agentCode) => ({
          workspaceId: input.workspaceId,
          agentCode,
          enabledBy: userId,
        })),
      )
      .onConflictDoNothing();

    await db.insert(plans).values({
      id: planId,
      workspaceId: input.workspaceId,
      title: `${businessName} · operating plan`.slice(0, 240),
      objective,
      status: "draft",
      createdBy: userId,
    });

    await db.insert(missions).values({
      id: missionId,
      organizationId: workspace.organizationId,
      workspaceId: input.workspaceId,
      companyId,
      planId,
      title: `${businessName} · initial build`.slice(0, 240),
      outcome: objective,
      status: "awaiting_approval",
      approvalRequired: true,
      idempotencyKey: `business-autopilot:${planId}`,
      createdBy: userId,
    });

    const taskIds = new Map<string, string>();
    for (const template of AUTOPILOT_TASKS) taskIds.set(template.key, randomUUID());

    await db.insert(tasks).values(
      AUTOPILOT_TASKS.map((template) => ({
        id: taskIds.get(template.key)!,
        workspaceId: input.workspaceId,
        title: template.title,
        description:
          `${template.description}\n\nBusiness: ${businessName}\nObjective: ${objective}`.slice(
            0,
            12_000,
          ),
        status: "backlog",
        priority: template.agent === "simon" ? "high" : "medium",
        assignedAgent: template.agent,
        createdBy: userId,
      })),
    );

    await db.insert(planSteps).values(
      AUTOPILOT_TASKS.map((template, index) => ({
        id: randomUUID(),
        planId,
        sequence: index + 1,
        title: template.title,
        description: template.description,
        status: "backlog",
        assignedAgent: template.agent,
        taskId: taskIds.get(template.key)!,
      })),
    );

    const dependencyRows = AUTOPILOT_TASKS.flatMap((template) =>
      template.dependsOn.map((dependency) => ({
        workspaceId: input.workspaceId,
        taskId: taskIds.get(template.key)!,
        dependsOnTaskId: taskIds.get(dependency)!,
        createdBy: userId,
      })),
    );
    if (dependencyRows.length) await db.insert(taskDependencies).values(dependencyRows);

    const graph: TeamTask[] = AUTOPILOT_TASKS.map((template) => ({
      id: taskIds.get(template.key)!,
      agent: template.agent,
      dependsOn: template.dependsOn.map((key) => taskIds.get(key)!),
      ...(template.agent === "lora" || template.agent === "jorge" || template.agent === "sara"
        ? { reviewBy: "simon" as const }
        : {}),
    }));
    validateTeamTaskGraph(graph);

    await db.insert(teamRuns).values({
      id: teamRunId,
      organizationId: workspace.organizationId,
      workspaceId: input.workspaceId,
      objective,
      status: "planning",
      coordinatorAgent: "kai",
      createdBy: userId,
      maxParallel: 3,
      maxRework: 2,
      idempotencyKey: `business-autopilot:${planId}`,
    });

    await db.insert(workspaceEvents).values({
      organizationId: workspace.organizationId,
      workspaceId: input.workspaceId,
      actorType: "system",
      actorId: userId,
      eventType: "autopilot.plan_drafted",
      entityType: "mission",
      entityId: missionId,
      safePayload: { planId, teamRunId, businessName, taskCount: AUTOPILOT_TASKS.length },
    });
  });

  return { planId, teamRunId, missionId };
}

async function planGraph(userId: string, workspaceId: string, planId: string): Promise<TeamTask[]> {
  return withActor(userId, async (db) => {
    const steps = await db
      .select({ taskId: planSteps.taskId, assignedAgent: planSteps.assignedAgent })
      .from(planSteps)
      .where(eq(planSteps.planId, planId))
      .orderBy(asc(planSteps.sequence));
    const taskIds = steps.flatMap((step) => (step.taskId ? [step.taskId] : []));
    if (!taskIds.length) return [];
    const dependencies = await db
      .select()
      .from(taskDependencies)
      .where(inArray(taskDependencies.taskId, taskIds));
    return steps.flatMap((step) => {
      if (!step.taskId || !AUTOPILOT_AGENTS.includes(step.assignedAgent as AgentCode)) return [];
      return [
        {
          id: step.taskId,
          agent: step.assignedAgent as AgentCode,
          dependsOn: dependencies
            .filter((dependency) => dependency.taskId === step.taskId)
            .map((dependency) => dependency.dependsOnTaskId),
        },
      ];
    });
  });
}

async function markRunResult(
  userId: string,
  workspaceId: string,
  planId: string,
  teamRunId: string,
  task: TeamTask,
  runId: string,
): Promise<boolean> {
  return withActor(userId, async (db) => {
    const run = (
      await db
        .select({ status: runtimeRuns.status })
        .from(runtimeRuns)
        .where(eq(runtimeRuns.id, runId))
        .limit(1)
    )[0];
    await db.insert(teamRunMembers).values({
      teamRunId,
      runId,
      taskId: task.id,
      agentCode: task.agent,
      role:
        task.agent === "kai" ? "coordinator" : task.agent === "simon" ? "reviewer" : "specialist",
    });
    if (run?.status !== "completed") return false;
    const now = new Date();
    await db
      .update(tasks)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(and(eq(tasks.id, task.id), eq(tasks.workspaceId, workspaceId)));
    await db
      .update(planSteps)
      .set({ status: "completed", runId, updatedAt: now })
      .where(and(eq(planSteps.planId, planId), eq(planSteps.taskId, task.id)));
    return true;
  });
}

export async function approveAndRunBusinessAutopilot(input: {
  workspaceId: string;
  planId: string;
  teamRunId: string;
}): Promise<void> {
  const userId = await actorId();
  await requireAutopilotAccess(userId, input.workspaceId);
  const graph = await planGraph(userId, input.workspaceId, input.planId);
  validateTeamTaskGraph(graph);

  await withActor(userId, async (db) => {
    const teamRun = (
      await db
        .select()
        .from(teamRuns)
        .where(and(eq(teamRuns.id, input.teamRunId), eq(teamRuns.workspaceId, input.workspaceId)))
        .limit(1)
    )[0];
    const plan = (
      await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.workspaceId, input.workspaceId)))
        .limit(1)
    )[0];
    const mission = (
      await db
        .select()
        .from(missions)
        .where(and(eq(missions.planId, input.planId), eq(missions.workspaceId, input.workspaceId)))
        .limit(1)
    )[0];
    if (!teamRun || !plan || !mission) throw new Error("Autopilot draft not found.");
    if (
      teamRun.status !== "planning" ||
      plan.status !== "draft" ||
      mission.status !== "awaiting_approval"
    ) {
      throw new Error("This Autopilot plan has already been approved or is no longer executable.");
    }
    const now = new Date();
    await db
      .update(plans)
      .set({ status: "active", updatedAt: now })
      .where(eq(plans.id, input.planId));
    await db
      .update(missions)
      .set({ status: "running", approvedBy: userId, approvedAt: now, updatedAt: now })
      .where(eq(missions.id, mission.id));
    await db
      .update(companies)
      .set({ status: "building", updatedAt: now })
      .where(eq(companies.id, mission.companyId!));
    await db
      .update(teamRuns)
      .set({ status: "running", startedAt: now, updatedAt: now })
      .where(eq(teamRuns.id, input.teamRunId));
    await db
      .update(planSteps)
      .set({ status: "ready", updatedAt: now })
      .where(eq(planSteps.planId, input.planId));
  });

  const completed = new Set<string>();
  let failed = false;
  for (let wave = 0; wave < AUTOPILOT_TASKS.length && completed.size < graph.length; wave += 1) {
    const ready = readyTeamTasks(graph, completed, new Set(), 3);
    if (!ready.length) {
      failed = true;
      break;
    }
    const results = await Promise.allSettled(
      ready.map(async (task) => {
        const runId = await startTaskRun(input.workspaceId, task.id);
        const completedRun = await markRunResult(
          userId,
          input.workspaceId,
          input.planId,
          input.teamRunId,
          task,
          runId,
        );
        if (!completedRun) throw new Error(`Agent ${task.agent} did not complete its run.`);
        return task.id;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") completed.add(result.value);
      else failed = true;
    }
    if (failed) break;
  }

  await withActor(userId, async (db) => {
    const workspace = (
      await db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, input.workspaceId))
        .limit(1)
    )[0];
    const mission = (
      await db
        .select({ id: missions.id, companyId: missions.companyId })
        .from(missions)
        .where(and(eq(missions.planId, input.planId), eq(missions.workspaceId, input.workspaceId)))
        .limit(1)
    )[0];
    if (!workspace || !mission) throw new Error("Workspace mission not found.");
    const allCompleted = completed.size === graph.length && !failed;
    const now = new Date();
    await db
      .update(teamRuns)
      .set({
        status: allCompleted ? "completed" : "blocked",
        ...(allCompleted ? { completedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(teamRuns.id, input.teamRunId));
    await db
      .update(missions)
      .set({ status: allCompleted ? "completed" : "blocked", updatedAt: now })
      .where(eq(missions.id, mission.id));
    if (mission.companyId) {
      await db
        .update(companies)
        .set({ status: allCompleted ? "operating" : "planning", updatedAt: now })
        .where(eq(companies.id, mission.companyId));
    }
    await db.insert(workspaceEvents).values({
      organizationId: workspace.organizationId,
      workspaceId: input.workspaceId,
      actorType: "system",
      actorId: userId,
      eventType: allCompleted ? "autopilot.initial_build_completed" : "autopilot.blocked",
      entityType: "mission",
      entityId: mission.id,
      safePayload: {
        planId: input.planId,
        teamRunId: input.teamRunId,
        completedTasks: completed.size,
        totalTasks: graph.length,
      },
    });
  });
}

export async function businessAutopilotState(workspaceId: string) {
  const userId = await actorId();
  await requireAutopilotAccess(userId, workspaceId);
  return withActor(userId, async (db) => {
    const latestRun = (
      await db
        .select()
        .from(teamRuns)
        .where(eq(teamRuns.workspaceId, workspaceId))
        .orderBy(desc(teamRuns.createdAt))
        .limit(1)
    )[0];
    if (!latestRun) {
      return { latestRun: null, plan: null, mission: null, company: null, steps: [], members: [] };
    }
    const planId = latestRun.idempotencyKey.startsWith("business-autopilot:")
      ? latestRun.idempotencyKey.slice("business-autopilot:".length)
      : null;
    const plan = planId
      ? (
          await db
            .select()
            .from(plans)
            .where(and(eq(plans.id, planId), eq(plans.workspaceId, workspaceId)))
            .limit(1)
        )[0]
      : null;
    const mission = planId
      ? (
          await db
            .select()
            .from(missions)
            .where(and(eq(missions.planId, planId), eq(missions.workspaceId, workspaceId)))
            .limit(1)
        )[0]
      : null;
    const company = mission?.companyId
      ? (await db.select().from(companies).where(eq(companies.id, mission.companyId)).limit(1))[0]
      : null;
    const steps = plan
      ? await db
          .select()
          .from(planSteps)
          .where(eq(planSteps.planId, plan.id))
          .orderBy(asc(planSteps.sequence))
      : [];
    const members = await db
      .select()
      .from(teamRunMembers)
      .where(eq(teamRunMembers.teamRunId, latestRun.id))
      .orderBy(asc(teamRunMembers.createdAt));
    return {
      latestRun,
      plan: plan ?? null,
      mission: mission ?? null,
      company: company ?? null,
      steps,
      members,
    };
  });
}
