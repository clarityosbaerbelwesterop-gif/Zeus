BEGIN;

CREATE TABLE zeus.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES zeus.users(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  mission text NOT NULL CHECK(length(mission) BETWEEN 1 AND 12000),
  description text NOT NULL DEFAULT '',
  product text NOT NULL DEFAULT '',
  target_customer text NOT NULL DEFAULT '',
  positioning text NOT NULL DEFAULT '',
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  operating_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,name)
);

CREATE TABLE zeus.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES zeus.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES zeus.companies(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES zeus.conversations(id) ON DELETE SET NULL,
  created_by text NOT NULL REFERENCES zeus.users(id),
  objective text NOT NULL CHECK(length(objective) BETWEEN 1 AND 20000),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','planning','awaiting_approval','approved','running','blocked','verifying','completed','failed','cancelled')),
  plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
  approved_by text REFERENCES zeus.users(id),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,idempotency_key)
);

CREATE TABLE zeus.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK(slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  source_type text NOT NULL CHECK(source_type IN ('built_in','workspace','imported','generated')),
  trust_level text NOT NULL DEFAULT 'untrusted' CHECK(trust_level IN ('untrusted','candidate','reviewed','trusted')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validating','active','rejected','retired')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner text,
  current_version integer NOT NULL DEFAULT 1 CHECK(current_version > 0),
  enabled boolean NOT NULL DEFAULT false,
  created_by text REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((source_type = 'built_in' AND workspace_id IS NULL) OR (source_type <> 'built_in' AND workspace_id IS NOT NULL)),
  CHECK(source_type <> 'generated' OR (trust_level IN ('untrusted','candidate') AND enabled = false))
);

CREATE TABLE zeus.skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES zeus.skills(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version > 0),
  trigger_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  instructions text NOT NULL CHECK(length(instructions) BETWEEN 1 AND 30000),
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_status text NOT NULL DEFAULT 'untested' CHECK(test_status IN ('untested','passing','failing')),
  security_status text NOT NULL DEFAULT 'pending' CHECK(security_status IN ('pending','passing','failing')),
  revision_note text NOT NULL DEFAULT '',
  created_by text REFERENCES zeus.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(skill_id,version)
);
