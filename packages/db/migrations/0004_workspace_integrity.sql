BEGIN;

-- Scope references to their owning workspace, including references checked by
-- foreign keys (Postgres foreign-key checks do not themselves enforce RLS).
ALTER TABLE zeus.workspaces ADD CONSTRAINT workspaces_id_org UNIQUE(id,organization_id);
ALTER TABLE zeus.conversations ADD CONSTRAINT conversations_id_workspace UNIQUE(id,workspace_id);
ALTER TABLE zeus.tasks ADD CONSTRAINT tasks_id_workspace UNIQUE(id,workspace_id);
ALTER TABLE zeus.runs ADD CONSTRAINT runs_id_workspace UNIQUE(id,workspace_id);
ALTER TABLE zeus.artifacts ADD CONSTRAINT artifacts_id_workspace UNIQUE(id,workspace_id);
ALTER TABLE zeus.files ADD CONSTRAINT files_id_workspace UNIQUE(id,workspace_id);
ALTER TABLE zeus.runs ADD CONSTRAINT runs_conversation_workspace FOREIGN KEY(conversation_id,workspace_id) REFERENCES zeus.conversations(id,workspace_id);
ALTER TABLE zeus.tasks ADD CONSTRAINT tasks_parent_workspace FOREIGN KEY(parent_task_id,workspace_id) REFERENCES zeus.tasks(id,workspace_id);
ALTER TABLE zeus.artifacts
  ADD CONSTRAINT artifacts_run_workspace FOREIGN KEY(run_id,workspace_id) REFERENCES zeus.runs(id,workspace_id),
  ADD CONSTRAINT artifacts_task_workspace FOREIGN KEY(task_id,workspace_id) REFERENCES zeus.tasks(id,workspace_id),
  ADD CONSTRAINT artifacts_conversation_workspace FOREIGN KEY(conversation_id,workspace_id) REFERENCES zeus.conversations(id,workspace_id);
ALTER TABLE zeus.file_objects ADD CONSTRAINT file_objects_file_workspace FOREIGN KEY(file_id,workspace_id) REFERENCES zeus.files(id,workspace_id);
ALTER TABLE zeus.workspace_events ADD CONSTRAINT events_workspace_org FOREIGN KEY(workspace_id,organization_id) REFERENCES zeus.workspaces(id,organization_id);

CREATE POLICY task_conversations_scope ON zeus.task_conversations AS RESTRICTIVE FOR ALL TO zeus_app
USING(EXISTS(SELECT 1 FROM zeus.tasks t JOIN zeus.conversations c ON c.workspace_id=t.workspace_id WHERE t.id=task_id AND c.id=conversation_id))
WITH CHECK(EXISTS(SELECT 1 FROM zeus.tasks t JOIN zeus.conversations c ON c.workspace_id=t.workspace_id WHERE t.id=task_id AND c.id=conversation_id));
CREATE POLICY task_runs_scope ON zeus.task_runs AS RESTRICTIVE FOR ALL TO zeus_app
USING(EXISTS(SELECT 1 FROM zeus.tasks t JOIN zeus.runs r ON r.workspace_id=t.workspace_id WHERE t.id=task_id AND r.id=run_id))
WITH CHECK(EXISTS(SELECT 1 FROM zeus.tasks t JOIN zeus.runs r ON r.workspace_id=t.workspace_id WHERE t.id=task_id AND r.id=run_id));
CREATE POLICY task_artifacts_scope ON zeus.task_artifacts AS RESTRICTIVE FOR ALL TO zeus_app
USING(EXISTS(SELECT 1 FROM zeus.tasks t JOIN zeus.artifacts a ON a.workspace_id=t.workspace_id WHERE t.id=task_id AND a.id=artifact_id))
WITH CHECK(EXISTS(SELECT 1 FROM zeus.tasks t JOIN zeus.artifacts a ON a.workspace_id=t.workspace_id WHERE t.id=task_id AND a.id=artifact_id));
CREATE POLICY plan_steps_scope ON zeus.plan_steps AS RESTRICTIVE FOR ALL TO zeus_app
USING(EXISTS(SELECT 1 FROM zeus.plans p WHERE p.id=plan_id))
WITH CHECK(EXISTS(SELECT 1 FROM zeus.plans p WHERE p.id=plan_id
 AND (task_id IS NULL OR EXISTS(SELECT 1 FROM zeus.tasks t WHERE t.id=task_id AND t.workspace_id=p.workspace_id))
 AND (run_id IS NULL OR EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_id AND r.workspace_id=p.workspace_id))));
CREATE POLICY messages_references_scope ON zeus.messages AS RESTRICTIVE FOR ALL TO zeus_app
USING(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=conversation_id))
WITH CHECK(EXISTS(SELECT 1 FROM zeus.conversations c WHERE c.id=conversation_id
 AND (run_id IS NULL OR EXISTS(SELECT 1 FROM zeus.runs r WHERE r.id=run_id AND r.workspace_id=c.workspace_id))
 AND (artifact_id IS NULL OR EXISTS(SELECT 1 FROM zeus.artifacts a WHERE a.id=artifact_id AND a.workspace_id=c.workspace_id))));

DROP POLICY workspace_agents_write ON zeus.workspace_agents;
CREATE POLICY workspace_agents_write ON zeus.workspace_agents FOR ALL TO zeus_app
USING(zeus.is_workspace_admin(workspace_id))
WITH CHECK(zeus.is_workspace_admin(workspace_id) AND enabled_by=zeus.current_user_id());

-- Serialize member edits on the workspace. Preserve at least one owner and
-- enforce the ownership boundary even for direct calls under the app role.
CREATE FUNCTION zeus.guard_workspace_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zeus AS $$
DECLARE target uuid; actor_role text;
BEGIN
  target := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  PERFORM 1 FROM zeus.workspaces WHERE id=target FOR UPDATE;
  actor_role := zeus.workspace_role(target);
  IF TG_OP='UPDATE' AND (NEW.workspace_id<>OLD.workspace_id OR NEW.user_id<>OLD.user_id) THEN
    RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE='42501';
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.role='owner' THEN
    IF actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only an owner may change ownership' USING ERRCODE='42501';
    END IF;
    IF (TG_OP='DELETE' OR NEW.role<>'owner') AND
       (SELECT count(*) FROM zeus.workspace_members WHERE workspace_id=target AND role='owner')<=1 THEN
      RAISE EXCEPTION 'A workspace must retain an owner' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP<>'DELETE' AND NEW.role='owner' AND actor_role IS DISTINCT FROM 'owner'
     AND EXISTS(SELECT 1 FROM zeus.workspace_members WHERE workspace_id=target) THEN
    RAISE EXCEPTION 'Only an owner may grant ownership' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeus.guard_workspace_member() FROM PUBLIC;
CREATE TRIGGER workspace_member_guard BEFORE INSERT OR UPDATE OR DELETE ON zeus.workspace_members
FOR EACH ROW EXECUTE FUNCTION zeus.guard_workspace_member();

CREATE UNIQUE INDEX conversations_direct_agent_unique
ON zeus.conversations(workspace_id,agent_code) WHERE type='direct_agent';

COMMIT;
