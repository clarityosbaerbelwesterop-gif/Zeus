BEGIN;

CREATE TABLE zeus.team_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  objective text NOT NULL CHECK(length(objective) BETWEEN 1 AND 20000),
  status text NOT NULL CHECK(status IN ('planning','ready','running','waiting','blocked','integrating','verifying','completed','failed','cancelled')),
  coordinator_agent text NOT NULL DEFAULT 'jorge' REFERENCES zeus.agent_templates(code),
  created_by text NOT NULL REFERENCES zeus.users(id),
  max_parallel integer NOT NULL DEFAULT 3 CHECK(max_parallel BETWEEN 1 AND 5),
  max_rework integer NOT NULL DEFAULT 2 CHECK(max_rework BETWEEN 0 AND 4),
  idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,idempotency_key)
);

CREATE TABLE zeus.team_run_members (
  team_run_id uuid NOT NULL REFERENCES zeus.team_runs(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES zeus.runs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES zeus.tasks(id) ON DELETE SET NULL,
  agent_code text NOT NULL REFERENCES zeus.agent_templates(code),
  role text NOT NULL CHECK(role IN ('coordinator','specialist','reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(team_run_id,run_id)
);

CREATE TABLE zeus.task_dependencies (
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES zeus.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES zeus.tasks(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id,depends_on_task_id),
  CHECK(task_id <> depends_on_task_id)
);

CREATE TABLE zeus.handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  team_run_id uuid NOT NULL REFERENCES zeus.team_runs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES zeus.tasks(id) ON DELETE SET NULL,
  from_agent text NOT NULL REFERENCES zeus.agent_templates(code),
  to_agent text NOT NULL REFERENCES zeus.agent_templates(code),
  summary text NOT NULL CHECK(length(summary) BETWEEN 1 AND 8000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rework_count integer NOT NULL DEFAULT 0 CHECK(rework_count BETWEEN 0 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(from_agent <> to_agent)
);

CREATE TABLE zeus.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES zeus.users(id),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  instruction text NOT NULL CHECK(length(instruction) BETWEEN 1 AND 12000),
  schedule_type text NOT NULL CHECK(schedule_type IN ('one_time','scheduled','recurring','condition_watch')),
  schedule_definition jsonb NOT NULL,
  agent_code text REFERENCES zeus.agent_templates(code),
  team_mode boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK(status IN ('active','paused','completed','failed','deleted')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE zeus.automation_runs (
  automation_id uuid NOT NULL REFERENCES zeus.automations(id) ON DELETE CASCADE,
  run_id uuid REFERENCES zeus.runs(id) ON DELETE SET NULL,
  team_run_id uuid REFERENCES zeus.team_runs(id) ON DELETE SET NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  trigger_key text NOT NULL CHECK(length(trigger_key) BETWEEN 8 AND 200),
  status text NOT NULL CHECK(status IN ('triggered','running','completed','failed','cancelled')),
  PRIMARY KEY(automation_id,trigger_key),
  CHECK((run_id IS NOT NULL)::integer + (team_run_id IS NOT NULL)::integer <= 1)
);

CREATE INDEX team_runs_workspace_idx ON zeus.team_runs(workspace_id,created_at DESC);
CREATE INDEX team_run_members_team_idx ON zeus.team_run_members(team_run_id,created_at);
CREATE INDEX task_dependencies_workspace_idx ON zeus.task_dependencies(workspace_id,task_id);
CREATE INDEX handoffs_team_idx ON zeus.handoffs(team_run_id,created_at);
CREATE INDEX automations_due_idx ON zeus.automations(status,next_run_at) WHERE status='active';
CREATE INDEX automation_runs_history_idx ON zeus.automation_runs(automation_id,triggered_at DESC);

GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.team_runs,zeus.team_run_members,zeus.task_dependencies,zeus.handoffs,zeus.automations,zeus.automation_runs TO zeus_app;

ALTER TABLE zeus.team_runs ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.team_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.team_run_members ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.team_run_members FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.task_dependencies ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.task_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.handoffs ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.handoffs FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.automations ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.automations FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.automation_runs ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.automation_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY team_runs_actor ON zeus.team_runs TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id) AND organization_id=(SELECT w.organization_id FROM zeus.workspaces w WHERE w.id=workspace_id));
CREATE POLICY team_run_members_actor ON zeus.team_run_members TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.team_runs tr WHERE tr.id=team_run_id AND zeus.is_workspace_member(tr.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.team_runs tr WHERE tr.id=team_run_id AND zeus.is_workspace_member(tr.workspace_id)));
CREATE POLICY task_dependencies_actor ON zeus.task_dependencies TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id) AND EXISTS(SELECT 1 FROM zeus.tasks a JOIN zeus.tasks b ON b.id=task_dependencies.depends_on_task_id WHERE a.id=task_dependencies.task_id AND a.workspace_id=task_dependencies.workspace_id AND b.workspace_id=task_dependencies.workspace_id));
CREATE POLICY handoffs_actor ON zeus.handoffs TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id) AND organization_id=(SELECT w.organization_id FROM zeus.workspaces w WHERE w.id=workspace_id));
CREATE POLICY automations_actor ON zeus.automations TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id) AND organization_id=(SELECT w.organization_id FROM zeus.workspaces w WHERE w.id=workspace_id));
CREATE POLICY automation_runs_actor ON zeus.automation_runs TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.automations a WHERE a.id=automation_id AND zeus.is_workspace_member(a.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.automations a WHERE a.id=automation_id AND zeus.is_workspace_member(a.workspace_id)));

COMMIT;