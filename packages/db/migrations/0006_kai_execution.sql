BEGIN;

CREATE TABLE zeus.repository_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'github',
  repository_full_name text NOT NULL,
  clone_url text NOT NULL,
  default_branch text NOT NULL DEFAULT 'main',
  base_sha text NOT NULL,
  feature_branch text NOT NULL,
  connection_id uuid REFERENCES zeus.connections(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repository_bindings_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id) ON DELETE CASCADE,
  CONSTRAINT repository_bindings_provider_check CHECK(provider='github'),
  CONSTRAINT repository_bindings_name_check CHECK(repository_full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  CONSTRAINT repository_bindings_sha_check CHECK(base_sha ~ '^[0-9A-Fa-f]{40}$'),
  CONSTRAINT repository_bindings_feature_check CHECK(
    feature_branch ~ '^zeus/[A-Za-z0-9._/-]{1,180}$' AND
    feature_branch NOT LIKE '%..%' AND
    feature_branch NOT LIKE '%//%' AND
    right(feature_branch,1) <> '/'
  ),
  CONSTRAINT repository_bindings_clone_bound CHECK(octet_length(clone_url) <= 2048),
  CONSTRAINT repository_bindings_unique UNIQUE(workspace_id,repository_full_name)
);
CREATE INDEX repository_bindings_workspace_idx ON zeus.repository_bindings(workspace_id,updated_at DESC);

CREATE TABLE zeus.execution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  repository_binding_id uuid NOT NULL REFERENCES zeus.repository_bindings(id) ON DELETE CASCADE,
  sandbox_provider text NOT NULL DEFAULT 'vercel',
  sandbox_name text NOT NULL,
  sandbox_session_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  permission_mode text NOT NULL DEFAULT 'supervised',
  root_path text NOT NULL,
  base_sha text NOT NULL,
  current_head_sha text,
  expires_at timestamptz,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT execution_sessions_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id) ON DELETE CASCADE,
  CONSTRAINT execution_sessions_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT execution_sessions_provider_check CHECK(sandbox_provider='vercel'),
  CONSTRAINT execution_sessions_status_check CHECK(status IN ('creating','active','stopped','failed','expired','destroyed')),
  CONSTRAINT execution_sessions_permission_check CHECK(permission_mode IN ('read_only','supervised','autonomous')),
  CONSTRAINT execution_sessions_base_sha_check CHECK(base_sha ~ '^[0-9A-Fa-f]{40}$'),
  CONSTRAINT execution_sessions_head_sha_check CHECK(current_head_sha IS NULL OR current_head_sha ~ '^[0-9A-Fa-f]{40}$'),
  CONSTRAINT execution_sessions_run_unique UNIQUE(run_id)
);
CREATE INDEX execution_sessions_workspace_status_idx ON zeus.execution_sessions(workspace_id,status,updated_at DESC);

CREATE TABLE zeus.execution_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  execution_session_id uuid NOT NULL REFERENCES zeus.execution_sessions(id) ON DELETE CASCADE,
  label text NOT NULL,
  head_sha text NOT NULL,
  safe_diff_summary text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT execution_checkpoints_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id) ON DELETE CASCADE,
  CONSTRAINT execution_checkpoints_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT execution_checkpoints_head_sha_check CHECK(head_sha ~ '^[0-9A-Fa-f]{40}$'),
  CONSTRAINT execution_checkpoints_label_bound CHECK(octet_length(label) BETWEEN 1 AND 240),
  CONSTRAINT execution_checkpoints_summary_bound CHECK(octet_length(safe_diff_summary) <= 4096)
);
CREATE INDEX execution_checkpoints_run_created_idx ON zeus.execution_checkpoints(run_id,created_at DESC);

CREATE TABLE zeus.repository_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  repository_binding_id uuid NOT NULL REFERENCES zeus.repository_bindings(id) ON DELETE CASCADE,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  head_branch text NOT NULL,
  base_branch text NOT NULL,
  expected_head_sha text NOT NULL,
  safe_title text,
  safe_body text,
  created_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  completed_at timestamptz,
  external_number integer,
  external_url text,
  safe_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repository_change_requests_workspace_org FOREIGN KEY(workspace_id,organization_id)
    REFERENCES zeus.workspaces(id,organization_id) ON DELETE CASCADE,
  CONSTRAINT repository_change_requests_run_workspace FOREIGN KEY(run_id,workspace_id)
    REFERENCES zeus.runs(id,workspace_id) ON DELETE CASCADE,
  CONSTRAINT repository_change_requests_operation_check CHECK(operation IN ('push','pull_request')),
  CONSTRAINT repository_change_requests_status_check CHECK(status IN ('pending','approved','executing','completed','denied','failed','cancelled')),
  CONSTRAINT repository_change_requests_head_branch_check CHECK(head_branch ~ '^zeus/[A-Za-z0-9._/-]{1,180}$'),
  CONSTRAINT repository_change_requests_sha_check CHECK(expected_head_sha ~ '^[0-9A-Fa-f]{40}$'),
  CONSTRAINT repository_change_requests_title_bound CHECK(safe_title IS NULL OR octet_length(safe_title) <= 240),
  CONSTRAINT repository_change_requests_body_bound CHECK(safe_body IS NULL OR octet_length(safe_body) <= 12000),
  CONSTRAINT repository_change_requests_error_bound CHECK(safe_error IS NULL OR octet_length(safe_error) <= 4096)
);
CREATE UNIQUE INDEX repository_change_requests_pending_unique
  ON zeus.repository_change_requests(run_id,operation,expected_head_sha)
  WHERE status IN ('pending','approved','executing');
CREATE INDEX repository_change_requests_workspace_status_idx
  ON zeus.repository_change_requests(workspace_id,status,created_at DESC);

ALTER TABLE zeus.repository_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.repository_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.execution_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.execution_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.execution_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.execution_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.repository_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.repository_change_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY repository_bindings_select ON zeus.repository_bindings FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY repository_bindings_insert ON zeus.repository_bindings FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));
CREATE POLICY repository_bindings_update ON zeus.repository_bindings FOR UPDATE TO zeus_app
  USING(zeus.can_write_workspace(workspace_id))
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY execution_sessions_select ON zeus.execution_sessions FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY execution_sessions_insert ON zeus.execution_sessions FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));
CREATE POLICY execution_sessions_update ON zeus.execution_sessions FOR UPDATE TO zeus_app
  USING(zeus.can_write_workspace(workspace_id))
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY execution_checkpoints_select ON zeus.execution_checkpoints FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY execution_checkpoints_insert ON zeus.execution_checkpoints FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

CREATE POLICY repository_change_requests_select ON zeus.repository_change_requests FOR SELECT TO zeus_app
  USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY repository_change_requests_insert ON zeus.repository_change_requests FOR INSERT TO zeus_app
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));
CREATE POLICY repository_change_requests_update ON zeus.repository_change_requests FOR UPDATE TO zeus_app
  USING(zeus.can_write_workspace(workspace_id))
  WITH CHECK(zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));

GRANT SELECT,INSERT,UPDATE ON zeus.repository_bindings TO zeus_app;
GRANT SELECT,INSERT,UPDATE ON zeus.execution_sessions TO zeus_app;
GRANT SELECT,INSERT ON zeus.execution_checkpoints TO zeus_app;
GRANT SELECT,INSERT,UPDATE ON zeus.repository_change_requests TO zeus_app;

COMMIT;
