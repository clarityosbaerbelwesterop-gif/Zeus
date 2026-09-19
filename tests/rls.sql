\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE zeus_app;

SELECT set_config('zeus.user_id','rls-user-a',true);
INSERT INTO zeus.users(id,email,name) VALUES ('rls-user-a','a@example.test','User A');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('11111111-1111-4111-8111-111111111111','Org A','rls-user-a');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('11111111-1111-4111-8111-111111111111','rls-user-a','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,objective,created_by) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Workspace A','Objective A','rls-user-a');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-user-a','owner');
INSERT INTO zeus.tasks(id,workspace_id,title,created_by) VALUES ('a1000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Task A','rls-user-a');
INSERT INTO zeus.plans(id,workspace_id,title,created_by) VALUES ('a2000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Plan A','rls-user-a');
INSERT INTO zeus.files(id,organization_id,workspace_id,uploaded_by,filename,content_type,size,storage_key,checksum) VALUES ('a3000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-user-a','brief.txt','text/plain',5,'workspace/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/files/a3000000-0000-4000-8000-000000000003','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
INSERT INTO zeus.file_objects(file_id,workspace_id,content_base64) VALUES ('a3000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aGVsbG8=');
INSERT INTO zeus.memory(id,workspace_id,type,title,content,created_by) VALUES ('a4000000-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','decision','Decision A','Use the canonical workspace.','rls-user-a');
INSERT INTO zeus.workspace_events(id,organization_id,workspace_id,actor_type,actor_id,event_type,entity_type,entity_id) VALUES ('a5000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','user','rls-user-a','task.created','task','a1000000-0000-4000-8000-000000000001');
INSERT INTO zeus.conversations(id,workspace_id,title,created_by) VALUES ('a6000000-0000-4000-8000-000000000006','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Deal Room A','rls-user-a');
INSERT INTO zeus.deals(id,workspace_id,title,owner_user_id,conversation_id) VALUES ('a7000000-0000-4000-8000-000000000007','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Deal A','rls-user-a','a6000000-0000-4000-8000-000000000006');

SELECT set_config('zeus.user_id','rls-user-b',true);
INSERT INTO zeus.users(id,email,name) VALUES ('rls-user-b','b@example.test','User B');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('22222222-2222-4222-8222-222222222222','Org B','rls-user-b');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('22222222-2222-4222-8222-222222222222','rls-user-b','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,objective,created_by) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Workspace B','Objective B','rls-user-b');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-user-b','owner');
INSERT INTO zeus.tasks(id,workspace_id,title,created_by) VALUES ('b1000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Task B','rls-user-b');
INSERT INTO zeus.plans(id,workspace_id,title,created_by) VALUES ('b2000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Plan B','rls-user-b');
INSERT INTO zeus.files(id,organization_id,workspace_id,uploaded_by,filename,content_type,size,storage_key,checksum) VALUES ('b3000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-user-b','secret.txt','text/plain',5,'workspace/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/files/b3000000-0000-4000-8000-000000000003','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
INSERT INTO zeus.file_objects(file_id,workspace_id,content_base64) VALUES ('b3000000-0000-4000-8000-000000000003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','d29ybGQ=');
INSERT INTO zeus.memory(id,workspace_id,type,title,content,created_by) VALUES ('b4000000-0000-4000-8000-000000000004','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','constraint','Constraint B','Private B state.','rls-user-b');
INSERT INTO zeus.workspace_events(id,organization_id,workspace_id,actor_type,actor_id,event_type,entity_type,entity_id) VALUES ('b5000000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user','rls-user-b','task.created','task','b1000000-0000-4000-8000-000000000001');
INSERT INTO zeus.conversations(id,workspace_id,title,created_by) VALUES ('b6000000-0000-4000-8000-000000000006','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Deal Room B','rls-user-b');
INSERT INTO zeus.deals(id,workspace_id,title,owner_user_id,conversation_id) VALUES ('b7000000-0000-4000-8000-000000000007','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Deal B','rls-user-b','b6000000-0000-4000-8000-000000000006');

SELECT set_config('zeus.user_id','rls-viewer-a',true);
INSERT INTO zeus.users(id,email,name) VALUES ('rls-viewer-a','viewer@example.test','Viewer A');

SELECT set_config('zeus.user_id','rls-user-a',true);
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-viewer-a','viewer');

SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces) = 1 THEN 1 ELSE 0 END AS sees_only_own_workspace;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.tasks) = 1 THEN 1 ELSE 0 END AS sees_only_own_tasks;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.plans) = 1 THEN 1 ELSE 0 END AS sees_only_own_plans;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.files) = 1 THEN 1 ELSE 0 END AS sees_only_own_files;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.file_objects) = 1 THEN 1 ELSE 0 END AS sees_only_own_file_objects;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.memory) = 1 THEN 1 ELSE 0 END AS sees_only_own_memory;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspace_events) = 1 THEN 1 ELSE 0 END AS sees_only_own_activity;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.deals) = 1 THEN 1 ELSE 0 END AS sees_only_own_deals;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0 THEN 1 ELSE 0 END AS direct_workspace_id_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.tasks WHERE id='b1000000-0000-4000-8000-000000000001') = 0 THEN 1 ELSE 0 END AS direct_task_id_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.files WHERE id='b3000000-0000-4000-8000-000000000003') = 0 THEN 1 ELSE 0 END AS direct_file_id_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.memory WHERE id='b4000000-0000-4000-8000-000000000004') = 0 THEN 1 ELSE 0 END AS direct_memory_id_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.deals WHERE id='b7000000-0000-4000-8000-000000000007') = 0 THEN 1 ELSE 0 END AS direct_deal_id_denied;
WITH attempted AS (
  UPDATE zeus.workspaces SET name='HACKED' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' RETURNING 1
)
SELECT 1 / CASE WHEN (SELECT count(*) FROM attempted) = 0 THEN 1 ELSE 0 END AS cross_tenant_update_denied;

-- Cross-workspace relationships must fail even when their UUIDs are known.
DO $$
BEGIN
  BEGIN
    INSERT INTO zeus.tasks(workspace_id,title,created_by,parent_task_id)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Forbidden parent','rls-user-a','b1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'cross-tenant task parent unexpectedly allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO zeus.plan_steps(plan_id,sequence,title,task_id)
    VALUES ('a2000000-0000-4000-8000-000000000002',1,'Forbidden task','b1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'cross-tenant plan link unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO zeus.deals(workspace_id,title,owner_user_id,conversation_id)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Forbidden room','rls-user-a','b6000000-0000-4000-8000-000000000006');
    RAISE EXCEPTION 'cross-tenant deal conversation unexpectedly allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE zeus.workspace_members SET role='member'
      WHERE workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND user_id='rls-user-a';
    RAISE EXCEPTION 'last owner removal unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('zeus.user_id','rls-viewer-a',true);
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1 THEN 1 ELSE 0 END AS viewer_can_read_workspace;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.tasks WHERE workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1 THEN 1 ELSE 0 END AS viewer_can_read_tasks;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.deals WHERE workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1 THEN 1 ELSE 0 END AS viewer_can_read_deals;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.users WHERE id='rls-user-a') = 1 THEN 1 ELSE 0 END AS viewer_can_read_workspace_teammate_profile;
DO $$
BEGIN
  BEGIN
    INSERT INTO zeus.tasks(workspace_id,title,created_by)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Viewer must not write','rls-viewer-a');
    RAISE EXCEPTION 'viewer write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    INSERT INTO zeus.deals(workspace_id,title,owner_user_id)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Viewer deal','rls-viewer-a');
    RAISE EXCEPTION 'viewer deal write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

SELECT set_config('zeus.user_id','rls-user-b',true);
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.workspaces) = 1 THEN 1 ELSE 0 END AS inverse_workspace_isolation;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.tasks) = 1 THEN 1 ELSE 0 END AS inverse_task_isolation;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.deals) = 1 THEN 1 ELSE 0 END AS inverse_deal_isolation;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.users WHERE id='rls-user-a') = 0 THEN 1 ELSE 0 END AS cross_tenant_profile_denied;
SELECT 1 / CASE WHEN (SELECT name FROM zeus.workspaces WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 'Workspace B' THEN 1 ELSE 0 END AS target_unchanged;

ROLLBACK;
