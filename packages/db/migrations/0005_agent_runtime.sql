BEGIN;

ALTER TABLE zeus.runs
  ADD COLUMN organization_id uuid,
  ADD COLUMN run_type text NOT NULL DEFAULT 'conversation_run',
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'user',
  ADD COLUMN task_id uuid,
  ADD COLUMN plan_step_id uuid,
  ADD COLUMN parent_run_id uuid,
  ADD COLUMN retry_of_run_id uuid,
  ADD COLUMN idempotency_key text,
  ADD COLUMN error_code text,
  ADD COLUMN safe_error_detail text,
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN heartbeat_at timestamptz,
  ADD COLUMN context_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE zeus.runs r
SET organization_id = w.organization_id,
    idempotency_key = 'legacy:' || r.id::text
FROM zeus.workspaces w
WHERE w.id = r.workspace_id;

ALTER TABLE zeus.runs
  ALTER COLUMN organization_id SET NOT NULL,
  ADD CONSTRAINT runs_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id),
  ADD CONSTRAINT runs_task_workspace FOREIGN KEY(task_id,workspace_id)
    REFERENCES zeus.tasks(id,workspace_id),
  ADD CONSTRAINT runs_parent_workspace FOREIGN KEY(parent_run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id),
  ADD CONSTRAINT runs_retry_workspace FOREIGN KEY(retry_of_run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id),
  ADD CONSTRAINT runs_plan_step_fk FOREIGN KEY(plan_step_id)
    REFERENCES zeus.plan_steps(id) ON DELETE SET NULL,
  ADD CONSTRAINT runs_run_type_check CHECK(run_type IN ('conversation_run','task_run','plan_step_run')),
  ADD CONSTRAINT runs_status_check CHECK(status IN ('queued','preparing','running','waiting','verifying','completed','failed','cancelled','paused','needs_user_input','needs_authorization'));

CREATE UNIQUE INDEX runs_workspace_idempotency_unique
  ON zeus.runs(workspace_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX runs_dispatch_idx ON zeus.runs(status,lease_expires_at,created_at);
CREATE INDEX runs_task_idx ON zeus.runs(task_id,created_at DESC) WHERE task_id IS NOT NULL;

ALTER TABLE zeus.run_steps
  ADD COLUMN step_type text NOT NULL DEFAULT 'model',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT run_steps_id_run UNIQUE(id,run_id),
  ADD CONSTRAINT run_steps_status_check CHECK(status IN ('pending','running','waiting','completed','failed','skipped','cancelled'));

CREATE FUNCTION zeus.guard_run_plan_step_workspace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zeus AS $$
BEGIN
  IF NEW.plan_step_id IS NOT NULL AND NOT EXISTS(
    SELECT 1
    FROM zeus.plan_steps ps
    JOIN zeus.plans p ON p.id=ps.plan_id
    WHERE ps.id=NEW.plan_step_id AND p.workspace_id=NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'Run plan step must belong to the same workspace' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeus.guard_run_plan_step_workspace() FROM PUBLIC;
CREATE TRIGGER run_plan_step_workspace_guard
  BEFORE INSERT OR UPDATE OF plan_step_id,workspace_id ON zeus.runs
  FOR EACH ROW EXECUTE FUNCTION zeus.guard_run_plan_step_workspace();

CREATE TABLE zeus.run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  event_type text NOT NULL,
  safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT run_events_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id),
  CONSTRAINT run_events_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT run_events_payload_bound CHECK(octet_length(safe_payload::text) <= 16384)
);
CREATE INDEX run_events_run_created_idx ON zeus.run_events(run_id,created_at);

CREATE TABLE zeus.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  run_step_id uuid,
  invocation_id text NOT NULL,
  tool_id text NOT NULL,
  side_effect_level integer NOT NULL,
  status text NOT NULL,
  safe_input_summary text NOT NULL DEFAULT '',
  safe_output_summary text,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_calls_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id),
  CONSTRAINT tool_calls_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT tool_calls_step_run FOREIGN KEY(run_step_id,run_id)
    REFERENCES zeus.run_steps(id,run_id) ON DELETE SET NULL,
  CONSTRAINT tool_calls_side_effect_check CHECK(side_effect_level BETWEEN 0 AND 4),
  CONSTRAINT tool_calls_status_check CHECK(status IN ('requested','running','completed','failed','cancelled','waiting_authorization')),
  CONSTRAINT tool_calls_input_bound CHECK(octet_length(safe_input_summary) <= 4096),
  CONSTRAINT tool_calls_output_bound CHECK(safe_output_summary IS NULL OR octet_length(safe_output_summary) <= 4096),
  CONSTRAINT tool_calls_invocation_unique UNIQUE(run_id,invocation_id)
);
CREATE INDEX tool_calls_run_created_idx ON zeus.tool_calls(run_id,created_at);

CREATE TABLE zeus.verification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  status text NOT NULL,
  check_name text NOT NULL,
  safe_detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id),
  CONSTRAINT verification_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT verification_status_check CHECK(status IN ('passed','failed','skipped')),
  CONSTRAINT verification_detail_bound CHECK(octet_length(safe_detail) <= 4096)
);
CREATE INDEX verification_run_created_idx ON zeus.verification_results(run_id,created_at);

CREATE TABLE zeus.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  agent_code text NOT NULL REFERENCES zeus.agent_templates(code),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  estimated_cost numeric(18,8),
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id),
  CONSTRAINT usage_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT usage_nonnegative CHECK(
    (input_tokens IS NULL OR input_tokens >= 0) AND
    (output_tokens IS NULL OR output_tokens >= 0) AND
    (cached_tokens IS NULL OR cached_tokens >= 0) AND
    (estimated_cost IS NULL OR estimated_cost >= 0) AND
    (latency_ms IS NULL OR latency_ms >= 0)
  )
);
CREATE INDEX usage_run_created_idx ON zeus.usage_records(run_id,created_at);

CREATE TABLE zeus.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  tool_call_id uuid,
  risk_level integer NOT NULL,
  safe_summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  CONSTRAINT approval_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id),
  CONSTRAINT approval_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT approval_tool_call_fk FOREIGN KEY(tool_call_id)
    REFERENCES zeus.tool_calls(id) ON DELETE SET NULL,
  CONSTRAINT approval_risk_check CHECK(risk_level BETWEEN 0 AND 4),
  CONSTRAINT approval_status_check CHECK(status IN ('pending','approved','denied','cancelled')),
  CONSTRAINT approval_summary_bound CHECK(octet_length(safe_summary) <= 4096)
);
CREATE INDEX approval_run_status_idx ON zeus.approval_requests(run_id,status,created_at);

ALTER TABLE zeus.run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.run_events FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.tool_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.verification_results FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.usage_records FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.approval_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY run_events_select ON zeus.run_events FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY run_events_insert ON zeus.run_events FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY tool_calls_select ON zeus.tool_calls FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY tool_calls_insert ON zeus.tool_calls FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));
CREATE POLICY tool_calls_update ON zeus.tool_calls FOR UPDATE TO zeus_app
  USING(zeus.can_write_workspace(workspace_id))
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY verification_results_select ON zeus.verification_results FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY verification_results_insert ON zeus.verification_results FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY usage_records_select ON zeus.usage_records FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY usage_records_insert ON zeus.usage_records FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY approval_requests_select ON zeus.approval_requests FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY approval_requests_insert ON zeus.approval_requests FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));
CREATE POLICY approval_requests_update ON zeus.approval_requests FOR UPDATE TO zeus_app
  USING(zeus.can_write_workspace(workspace_id))
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

GRANT SELECT,INSERT ON zeus.run_events TO zeus_app;
GRANT SELECT,INSERT,UPDATE ON zeus.tool_calls TO zeus_app;
GRANT SELECT,INSERT ON zeus.verification_results TO zeus_app;
GRANT SELECT,INSERT ON zeus.usage_records TO zeus_app;
GRANT SELECT,INSERT,UPDATE ON zeus.approval_requests TO zeus_app;

COMMIT;
