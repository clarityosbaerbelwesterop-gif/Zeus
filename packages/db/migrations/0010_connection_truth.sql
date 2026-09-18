-- V1 connection truthfulness: represent configuration/verification honestly and allow the canonical AI provider.
BEGIN;

ALTER TABLE zeus.connections
  DROP CONSTRAINT IF EXISTS connections_provider_check;
ALTER TABLE zeus.connections
  ADD CONSTRAINT connections_provider_check
  CHECK (provider IN ('github','google_workspace','linkedin','neon','vercel','custom','unorouter'));

ALTER TABLE zeus.connections
  DROP CONSTRAINT IF EXISTS connections_status_check;
ALTER TABLE zeus.connections
  ADD CONSTRAINT connections_status_check
  CHECK (status IN (
    'not_connected',
    'connecting',
    'verifying',
    'connected',
    'needs_authorization',
    'action_required',
    'expired',
    'reauthorizing',
    'error',
    'revoked',
    'disabled'
  ));

COMMIT;
