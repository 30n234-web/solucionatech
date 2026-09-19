-- Additive, transactional migration. Existing rows and original state codes are retained.
BEGIN;
SELECT pg_advisory_xact_lock(726491, 1);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category VARCHAR(80);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device VARCHAR(80);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS outside_hours BOOLEAN;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS urgency_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS urgency_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS urgency_accepted_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(30);
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('Nuevo','Contactado','En curso','Esperando respuesta','Resuelto','Cerrado'));
CREATE TABLE IF NOT EXISTS ticket_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind VARCHAR(20) NOT NULL DEFAULT 'change'
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_created ON ticket_events(ticket_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_tickets_urgency_created ON tickets(urgency_requested, created_at DESC);
-- Only the last known state can be reconstructed for legacy tickets.
INSERT INTO ticket_events(ticket_id, status, created_at, kind)
SELECT id, status, updated_at, 'snapshot' FROM tickets t
WHERE NOT EXISTS (SELECT 1 FROM ticket_events e WHERE e.ticket_id=t.id);
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
COMMIT;
