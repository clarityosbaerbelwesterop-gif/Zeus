BEGIN;

-- Thin CRM Deal domain. Deal-Room = conversation_id on existing conversations.
-- Agent-Runs remain zeus.runs / plan_steps (and task_runs). No new mission types.

CREATE TABLE zeus.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES zeus.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  stage text NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','qualified','proposal','negotiation','won','lost')),
  value_cents integer CHECK(value_cents IS NULL OR value_cents >= 0),
  currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  owner_user_id text NOT NULL REFERENCES zeus.users(id),
  conversation_id uuid REFERENCES zeus.conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','won','lost','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, workspace_id)
);

ALTER TABLE zeus.deals
  ADD CONSTRAINT deals_conversation_workspace FOREIGN KEY(conversation_id, workspace_id)
    REFERENCES zeus.conversations(id, workspace_id);

CREATE INDEX deals_workspace_stage_idx ON zeus.deals(workspace_id, stage, updated_at DESC);
CREATE INDEX deals_workspace_status_idx ON zeus.deals(workspace_id, status, updated_at DESC);
CREATE UNIQUE INDEX deals_conversation_unique ON zeus.deals(conversation_id) WHERE conversation_id IS NOT NULL;

GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.deals TO zeus_app;

ALTER TABLE zeus.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.deals FORCE ROW LEVEL SECURITY;

CREATE POLICY deals_select ON zeus.deals FOR SELECT TO zeus_app
USING(zeus.is_workspace_member(workspace_id));

CREATE POLICY deals_write ON zeus.deals FOR ALL TO zeus_app
USING(zeus.can_write_workspace(workspace_id))
WITH CHECK(
  zeus.can_write_workspace(workspace_id)
  AND EXISTS(
    SELECT 1 FROM zeus.workspace_members m
    WHERE m.workspace_id=deals.workspace_id AND m.user_id=deals.owner_user_id
  )
  AND (
    conversation_id IS NULL OR EXISTS(
      SELECT 1 FROM zeus.conversations c
      WHERE c.id=conversation_id AND c.workspace_id=deals.workspace_id
    )
  )
);

COMMIT;
