BEGIN;

CREATE OR REPLACE FUNCTION zeus.can_read_workspace_user(target_user_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, zeus
AS $$
  SELECT target_user_id = zeus.current_user_id()
    OR EXISTS(
      SELECT 1
      FROM zeus.workspace_members mine
      JOIN zeus.workspace_members theirs ON theirs.workspace_id = mine.workspace_id
      WHERE mine.user_id = zeus.current_user_id()
        AND theirs.user_id = target_user_id
    )
$$;

REVOKE ALL ON FUNCTION zeus.can_read_workspace_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zeus.can_read_workspace_user(text) TO zeus_app;

DROP POLICY IF EXISTS users_self ON zeus.users;
CREATE POLICY users_select ON zeus.users
  FOR SELECT TO zeus_app
  USING(zeus.can_read_workspace_user(id));
CREATE POLICY users_insert_self ON zeus.users
  FOR INSERT TO zeus_app
  WITH CHECK(id = zeus.current_user_id());
CREATE POLICY users_update_self ON zeus.users
  FOR UPDATE TO zeus_app
  USING(id = zeus.current_user_id())
  WITH CHECK(id = zeus.current_user_id());
CREATE POLICY users_delete_self ON zeus.users
  FOR DELETE TO zeus_app
  USING(id = zeus.current_user_id());

COMMIT;
