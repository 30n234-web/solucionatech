import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { STATUS_LABELS, STATUSES, PRIORITIES, SERVICES, SERVICE_GROUPS, CATEGORIES, DEVICES, PRICES, supportConfig, isWithinHours, urgencyFor } from "./support.js";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function initDatabase(pool) {
  await pool.query(await readFile(path.join(root, "sql/init.sql"), "utf8"));
  const client = await pool.connect();
  try { await client.query(await readFile(path.join(root, "sql/migrations/001_support.sql"), "utf8")); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export function createApp({ pool, env = process.env, now = () => new Date(), send = fetch, onError = () => {} }) {
const app = express();
const config = supportConfig(env);
const PRIVACY_VERSION = "2026-09-19";
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { directives: { "script-src": ["'self'", "https://cdn.tailwindcss.com"], "style-src": ["'self'", "'unsafe-inline'"], "connect-src": ["'self'"] } } }));
app.use(express.json({ limit: "32kb" }));
app.use("/api", (_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

function clean(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function cookieValue() { return crypto.createHmac("sha256", env.SESSION_SECRET || "missing").update(env.ADMIN_PASSWORD || "missing").digest("hex"); }
function parseCookies(request) { return Object.fromEntries((request.headers.cookie || "").split(";").map(v => v.trim().split(/=(.*)/s)).filter(v => v[0])); }
function isAdmin(request) { if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return false; const actual = Buffer.from(parseCookies(request).solucionatech_admin || ""); const expected = Buffer.from(cookieValue()); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); }
function requireAdmin(request, response, next) { if (!isAdmin(request)) return response.status(401).json({ error: "No autorizado" }); next(); }

app.get("/", (_request, response) => response.sendFile("index.html", { root: path.join(root, "public") }));
app.get("/admin", (_request, response) => response.sendFile("admin.html", { root: path.join(root, "public") }));
app.get(["/aviso-legal", "/terminos", "/privacidad"], (_request, response) => response.sendFile("legal.html", { root: path.join(root, "public") }));
app.get("/api/config", (_request, response) => response.json({
  services: SERVICES, serviceGroups: SERVICE_GROUPS, categories: CATEGORIES, devices: DEVICES, priorities: PRIORITIES,
  statuses: STATUS_LABELS, prices: PRICES, schedule: config, withinHours: isWithinHours(now(), config),
  serverTime: now().toISOString(), privacyVersion: PRIVACY_VERSION,
  legal: { name: env.LEGAL_NAME || "", taxId: env.LEGAL_TAX_ID || "", address: env.LEGAL_ADDRESS || "", email: env.LEGAL_EMAIL || "" },
}));
app.get("/health", async (_request, response) => { try { await pool.query("SELECT 1"); response.json({ ok: true }); } catch { response.status(503).json({ ok: false }); } });

app.post("/api/tickets", async (request, response) => {
  try {
    const name = clean(request.body.name, 80), phone = clean(request.body.phone, 30), email = clean(request.body.email, 120);
    const service = clean(request.body.service, 140), description = clean(request.body.description, 2000), priority = clean(request.body.priority, 20);
    if (clean(request.body.website, 100)) return response.status(400).json({ error: "No se pudo enviar la solicitud." });
    if (name.length < 2 || phone.replace(/\D/g, "").length < 9 || description.length < 10) return response.status(400).json({ error: "Revisa el nombre, teléfono y descripción." });
    if (!SERVICES.includes(service) || !PRIORITIES.includes(priority)) return response.status(400).json({ error: "Servicio o prioridad no válidos." });
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Email no válido." });
    const body = request.body;
    // Missing new fields remain valid for old clients.
    const category = body.category === undefined ? null : clean(body.category, 80);
    const device = body.device === undefined ? null : clean(body.device, 80);
    if ((category !== null && !CATEGORIES.includes(category)) || (device !== null && !DEVICES.includes(device))) return response.status(400).json({ error: "Selecciona una categoría y dispositivo válidos." });
    if (category !== null && !SERVICE_GROUPS[category]?.includes(service)) return response.status(400).json({ error: "El servicio no corresponde con la categoría seleccionada." });
    if (body.privacyVersion !== undefined && body.privacyVersion !== PRIVACY_VERSION) return response.status(400).json({ error: "Actualiza la página para revisar la información de privacidad." });
    const timestamp = now();
    let urgency;
    try { urgency = urgencyFor(body, timestamp, config); }
    catch (error) { return response.status(409).json({ error: error.message }); }
    const reference = `TK-${timestamp.getTime().toString(36).toUpperCase()}-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("INSERT INTO tickets(reference,name,phone,email,service,description,priority,category,device,outside_hours,urgency_requested,urgency_fee_cents,urgency_accepted_at,privacy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
        [reference, name, phone, email || null, service, description, priority, category, device, urgency.outsideHours, urgency.requested, urgency.feeCents, urgency.requested ? timestamp : null, body.privacyVersion || null]);
      await client.query("INSERT INTO ticket_events(ticket_id,status,kind) VALUES($1,'Nuevo','created')", [result.rows[0].id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const publicBase = env.PUBLIC_URL || `${request.protocol}://${request.get("host")}`;
      const message = `<b>🎫 Nuevo ticket ${escapeHtml(reference)}</b>\n<a href="${escapeHtml(publicBase)}/admin?ticket=${encodeURIComponent(reference)}">Ver detalles en el panel privado</a>`;
      const notification = await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML", disable_web_page_preview: true }), signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (!notification?.ok) console.error("telegram_delivery_failed");
    }
    response.status(201).json({ ok: true, reference, urgencyRequested: urgency.requested, urgencyFeeCents: urgency.feeCents });
  } catch (error) { console.error("ticket_creation_failed"); response.status(500).json({ error: "No se pudo crear el ticket." }); }
});

app.get("/api/tickets/status/:reference", async (request, response) => {
  const reference = clean(request.params.reference, 80).toUpperCase();
  if (!/^TK-[A-Z0-9]+-[A-F0-9]{4,24}$/.test(reference)) return response.status(400).json({ error: "Referencia no válida." });
  const result = await pool.query("SELECT reference, service, priority, status, created_at, updated_at, urgency_requested, urgency_fee_cents FROM tickets WHERE reference=$1", [reference]);
  if (!result.rowCount) return response.status(404).json({ error: "No se encontró ningún ticket con esa referencia." });
  const history = await pool.query("SELECT e.status,e.created_at,e.kind FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id WHERE t.reference=$1 ORDER BY e.created_at,e.id", [reference]);
  response.json({ ticket: { ...result.rows[0], statusLabel: STATUS_LABELS[result.rows[0].status] }, history: history.rows.map(event => ({ ...event, label: STATUS_LABELS[event.status] })) });
});

app.post("/api/admin/login", (request, response) => {
  const supplied = Buffer.from(String(request.body.password || ""));
  const expected = Buffer.from(env.ADMIN_PASSWORD || "");
  if (!env.SESSION_SECRET || !expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return response.status(401).json({ error: "Clave incorrecta" });
  response.cookie("solucionatech_admin", cookieValue(), { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict", maxAge: 12 * 60 * 60 * 1000, path: "/" }).json({ ok: true });
});
app.post("/api/admin/logout", (_request, response) => response.clearCookie("solucionatech_admin", { path: "/" }).json({ ok: true }));
app.get("/api/admin/metrics", requireAdmin, async (_request, response) => {
  const result = await pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status NOT IN ('Resuelto','Cerrado'))::int AS pending, COUNT(*) FILTER (WHERE (priority='Urgente' OR urgency_requested) AND status NOT IN ('Resuelto','Cerrado'))::int AS urgent, COUNT(*) FILTER (WHERE status='Resuelto')::int AS resolved, COUNT(*) FILTER (WHERE status='Cerrado')::int AS closed FROM tickets");
  response.json({ metrics: result.rows[0] });
});
app.get("/api/admin/tickets", requireAdmin, async (request, response) => {
  const status = clean(request.query.status, 30) || "active", priority = clean(request.query.priority, 20) || "all";
  const urgency = clean(request.query.urgency, 20) || "all";
  if (!["active", "resolved", "all", ...STATUSES].includes(status) || !["all", ...PRIORITIES].includes(priority) || !["all", "yes", "no"].includes(urgency)) return response.status(400).json({ error: "Filtro no válido." });
  const reference = clean(request.query.reference, 80).toUpperCase();
  const values = [], where = [];
  if (status === "active") where.push("status NOT IN ('Resuelto','Cerrado')"); else if (status === "resolved") where.push("status = 'Resuelto'"); else if (STATUSES.includes(status)) { values.push(status); where.push(`status = $${values.length}`); }
  if (PRIORITIES.includes(priority)) { values.push(priority); where.push(`priority = $${values.length}`); }
  if (urgency !== "all") { values.push(urgency === "yes"); where.push(`urgency_requested = $${values.length}`); }
  if (reference) { values.push(`%${reference}%`); where.push(`reference ILIKE $${values.length}`); }
  const result = await pool.query(`SELECT * FROM tickets ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE priority WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 ELSE 3 END, created_at DESC LIMIT 251`, values);
  response.json({ tickets: result.rows.slice(0, 250), truncated: result.rows.length > 250 });
});
app.patch("/api/admin/tickets/:id", requireAdmin, async (request, response) => {
  const status = clean(request.body.status, 30), id = Number(request.params.id);
  if (!STATUSES.includes(status) || (!Number.isSafeInteger(id) || id < 1)) return response.status(400).json({ error: "Datos no válidos" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM tickets WHERE id=$1 FOR UPDATE", [id]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Ticket no encontrado" }); }
    let ticket = current.rows[0];
    if (ticket.status !== status) {
      const result = await client.query("UPDATE tickets SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *", [status, id]);
      await client.query("INSERT INTO ticket_events(ticket_id,status) VALUES($1,$2)", [id, status]);
      ticket = result.rows[0];
    }
    await client.query("COMMIT");
    response.json({ ticket });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

app.get("/api/admin/tickets/:id/notes", requireAdmin, async (request, response) => {
  const id = Number(request.params.id);
  if ((!Number.isSafeInteger(id) || id < 1)) return response.status(400).json({ error: "Ticket no válido" });
  const result = await pool.query("SELECT id, note, created_at FROM ticket_notes WHERE ticket_id=$1 ORDER BY created_at DESC", [id]);
  response.json({ notes: result.rows });
});

app.post("/api/admin/tickets/:id/notes", requireAdmin, async (request, response) => {
  const id = Number(request.params.id), note = clean(request.body.note, 1500);
  if ((!Number.isSafeInteger(id) || id < 1) || note.length < 2) return response.status(400).json({ error: "Escribe una nota válida." });
  const result = await pool.query("INSERT INTO ticket_notes(ticket_id,note) SELECT id,$2 FROM tickets WHERE id=$1 RETURNING id,note,created_at", [id, note]);
  if (!result.rowCount) return response.status(404).json({ error: "Ticket no encontrado" });
  response.status(201).json({ note: result.rows[0] });
});

app.use((error, _request, response, _next) => {
  onError(error);
  const status = [400, 404, 413].includes(error.status) ? error.status : 500;
  response.status(status).json({ error: status === 500 ? "No se pudo completar la operación. Inténtalo de nuevo." : "Solicitud no válida." });
});
return app;
}
