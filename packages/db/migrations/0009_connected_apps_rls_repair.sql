-- Repair PRODUCT M5 database authority after 0007.
-- 0007 used zeus.actor_id, while the canonical app transaction sets zeus.user_id,
-- and it omitted grants for its newly-created tables. Keep 0007 immutable and repair forward.
BEGIN;

UPDATE zeus.connections AS c
SET organization_id = w.organization_id
FROM zeus.workspaces AS w
WHERE c.workspace_id = w.id
  AND c.organization_id IS NULL;

ALTER TABLE zeus.connections ALTER COLUMN organization_id SET NOT NULL;

DROP POLICY IF EXISTS workspace_connections_actor ON zeus.workspace_connections;
DROP POLICY IF EXISTS credential_metadata_actor ON zeus.credential_metadata;
DROP POLICY IF EXISTS oauth_states_actor ON zeus.oauth_states;
DROP POLICY IF EXISTS mcp_sessions_actor ON zeus.mcp_sessions;
DROP POLICY IF EXISTS external_operations_actor ON zeus.external_operations;

CREATE POLICY workspace_connections_select ON zeus.workspace_connections
  FOR SELECT TO zeus_app
  USING (zeus.is_workspace_member(workspace_id));
CREATE POLICY workspace_connections_write ON zeus.workspace_connections
  FOR ALL TO zeus_app
  USING (zeus.can_write_workspace(workspace_id))
  WITH CHECK (zeus.can_write_workspace(workspace_id));

CREATE POLICY credential_metadata_owner ON zeus.credential_metadata
  FOR ALL TO zeus_app
  USING (owner_id = zeus.current_user_id())
  WITH CHECK (owner_id = zeus.current_user_id());

CREATE POLICY oauth_states_owner ON zeus.oauth_states
  FOR ALL TO zeus_app
  USING (owner_id = zeus.current_user_id())
  WITH CHECK (owner_id = zeus.current_user_id());

CREATE POLICY mcp_sessions_select ON zeus.mcp_sessions
  FOR SELECT TO zeus_app
  USING (zeus.is_workspace_member(workspace_id));
CREATE POLICY mcp_sessions_write ON zeus.mcp_sessions
  FOR ALL TO zeus_app
  USING (zeus.can_write_workspace(workspace_id))
  WITH CHECK (zeus.can_write_workspace(workspace_id));

CREATE POLICY external_operations_select ON zeus.external_operations
  FOR SELECT TO zeus_app
  USING (zeus.is_workspace_member(workspace_id));
CREATE POLICY external_operations_write ON zeus.external_operations
  FOR ALL TO zeus_app
  USING (zeus.can_write_workspace(workspace_id))
  WITH CHECK (zeus.can_write_workspace(workspace_id));

GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.workspace_connections TO zeus_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.credential_metadata TO zeus_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.oauth_states TO zeus_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.mcp_sessions TO zeus_app;
GRANT SELECT,INSERT,UPDATE ON zeus.external_operations TO zeus_app;

COMMIT;
