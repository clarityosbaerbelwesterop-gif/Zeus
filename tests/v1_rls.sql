\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE zeus_app;

SELECT set_config('zeus.user_id','v1-user-a',true);
INSERT INTO zeus.users(id,email,name) VALUES ('v1-user-a','v1-a@example.test','V1 A');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('41111111-1111-4111-8111-111111111111','V1 Org A','v1-user-a');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('41111111-1111-4111-8111-111111111111','v1-user-a','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,created_by) VALUES ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','41111111-1111-4111-8111-111111111111','V1 Workspace A','v1-user-a');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','v1-user-a','owner');
INSERT INTO zeus.companies(id,organization_id,workspace_id,name,mission,created_by)
VALUES ('d1000000-0000-4000-8000-000000000001','41111111-1111-4111-8111-111111111111','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Tenant A Company','Build safely','v1-user-a');
INSERT INTO zeus.plans(id,workspace_id,title,objective,created_by)
VALUES ('d2000000-0000-4000-8000-000000000002','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A plan','A outcome','v1-user-a');
INSERT INTO zeus.missions(id,organization_id,workspace_id,company_id,plan_id,title,outcome,status,idempotency_key,created_by)
VALUES ('d3000000-0000-4000-8000-000000000003','41111111-1111-4111-8111-111111111111','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','A mission','A outcome','awaiting_approval','v1-mission-a','v1-user-a');
INSERT INTO zeus.skills(id,organization_id,workspace_id,scope,slug,name,description,trust_level,status,created_by)
VALUES ('d4000000-0000-4000-8000-000000000004','41111111-1111-4111-8111-111111111111','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','workspace','tenant-a-skill','Tenant A Skill','Private reusable procedure','reviewed','active','v1-user-a');
INSERT INTO zeus.skill_versions(id,skill_id,version,instructions,owner_source,test_status,security_status,created_by)
VALUES ('d5000000-0000-4000-8000-000000000005','d4000000-0000-4000-8000-000000000004',1,'Use tenant A procedure only.','workspace','passed','passed','v1-user-a');

SELECT set_config('zeus.user_id','v1-user-b',true);
INSERT INTO zeus.users(id,email,name) VALUES ('v1-user-b','v1-b@example.test','V1 B');
INSERT INTO zeus.organizations(id,name,created_by) VALUES ('42222222-2222-4222-8222-222222222222','V1 Org B','v1-user-b');
INSERT INTO zeus.organization_members(organization_id,user_id,role) VALUES ('42222222-2222-4222-8222-222222222222','v1-user-b','owner');
INSERT INTO zeus.workspaces(id,organization_id,name,created_by) VALUES ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','42222222-2222-4222-8222-222222222222','V1 Workspace B','v1-user-b');
INSERT INTO zeus.workspace_members(workspace_id,user_id,role) VALUES ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','v1-user-b','owner');

SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.companies WHERE id='d1000000-0000-4000-8000-000000000001')=0 THEN 1 ELSE 0 END AS cross_tenant_company_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.missions WHERE id='d3000000-0000-4000-8000-000000000003')=0 THEN 1 ELSE 0 END AS cross_tenant_mission_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.skills WHERE id='d4000000-0000-4000-8000-000000000004')=0 THEN 1 ELSE 0 END AS cross_tenant_skill_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.skill_versions WHERE id='d5000000-0000-4000-8000-000000000005')=0 THEN 1 ELSE 0 END AS cross_tenant_skill_version_denied;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.skills WHERE scope='built_in')>=5 THEN 1 ELSE 0 END AS builtin_skills_visible;

DO $$
BEGIN
  BEGIN
    INSERT INTO zeus.companies(organization_id,workspace_id,name,created_by)
    VALUES ('41111111-1111-4111-8111-111111111111','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cross tenant write','v1-user-b');
    RAISE EXCEPTION 'cross-tenant company insert unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE zeus.skills SET description='tampered' WHERE scope='built_in';
    IF FOUND THEN RAISE EXCEPTION 'built-in skill update unexpectedly allowed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('zeus.user_id','v1-user-a',true);
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.companies WHERE id='d1000000-0000-4000-8000-000000000001')=1 THEN 1 ELSE 0 END AS own_company_visible;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.missions WHERE id='d3000000-0000-4000-8000-000000000003')=1 THEN 1 ELSE 0 END AS own_mission_visible;
SELECT 1 / CASE WHEN (SELECT count(*) FROM zeus.skills WHERE id='d4000000-0000-4000-8000-000000000004')=1 THEN 1 ELSE 0 END AS own_skill_visible;

ROLLBACK;
