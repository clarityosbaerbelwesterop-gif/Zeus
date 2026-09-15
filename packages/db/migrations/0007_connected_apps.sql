-- PRODUCT M5: extend the canonical connection authority; never create connections_v2.
ALTER TABLE zeus.connections ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES zeus.organizations(id) ON DELETE CASCADE;
ALTER TABLE zeus.connections ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE zeus.connections ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE zeus.connections ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE zeus.connections ADD COLUMN IF NOT EXISTS error_code text;

CREATE TABLE IF NOT EXISTS zeus.workspace_connections (
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES zeus.connections(id) ON DELETE CASCADE,
  allowed_agents jsonb NOT NULL DEFAULT '[]'::jsonb,
  granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, connection_id)
);
CREATE TABLE IF NOT EXISTS zeus.credential_metadata (
  connection_id uuid PRIMARY KEY REFERENCES zeus.connections(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  credential_version integer NOT NULL DEFAULT 1,
  encryption_key_version integer NOT NULL,
  encrypted_envelope jsonb NOT NULL,
  expires_at timestamptz,
  refreshable boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zeus.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES zeus.connections(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  provider text NOT NULL,
  state_digest text NOT NULL UNIQUE,
  pkce_verifier_envelope jsonb NOT NULL,
  redirect_uri text NOT NULL,
  requested_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zeus.mcp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES zeus.connections(id) ON DELETE CASCADE,
  provider text NOT NULL,
  server_id text NOT NULL,
  transport text NOT NULL,
  status text NOT NULL,
  protocol_version text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS zeus.external_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES zeus.connections(id) ON DELETE CASCADE,
  run_id uuid REFERENCES zeus.runs(id) ON DELETE SET NULL,
  agent_code text REFERENCES zeus.agent_templates(code),
  provider text NOT NULL,
  server_id text,
  tool_id text NOT NULL,
  side_effect integer NOT NULL CHECK (side_effect BETWEEN 0 AND 4),
  status text NOT NULL,
  idempotency_key text NOT NULL,
  external_id text,
  safe_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(connection_id, idempotency_key)
);

ALTER TABLE zeus.workspace_connections ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.workspace_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.credential_metadata ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.credential_metadata FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.oauth_states ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.oauth_states FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.mcp_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.mcp_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.external_operations ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.external_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_connections_actor ON zeus.workspace_connections USING (EXISTS (SELECT 1 FROM zeus.workspace_members wm WHERE wm.workspace_id = workspace_connections.workspace_id AND wm.user_id = current_setting('zeus.actor_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM zeus.workspace_members wm WHERE wm.workspace_id = workspace_connections.workspace_id AND wm.user_id = current_setting('zeus.actor_id', true)));
CREATE POLICY credential_metadata_actor ON zeus.credential_metadata USING (owner_id = current_setting('zeus.actor_id', true)) WITH CHECK (owner_id = current_setting('zeus.actor_id', true));
CREATE POLICY oauth_states_actor ON zeus.oauth_states USING (owner_id = current_setting('zeus.actor_id', true)) WITH CHECK (owner_id = current_setting('zeus.actor_id', true));
CREATE POLICY mcp_sessions_actor ON zeus.mcp_sessions USING (EXISTS (SELECT 1 FROM zeus.workspace_members wm WHERE wm.workspace_id = mcp_sessions.workspace_id AND wm.user_id = current_setting('zeus.actor_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM zeus.workspace_members wm WHERE wm.workspace_id = mcp_sessions.workspace_id AND wm.user_id = current_setting('zeus.actor_id', true)));
CREATE POLICY external_operations_actor ON zeus.external_operations USING (EXISTS (SELECT 1 FROM zeus.workspace_members wm WHERE wm.workspace_id = external_operations.workspace_id AND wm.user_id = current_setting('zeus.actor_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM zeus.workspace_members wm WHERE wm.workspace_id = external_operations.workspace_id AND wm.user_id = current_setting('zeus.actor_id', true)));
