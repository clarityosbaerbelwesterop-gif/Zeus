BEGIN;

GRANT SELECT,INSERT,UPDATE ON zeus.companies,zeus.missions,zeus.skills,zeus.skill_versions TO zeus_app;

ALTER TABLE zeus.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.missions FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.skills FORCE ROW LEVEL SECURITY;
ALTER TABLE zeus.skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeus.skill_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_actor ON zeus.companies TO zeus_app
USING(zeus.is_workspace_member(workspace_id))
WITH CHECK(
  zeus.is_workspace_member(workspace_id)
  AND organization_id=(SELECT w.organization_id FROM zeus.workspaces w WHERE w.id=workspace_id)
);

CREATE POLICY missions_actor ON zeus.missions TO zeus_app
USING(zeus.is_workspace_member(workspace_id))
WITH CHECK(
  zeus.is_workspace_member(workspace_id)
  AND organization_id=(SELECT w.organization_id FROM zeus.workspaces w WHERE w.id=workspace_id)
  AND (company_id IS NULL OR EXISTS(
    SELECT 1 FROM zeus.companies c WHERE c.id=company_id AND c.workspace_id=missions.workspace_id
  ))
  AND (conversation_id IS NULL OR EXISTS(
    SELECT 1 FROM zeus.conversations c WHERE c.id=conversation_id AND c.workspace_id=missions.workspace_id
  ))
);

CREATE POLICY skills_read ON zeus.skills FOR SELECT TO zeus_app
USING(workspace_id IS NULL OR zeus.is_workspace_member(workspace_id));

CREATE POLICY skills_insert ON zeus.skills FOR INSERT TO zeus_app
WITH CHECK(
  workspace_id IS NOT NULL
  AND zeus.is_workspace_member(workspace_id)
  AND source_type <> 'built_in'
  AND (source_type <> 'generated' OR (trust_level IN ('untrusted','candidate') AND enabled=false))
);

CREATE POLICY skills_update ON zeus.skills FOR UPDATE TO zeus_app
USING(workspace_id IS NOT NULL AND zeus.is_workspace_member(workspace_id))
WITH CHECK(workspace_id IS NOT NULL AND zeus.is_workspace_member(workspace_id) AND source_type <> 'built_in');

CREATE POLICY skill_versions_read ON zeus.skill_versions FOR SELECT TO zeus_app
USING(EXISTS(
  SELECT 1 FROM zeus.skills s
  WHERE s.id=skill_id AND (s.workspace_id IS NULL OR zeus.is_workspace_member(s.workspace_id))
));

CREATE POLICY skill_versions_insert ON zeus.skill_versions FOR INSERT TO zeus_app
WITH CHECK(EXISTS(
  SELECT 1 FROM zeus.skills s
  WHERE s.id=skill_id
    AND s.workspace_id IS NOT NULL
    AND zeus.is_workspace_member(s.workspace_id)
    AND s.source_type <> 'built_in'
));

CREATE POLICY skill_versions_update ON zeus.skill_versions FOR UPDATE TO zeus_app
USING(EXISTS(
  SELECT 1 FROM zeus.skills s
  WHERE s.id=skill_id
    AND s.workspace_id IS NOT NULL
    AND zeus.is_workspace_member(s.workspace_id)
    AND s.source_type <> 'built_in'
))
WITH CHECK(EXISTS(
  SELECT 1 FROM zeus.skills s
  WHERE s.id=skill_id
    AND s.workspace_id IS NOT NULL
    AND zeus.is_workspace_member(s.workspace_id)
    AND s.source_type <> 'built_in'
));

COMMIT;
