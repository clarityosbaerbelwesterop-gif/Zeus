BEGIN;

ALTER TABLE zeus.organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE zeus.organization_members ADD CONSTRAINT organization_members_role_check CHECK(role IN ('owner','admin','member','viewer'));
ALTER TABLE zeus.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE zeus.workspace_members ADD CONSTRAINT workspace_members_role_check CHECK(role IN ('owner','admin','member','viewer'));

ALTER TABLE zeus.workspaces
  ADD COLUMN objective text NOT NULL DEFAULT '' CHECK(length(objective) <= 12000),
  ADD COLUMN success_criteria text NOT NULL DEFAULT '' CHECK(length(success_criteria) <= 12000),
  ADD COLUMN current_focus text NOT NULL DEFAULT '' CHECK(length(current_focus) <= 4000),
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
  ADD COLUMN priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  ADD COLUMN archived_at timestamptz;

ALTER TABLE zeus.conversations
  ADD COLUMN type text NOT NULL DEFAULT 'team' CHECK(type IN ('direct_agent','team','system'));
UPDATE zeus.conversations SET type=CASE WHEN agent_code IS NULL THEN 'team' ELSE 'direct_agent' END;

CREATE TABLE zeus.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES zeus.conversations(id) ON DELETE CASCADE,
  agent_code text NOT NULL REFERENCES zeus.agent_templates(code),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(conversation_id,agent_code)
);
INSERT INTO zeus.conversation_participants(conversation_id,agent_code)
SELECT id,agent_code FROM zeus.conversations WHERE agent_code IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE zeus.messages
  ADD COLUMN kind text NOT NULL DEFAULT 'message' CHECK(kind IN ('message','system_event','tool_event','artifact_reference','run_reference')),
  ADD COLUMN run_id uuid REFERENCES zeus.runs(id) ON DELETE SET NULL,
  ADD COLUMN artifact_id uuid REFERENCES zeus.artifacts(id) ON DELETE SET NULL,
  ADD COLUMN reply_to_id uuid REFERENCES zeus.messages(id) ON DELETE SET NULL,
  ADD COLUMN status text NOT NULL DEFAULT 'complete' CHECK(status IN ('pending','complete','failed'));

CREATE TABLE zeus.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  description text NOT NULL DEFAULT '' CHECK(length(description) <= 12000),
  status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','ready','in_progress','blocked','review','completed','cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  assigned_agent text REFERENCES zeus.agent_templates(code),
  created_by text NOT NULL REFERENCES zeus.users(id),
  parent_task_id uuid REFERENCES zeus.tasks(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE zeus.task_conversations (
  task_id uuid NOT NULL REFERENCES zeus.tasks(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES zeus.conversations(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id,conversation_id)
);
CREATE TABLE zeus.task_runs (
  task_id uuid NOT NULL REFERENCES zeus.tasks(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES zeus.runs(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id,run_id)
);

CREATE TABLE zeus.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  objective text NOT NULL DEFAULT '' CHECK(length(objective) <= 12000),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','completed','cancelled')),
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES zeus.plans(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 10000),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  description text NOT NULL DEFAULT '' CHECK(length(description) <= 8000),
  status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','ready','in_progress','blocked','review','completed','cancelled')),
  assigned_agent text REFERENCES zeus.agent_templates(code),
  task_id uuid REFERENCES zeus.tasks(id) ON DELETE SET NULL,
  run_id uuid REFERENCES zeus.runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id,sequence)
);

CREATE TABLE zeus.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  uploaded_by text NOT NULL REFERENCES zeus.users(id),
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK(length(content_type) BETWEEN 1 AND 200),
  size integer NOT NULL CHECK(size BETWEEN 0 AND 1048576),
  storage_key text NOT NULL CHECK(length(storage_key) BETWEEN 1 AND 300),
  checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,storage_key)
);
CREATE TABLE zeus.file_objects (
  file_id uuid PRIMARY KEY REFERENCES zeus.files(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  content_base64 text NOT NULL CHECK(octet_length(content_base64) <= 1400000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zeus.artifacts
  ADD COLUMN task_id uuid REFERENCES zeus.tasks(id) ON DELETE SET NULL,
  ADD COLUMN conversation_id uuid REFERENCES zeus.conversations(id) ON DELETE SET NULL,
  ADD COLUMN creating_agent text REFERENCES zeus.agent_templates(code),
  ADD COLUMN mime_type text CHECK(mime_type IS NULL OR length(mime_type) <= 200),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE zeus.task_artifacts (
  task_id uuid NOT NULL REFERENCES zeus.tasks(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES zeus.artifacts(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id,artifact_id)
);

CREATE TABLE zeus.memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK(type IN ('goal','decision','fact','preference','constraint','project_context')),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
  source_type text CHECK(source_type IS NULL OR length(source_type) <= 80),
  source_id text CHECK(source_id IS NULL OR length(source_id) <= 255),
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE zeus.workspace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK(actor_type IN ('user','agent','system')),
  actor_id text CHECK(actor_id IS NULL OR length(actor_id) <= 255),
  event_type text NOT NULL CHECK(event_type ~ '^[a-z0-9_.-]{3,120}$'),
  entity_type text NOT NULL CHECK(length(entity_type) BETWEEN 1 AND 80),
  entity_id text NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 255),
  safe_payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_workspace_status_idx ON zeus.tasks(workspace_id,status,updated_at DESC);
CREATE INDEX tasks_agent_idx ON zeus.tasks(workspace_id,assigned_agent,status);
CREATE INDEX plans_workspace_idx ON zeus.plans(workspace_id,status,updated_at DESC);
CREATE INDEX plan_steps_plan_idx ON zeus.plan_steps(plan_id,sequence);
CREATE INDEX files_workspace_idx ON zeus.files(workspace_id,created_at DESC);
CREATE INDEX artifacts_workspace_updated_idx ON zeus.artifacts(workspace_id,updated_at DESC);
CREATE INDEX memory_workspace_type_idx ON zeus.memory(workspace_id,type,updated_at DESC);
CREATE INDEX workspace_events_timeline_idx ON zeus.workspace_events(workspace_id,created_at DESC);
CREATE INDEX conversation_participants_agent_idx ON zeus.conversation_participants(agent_code,conversation_id);
CREATE INDEX messages_search_idx ON zeus.messages USING gin(to_tsvector('simple',content));
CREATE INDEX tasks_search_idx ON zeus.tasks USING gin(to_tsvector('simple',title || ' ' || description));
CREATE INDEX plans_search_idx ON zeus.plans USING gin(to_tsvector('simple',title || ' ' || objective));
CREATE INDEX files_search_idx ON zeus.files USING gin(to_tsvector('simple',filename));
CREATE INDEX artifacts_search_idx ON zeus.artifacts USING gin(to_tsvector('simple',title));
CREATE INDEX memory_search_idx ON zeus.memory USING gin(to_tsvector('simple',title || ' ' || content));
CREATE INDEX conversations_search_idx ON zeus.conversations USING gin(to_tsvector('simple',title));

CREATE OR REPLACE FUNCTION zeus.workspace_role(target_workspace_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT m.role FROM zeus.workspace_members m WHERE m.workspace_id=target_workspace_id AND m.user_id=zeus.current_user_id() LIMIT 1 $$;
CREATE OR REPLACE FUNCTION zeus.can_write_workspace(target_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT coalesce(zeus.workspace_role(target_workspace_id) IN ('owner','admin','member'), false) $$;
REVOKE ALL ON FUNCTION zeus.workspace_role(uuid), zeus.can_write_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zeus.workspace_role(uuid), zeus.can_write_workspace(uuid) TO zeus_app;

GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.conversation_participants,zeus.tasks,zeus.task_conversations,zeus.task_runs,zeus.plans,zeus.plan_steps,zeus.files,zeus.file_objects,zeus.task_artifacts,zeus.memory TO zeus_app;
GRANT SELECT,INSERT ON zeus.workspace_events TO zeus_app;

ALTER TABLE zeus.conversation_participants ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.conversation_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.tasks ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.task_conversations ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.task_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.task_runs ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.task_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.plans ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.plans FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.plan_steps ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.plan_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.files ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.files FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.file_objects ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.file_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.task_artifacts ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.task_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.memory ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.memory FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.workspace_events ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.workspace_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_agents_member ON zeus.workspace_agents;
CREATE POLICY workspace_agents_select ON zeus.workspace_agents FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY workspace_agents_write ON zeus.workspace_agents FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id) AND enabled_by=zeus.current_user_id());
DROP POLICY IF EXISTS conversations_member ON zeus.conversations;
CREATE POLICY conversations_select ON zeus.conversations FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY conversations_write ON zeus.conversations FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
DROP POLICY IF EXISTS messages_member ON zeus.messages;
CREATE POLICY messages_select ON zeus.messages FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=messages.conversation_id AND zeus.is_workspace_member(c.workspace_id)));
CREATE POLICY messages_write ON zeus.messages FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=messages.conversation_id AND zeus.can_write_workspace(c.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=messages.conversation_id AND zeus.can_write_workspace(c.workspace_id)));
DROP POLICY IF EXISTS runs_member ON zeus.runs;
CREATE POLICY runs_select ON zeus.runs FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY runs_write ON zeus.runs FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
DROP POLICY IF EXISTS run_steps_member ON zeus.run_steps;
CREATE POLICY run_steps_select ON zeus.run_steps FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_steps.run_id AND zeus.is_workspace_member(r.workspace_id)));
CREATE POLICY run_steps_write ON zeus.run_steps FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_steps.run_id AND zeus.can_write_workspace(r.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_steps.run_id AND zeus.can_write_workspace(r.workspace_id)));
DROP POLICY IF EXISTS artifacts_member ON zeus.artifacts;
CREATE POLICY artifacts_select ON zeus.artifacts FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY artifacts_write ON zeus.artifacts FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
DROP POLICY IF EXISTS connections_member ON zeus.connections;
CREATE POLICY connections_select ON zeus.connections FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY connections_write ON zeus.connections FOR ALL TO zeus_app USING(owner_id=zeus.current_user_id() AND zeus.can_write_workspace(workspace_id)) WITH CHECK(owner_id=zeus.current_user_id() AND zeus.can_write_workspace(workspace_id));

CREATE POLICY conversation_participants_select ON zeus.conversation_participants FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=conversation_id AND zeus.is_workspace_member(c.workspace_id)));
CREATE POLICY conversation_participants_write ON zeus.conversation_participants FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=conversation_id AND zeus.can_write_workspace(c.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=conversation_id AND zeus.can_write_workspace(c.workspace_id)));
CREATE POLICY tasks_select ON zeus.tasks FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY tasks_write ON zeus.tasks FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
CREATE POLICY task_conversations_select ON zeus.task_conversations FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.is_workspace_member(t.workspace_id)));
CREATE POLICY task_conversations_write ON zeus.task_conversations FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.can_write_workspace(t.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.can_write_workspace(t.workspace_id)));
CREATE POLICY task_runs_select ON zeus.task_runs FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.is_workspace_member(t.workspace_id)));
CREATE POLICY task_runs_write ON zeus.task_runs FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.can_write_workspace(t.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.can_write_workspace(t.workspace_id)));
CREATE POLICY plans_select ON zeus.plans FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY plans_write ON zeus.plans FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
CREATE POLICY plan_steps_select ON zeus.plan_steps FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.plans p WHERE p.id=plan_id AND zeus.is_workspace_member(p.workspace_id)));
CREATE POLICY plan_steps_write ON zeus.plan_steps FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.plans p WHERE p.id=plan_id AND zeus.can_write_workspace(p.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.plans p WHERE p.id=plan_id AND zeus.can_write_workspace(p.workspace_id)));
CREATE POLICY files_select ON zeus.files FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY files_write ON zeus.files FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(uploaded_by=zeus.current_user_id() AND zeus.can_write_workspace(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id));
CREATE POLICY file_objects_select ON zeus.file_objects FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY file_objects_write ON zeus.file_objects FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
CREATE POLICY task_artifacts_select ON zeus.task_artifacts FOR SELECT TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.is_workspace_member(t.workspace_id)));
CREATE POLICY task_artifacts_write ON zeus.task_artifacts FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.can_write_workspace(t.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND zeus.can_write_workspace(t.workspace_id)));
CREATE POLICY memory_select ON zeus.memory FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY memory_write ON zeus.memory FOR ALL TO zeus_app USING(zeus.can_write_workspace(workspace_id)) WITH CHECK(zeus.can_write_workspace(workspace_id));
CREATE POLICY workspace_events_select ON zeus.workspace_events FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY workspace_events_insert ON zeus.workspace_events FOR INSERT TO zeus_app WITH CHECK(zeus.can_write_workspace(workspace_id) AND (actor_id IS NULL OR actor_id=zeus.current_user_id()));

REVOKE ALL ON zeus.file_objects FROM PUBLIC;
COMMIT;
