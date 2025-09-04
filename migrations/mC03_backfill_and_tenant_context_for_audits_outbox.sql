BEGIN;

ALTER TABLE audits ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE audits
SET tenant_id = (metadata ->> 'tenant_id')::uuid
WHERE tenant_id IS NULL AND metadata ? 'tenant_id';

ALTER TABLE audits ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_aud_tenant
  ON audits
  USING (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;

BEGIN;

ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE event_outbox
SET tenant_id = (payload ->> 'tenant_id')::uuid
WHERE tenant_id IS NULL AND payload ? 'tenant_id';

ALTER TABLE event_outbox ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_outbox_tenant
  ON event_outbox
  USING (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;