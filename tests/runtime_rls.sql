\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE zeus_app;

SELECT set_config('zeus.user_id','runtime-user-a',true);
INSERT INTO zeus.users(id,email,name) VALUES ('runtime-user-a','runtime-a@example.test','Runtime A');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('31111111-1111-4111-8111-111111111111','Runtime Org A','runtime-user-a');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('31111111-1111-4111-8111-111111111111','runtime-user-a','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,created_by) VALUES ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','31111111-1111-4111-8111-111111111111','Runtime Workspace A','runtime-user-a');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','runtime-user-a','owner');
INSERT INTO zeus.runs(id,organization_id,workspace_id,agent_code,status,objective,created_by,run_type,trigger_type,idempotency_key)
VALUES ('c1000000-0000-4000-8000-000000000001','31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','jorge','queued','Runtime A','runtime-user-a','conversation_run','user','runtime-a-1');
INSERT INTO zeus.run_steps(id,run_id,ordinal,status,title,step_type) VALUES ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001',0,'pending','Prepare context','context');
INSERT INTO zeus.run_events(organization_id,workspace_id,run_id,event_type,safe_payload)
VALUES ('31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1000000-0000-4000-8000-000000000001','run.created','{}');
INSERT INTO zeus.tool_calls(organization_id,workspace_id,run_id,run_step_id,invocation_id,tool_id,side_effect_level,status,safe_input_summary)
VALUES ('31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','inv-a','workspace.read',0,'requested','workspace');
INSERT INTO zeus.verification_results(organization_id,workspace_id,run_id,status,check_name,safe_detail)
VALUES ('31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1000000-0000-4000-8000-000000000001','passed','run.persisted','run exists');
INSERT INTO zeus.usage_records(organization_id,workspace_id,run_id,agent_code,provider,model,input_tokens,output_tokens,latency_ms)
VALUES ('31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1000000-0000-4000-8000-000000000001','jorge','test','deterministic',10,5,1);
INSERT INTO zeus.approval_requests(organization_id,workspace_id,run_id,risk_level,safe_summary)
VALUES ('31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1000000-0000-4000-8000-000000000001',1,'test approval boundary');

SELECT set_config('zeus.user_id','runtime-user-b',true);
INSERT INTO zeus.users(id,email,name) VALUES ('runtime-user-b','runtime-b@example.test','Runtime B');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('32222222-2222-4222-8222-222222222222','Runtime Org B','runtime-user-b');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('32222222-2222-4222-8222-222222222222','runtime-user-b','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,created_by) VALUES ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','32222222-2222-4222-8222-222222222222','Runtime Workspace B','runtime-user-b');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','runtime-user-b','owner');
INSERT INTO zeus.runs(id,organization_id,workspace_id,agent_code,status,objective,created_by,run_type,trigger_type,idempotency_key)
VALUES ('c3000000-0000-4000-8000-000000000003','32222222-2222-4222-8222-222222222222','cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','kai','queued','Runtime B','runtime-user-b','task_run','user','runtime-b-1');
INSERT INTO zeus.run_events(organization_id,workspace_id,run_id,event_type,safe_payload)
VALUES ('32222222-2222-4222-8222-222222222222','cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','c3000000-0000-4000-8000-000000000003','run.created','{}');

SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.runs WHERE id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_run_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.run_steps WHERE run_id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_steps_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.run_events WHERE run_id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_events_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.tool_calls WHERE run_id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_tools_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.verification_results WHERE run_id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_verification_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.usage_records WHERE run_id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_usage_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.approval_requests WHERE run_id='c1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_approval_denied;

DO $$
BEGIN
  BEGIN
    INSERT INTO zeus.run_events(organization_id,workspace_id,run_id,event_type,safe_payload)
    VALUES ('31111111-1111-4111-8111-111111111111','caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1000000-0000-4000-8000-000000000001','run.failed','{}');
    RAISE EXCEPTION 'cross-tenant runtime insert unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('zeus.user_id','runtime-user-a',true);
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.runs WHERE id='c1000000-0000-4000-8000-000000000001')=1 THEN 1 ELSE 0 END AS own_run_visible;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.run_events WHERE run_id='c1000000-0000-4000-8000-000000000001')=1 THEN 1 ELSE 0 END AS own_event_visible;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.tool_calls WHERE run_id='c1000000-0000-4000-8000-000000000001')=1 THEN 1 ELSE 0 END AS own_tool_visible;

ROLLBACK;
