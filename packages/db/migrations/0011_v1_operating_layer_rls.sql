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
  AND (plan_id IS NULL OR EXISTS(
    SELECT 1 FROM zeus.plans p WHERE p.id=plan_id AND p.workspace_id=missions.workspace_id
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
WITH CHECK(
  workspace_id IS NOT NULL
  AND zeus.is_workspace_member(workspace_id)
  AND source_type <> 'built_in'
  AND (
    source_type <> 'generated'
    OR enabled=false
    OR (trust_level IN ('reviewed','trusted') AND reviewed_by=zeus.current_user_id() AND reviewed_at IS NOT NULL)
  )
);

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

CREATE FUNCTION zeus.enforce_generated_skill_promotion() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = zeus, pg_catalog
AS $$
BEGIN
  IF NEW.source_type='generated' AND NEW.enabled=true THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.trust_level NOT IN ('reviewed','trusted') THEN
      RAISE EXCEPTION 'generated skill requires explicit review before enablement';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM zeus.skill_versions sv
      WHERE sv.skill_id=NEW.id
        AND sv.version=NEW.current_version
        AND sv.test_status='passing'
        AND sv.security_status='passing'
    ) THEN
      RAISE EXCEPTION 'generated skill current version must pass tests and security review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generated_skill_promotion_guard
BEFORE UPDATE ON zeus.skills
FOR EACH ROW EXECUTE FUNCTION zeus.enforce_generated_skill_promotion();

COMMIT;
