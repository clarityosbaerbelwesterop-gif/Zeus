BEGIN;
CREATE SCHEMA IF NOT EXISTS zeus;

CREATE ROLE zeus_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT zeus_app TO CURRENT_USER;

CREATE OR REPLACE FUNCTION zeus.current_user_id() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT NULLIF(current_setting('zeus.user_id', true), '') $$;

CREATE TABLE zeus.users (
  id text PRIMARY KEY,
  email text NOT NULL CHECK(length(email) BETWEEN 3 AND 320),
  name text CHECK(name IS NULL OR length(name) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.organization_members (
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES zeus.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE zeus.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.workspace_members (
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES zeus.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE zeus.agent_templates (
  code text PRIMARY KEY CHECK(code IN ('jorge','kai','lora','simon','sara')),
  name text NOT NULL,
  role text NOT NULL,
  purpose text NOT NULL,
  accent text NOT NULL CHECK(accent ~ '^#[0-9a-fA-F]{6}$'),
  responsibilities jsonb NOT NULL CHECK(jsonb_typeof(responsibilities)='array'),
  system_owned boolean NOT NULL DEFAULT true
);
CREATE TABLE zeus.workspace_agents (
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  agent_code text NOT NULL REFERENCES zeus.agent_templates(code),
  enabled_by text NOT NULL REFERENCES zeus.users(id),
  enabled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,agent_code)
);
CREATE TABLE zeus.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  agent_code text REFERENCES zeus.agent_templates(code),
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES zeus.conversations(id) ON DELETE CASCADE,
  author_id text REFERENCES zeus.users(id),
  agent_code text REFERENCES zeus.agent_templates(code),
  role text NOT NULL CHECK(role IN ('user','agent','system')),
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((role='user' AND author_id IS NOT NULL AND agent_code IS NULL) OR role <> 'user')
);
CREATE TABLE zeus.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES zeus.conversations(id) ON DELETE SET NULL,
  agent_code text NOT NULL REFERENCES zeus.agent_templates(code),
  status text NOT NULL CHECK(status IN ('queued','running','waiting','completed','failed','cancelled')),
  objective text NOT NULL CHECK(length(objective) BETWEEN 1 AND 20000),
  created_by text NOT NULL REFERENCES zeus.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES zeus.runs(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 10000),
  status text NOT NULL CHECK(status IN ('queued','running','waiting','completed','failed','cancelled')),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  tool text CHECK(tool IS NULL OR length(tool) <= 160),
  safe_detail text CHECK(safe_detail IS NULL OR length(safe_detail) <= 2000),
  error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z0-9_]{1,80}$'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,ordinal)
);
CREATE TABLE zeus.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  run_id uuid REFERENCES zeus.runs(id) ON DELETE SET NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 80),
  storage_key text CHECK(storage_key IS NULL OR length(storage_key) <= 1000),
  content_type text CHECK(content_type IS NULL OR length(content_type) <= 200),
  created_by text NOT NULL REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES zeus.users(id),
  provider text NOT NULL CHECK(provider IN ('github','google_workspace','linkedin','neon','vercel','custom')),
  kind text NOT NULL CHECK(kind IN ('oauth','api_key','mcp')),
  status text NOT NULL CHECK(status IN ('connected','needs_authorization','error','revoked')),
  scopes jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(scopes)='array'),
  secret_ref text CHECK(secret_ref IS NULL OR (length(secret_ref) BETWEEN 8 AND 300 AND secret_ref !~ '[[:space:]]')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeus.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES zeus.users(id),
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
  prefix text NOT NULL CHECK(prefix ~ '^zts_[A-Za-z0-9_-]{8}$'),
  digest text NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'),
  scopes jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(scopes)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE zeus.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES zeus.workspaces(id) ON DELETE SET NULL,
  actor_id text NOT NULL REFERENCES zeus.users(id),
  action text NOT NULL CHECK(action ~ '^[a-z0-9_.-]{3,120}$'),
  target_type text NOT NULL CHECK(length(target_type) BETWEEN 1 AND 80),
  target_id text NOT NULL CHECK(length(target_id) BETWEEN 1 AND 255),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO zeus.agent_templates(code,name,role,purpose,accent,responsibilities) VALUES
('jorge','Jorge','Manager / Chief of Staff','Turns objectives into coordinated, visible work.','#c77955','["objective framing","task graphs","delegation","coordination","progress reporting","escalation"]'),
('kai','Kai','Senior Software Engineer','Builds and repairs software with verification evidence.','#547a91','["implementation","debugging","architecture","refactoring","repository work","code review"]'),
('lora','Lora','Product Designer','Shapes calm, useful interfaces and interaction systems.','#9a78a9','["product design","UI","UX","information architecture","interaction design","visual QA"]'),
('simon','Simon','QA + Security Engineer','Finds failure modes and proves that work is safe enough to ship.','#5f7f72','["testing","regression analysis","browser testing","security testing","dependency review","vulnerability remediation"]'),
('sara','Sara','Sales / GTM','Researches accounts and prepares precise commercial follow-through.','#b58a45','["prospect research","sales preparation","CRM workflows","outbound drafts","qualification","follow-ups"]');

CREATE INDEX workspaces_org_idx ON zeus.workspaces(organization_id,updated_at DESC);
CREATE INDEX conversations_workspace_idx ON zeus.conversations(workspace_id,updated_at DESC);
CREATE INDEX messages_conversation_idx ON zeus.messages(conversation_id,created_at);
CREATE INDEX runs_workspace_idx ON zeus.runs(workspace_id,created_at DESC);
CREATE INDEX run_steps_run_idx ON zeus.run_steps(run_id,ordinal);
CREATE INDEX audit_org_idx ON zeus.audit_events(organization_id,created_at DESC);

CREATE OR REPLACE FUNCTION zeus.is_org_member(target_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.organization_members m WHERE m.organization_id=target_organization_id AND m.user_id=zeus.current_user_id()) $$;
CREATE OR REPLACE FUNCTION zeus.is_org_admin(target_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.organization_members m WHERE m.organization_id=target_organization_id AND m.user_id=zeus.current_user_id() AND m.role IN ('owner','admin')) $$;
CREATE OR REPLACE FUNCTION zeus.can_manage_org(target_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.organizations o WHERE o.id=target_organization_id AND o.created_by=zeus.current_user_id()) OR zeus.is_org_admin(target_organization_id) $$;
CREATE OR REPLACE FUNCTION zeus.is_workspace_member(target_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.workspace_members m WHERE m.workspace_id=target_workspace_id AND m.user_id=zeus.current_user_id()) $$;
CREATE OR REPLACE FUNCTION zeus.is_workspace_admin(target_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.workspace_members m WHERE m.workspace_id=target_workspace_id AND m.user_id=zeus.current_user_id() AND m.role IN ('owner','admin')) $$;
CREATE OR REPLACE FUNCTION zeus.can_manage_workspace(target_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.workspaces w WHERE w.id=target_workspace_id AND w.created_by=zeus.current_user_id()) OR zeus.is_workspace_admin(target_workspace_id) $$;
CREATE OR REPLACE FUNCTION zeus.workspace_in_org(target_workspace_id uuid, target_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$ SELECT EXISTS(SELECT 1 FROM zeus.workspaces w WHERE w.id=target_workspace_id AND w.organization_id=target_organization_id) $$;

REVOKE ALL ON FUNCTION zeus.is_org_member(uuid), zeus.is_org_admin(uuid), zeus.can_manage_org(uuid), zeus.is_workspace_member(uuid), zeus.is_workspace_admin(uuid), zeus.can_manage_workspace(uuid), zeus.workspace_in_org(uuid,uuid) FROM PUBLIC;

GRANT USAGE ON SCHEMA zeus TO zeus_app;
GRANT SELECT ON zeus.agent_templates TO zeus_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.users,zeus.organizations,zeus.organization_members,zeus.workspaces,zeus.workspace_members,zeus.workspace_agents,zeus.conversations,zeus.messages,zeus.runs,zeus.run_steps,zeus.artifacts,zeus.connections,zeus.api_tokens,zeus.audit_events TO zeus_app;
GRANT EXECUTE ON FUNCTION zeus.current_user_id(), zeus.is_org_member(uuid), zeus.is_org_admin(uuid), zeus.can_manage_org(uuid), zeus.is_workspace_member(uuid), zeus.is_workspace_admin(uuid), zeus.can_manage_workspace(uuid), zeus.workspace_in_org(uuid,uuid) TO zeus_app;

ALTER TABLE zeus.users ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.users FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.organizations ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.organization_members ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.workspaces ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.workspace_members ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.workspace_agents ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.workspace_agents FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.conversations ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.messages ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.runs ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.run_steps ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.run_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.artifacts ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.connections ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.connections FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.api_tokens ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.api_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.audit_events ENABLE ROW LEVEL SECURITY; ALTER TABLE zeus.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY users_self ON zeus.users FOR ALL TO zeus_app USING(id=zeus.current_user_id()) WITH CHECK(id=zeus.current_user_id());

CREATE POLICY organizations_select ON zeus.organizations FOR SELECT TO zeus_app USING(created_by=zeus.current_user_id() OR zeus.is_org_member(id));
CREATE POLICY organizations_insert ON zeus.organizations FOR INSERT TO zeus_app WITH CHECK(created_by=zeus.current_user_id());
CREATE POLICY organizations_update ON zeus.organizations FOR UPDATE TO zeus_app USING(zeus.is_org_admin(id)) WITH CHECK(zeus.is_org_admin(id));
CREATE POLICY organizations_delete ON zeus.organizations FOR DELETE TO zeus_app USING(zeus.is_org_admin(id));

CREATE POLICY organization_members_select ON zeus.organization_members FOR SELECT TO zeus_app USING(user_id=zeus.current_user_id() OR zeus.is_org_admin(organization_id));
CREATE POLICY organization_members_insert ON zeus.organization_members FOR INSERT TO zeus_app WITH CHECK(zeus.can_manage_org(organization_id));
CREATE POLICY organization_members_update ON zeus.organization_members FOR UPDATE TO zeus_app USING(zeus.is_org_admin(organization_id)) WITH CHECK(zeus.is_org_admin(organization_id));
CREATE POLICY organization_members_delete ON zeus.organization_members FOR DELETE TO zeus_app USING(zeus.is_org_admin(organization_id));

CREATE POLICY workspaces_select ON zeus.workspaces FOR SELECT TO zeus_app USING(zeus.is_workspace_member(id));
CREATE POLICY workspaces_insert ON zeus.workspaces FOR INSERT TO zeus_app WITH CHECK(created_by=zeus.current_user_id() AND zeus.is_org_member(organization_id));
CREATE POLICY workspaces_update ON zeus.workspaces FOR UPDATE TO zeus_app USING(zeus.is_workspace_admin(id)) WITH CHECK(zeus.is_workspace_admin(id));
CREATE POLICY workspaces_delete ON zeus.workspaces FOR DELETE TO zeus_app USING(zeus.is_workspace_admin(id));

CREATE POLICY workspace_members_select ON zeus.workspace_members FOR SELECT TO zeus_app USING(zeus.is_workspace_member(workspace_id));
CREATE POLICY workspace_members_insert ON zeus.workspace_members FOR INSERT TO zeus_app WITH CHECK(zeus.can_manage_workspace(workspace_id));
CREATE POLICY workspace_members_update ON zeus.workspace_members FOR UPDATE TO zeus_app USING(zeus.is_workspace_admin(workspace_id)) WITH CHECK(zeus.is_workspace_admin(workspace_id));
CREATE POLICY workspace_members_delete ON zeus.workspace_members FOR DELETE TO zeus_app USING(zeus.is_workspace_admin(workspace_id));

CREATE POLICY workspace_agents_member ON zeus.workspace_agents FOR ALL TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id) AND enabled_by=zeus.current_user_id());
CREATE POLICY conversations_member ON zeus.conversations FOR ALL TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id));
CREATE POLICY messages_member ON zeus.messages FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=messages.conversation_id AND zeus.is_workspace_member(c.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=messages.conversation_id AND zeus.is_workspace_member(c.workspace_id)));
CREATE POLICY runs_member ON zeus.runs FOR ALL TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id));
CREATE POLICY run_steps_member ON zeus.run_steps FOR ALL TO zeus_app USING(EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_steps.run_id AND zeus.is_workspace_member(r.workspace_id))) WITH CHECK(EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_steps.run_id AND zeus.is_workspace_member(r.workspace_id)));
CREATE POLICY artifacts_member ON zeus.artifacts FOR ALL TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(zeus.is_workspace_member(workspace_id));
CREATE POLICY connections_member ON zeus.connections FOR ALL TO zeus_app USING(zeus.is_workspace_member(workspace_id)) WITH CHECK(owner_id=zeus.current_user_id() AND zeus.is_workspace_member(workspace_id));
CREATE POLICY api_tokens_owner ON zeus.api_tokens FOR ALL TO zeus_app USING(owner_id=zeus.current_user_id()) WITH CHECK(owner_id=zeus.current_user_id() AND zeus.is_org_member(organization_id) AND (workspace_id IS NULL OR (zeus.is_workspace_member(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id))));
CREATE POLICY audit_member_select ON zeus.audit_events FOR SELECT TO zeus_app USING((workspace_id IS NULL AND zeus.is_org_member(organization_id)) OR (workspace_id IS NOT NULL AND zeus.is_workspace_member(workspace_id)));
CREATE POLICY audit_actor_insert ON zeus.audit_events FOR INSERT TO zeus_app WITH CHECK(actor_id=zeus.current_user_id() AND ((workspace_id IS NULL AND zeus.is_org_member(organization_id)) OR (workspace_id IS NOT NULL AND zeus.is_workspace_member(workspace_id) AND zeus.workspace_in_org(workspace_id,organization_id))));

REVOKE ALL ON SCHEMA zeus FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA zeus FROM PUBLIC;
COMMIT;
