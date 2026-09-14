\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE zeus_app;

SELECT set_config('zeus.user_id','rls-user-a',true);
INSERT INTO zeus.users(id,email,name) VALUES ('rls-user-a','a@example.test','User A');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('11111111-1111-4111-8111-111111111111','Org A','rls-user-a');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('11111111-1111-4111-8111-111111111111','rls-user-a','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,created_by) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Workspace A','rls-user-a');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-user-a','owner');

SELECT set_config('zeus.user_id','rls-user-b',true);
INSERT INTO zeus.users(id,email,name) VALUES ('rls-user-b','b@example.test','User B');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('22222222-2222-4222-8222-222222222222','Org B','rls-user-b');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('22222222-2222-4222-8222-222222222222','rls-user-b','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,created_by) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Workspace B','rls-user-b');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-user-b','owner');

SELECT set_config('zeus.user_id','rls-user-a',true);
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces) = 1 THEN 1 ELSE 0 END AS sees_only_own_workspace;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0 THEN 1 ELSE 0 END AS direct_id_is_denied;
WITH attempted AS (
  UPDATE zeus.workspaces SET name='HACKED' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' RETURNING 1
)
SELECT 1 / CASE WHEN (SELECT count(*) FROM attempted) = 0 THEN 1 ELSE 0 END AS cross_tenant_update_denied;

SELECT set_config('zeus.user_id','rls-user-b',true);
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces) = 1 THEN 1 ELSE 0 END AS inverse_isolation;
SELECT 1 / CASE WHEN (SELECT name FROM zeus.workspaces WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 'Workspace B' THEN 1 ELSE 0 END AS target_unchanged;

ROLLBACK;
