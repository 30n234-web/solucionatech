CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  reference VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(120),
  service VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'Alta', 'Urgente')),
  status VARCHAR(30) NOT NULL DEFAULT 'Nuevo' CHECK (status IN ('Nuevo', 'Contactado', 'En curso', 'Esperando respuesta', 'Resuelto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_priority_created ON tickets(priority, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_notes (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 2 AND 1500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket_created ON ticket_notes(ticket_id, created_at DESC);

