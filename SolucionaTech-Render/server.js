import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const root = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const STATUSES = ["Nuevo", "Contactado", "En curso", "Esperando respuesta", "Resuelto"];
const PRIORITIES = ["Normal", "Alta", "Urgente"];
const SERVICES = ["Diagnóstico previo", "Configuración básica / periféricos / impresoras", "Optimización y puesta a punto de PC lento", "Desinfección de malware / virus", "Instalación de sistema operativo sin formateo", "Formateo completo e instalación limpia", "Otro / no estoy seguro"];

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { directives: { "script-src": ["'self'", "https://cdn.tailwindcss.com"], "style-src": ["'self'", "'unsafe-inline'"], "connect-src": ["'self'"] } } }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

function clean(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function whatsappPhone(phone) { const digits = phone.replace(/\D/g, ""); return digits.startsWith("34") ? digits : `34${digits}`; }
function cookieValue() { return crypto.createHmac("sha256", process.env.SESSION_SECRET || "missing").update(process.env.ADMIN_PASSWORD || "missing").digest("hex"); }
function parseCookies(request) { return Object.fromEntries((request.headers.cookie || "").split(";").map(v => v.trim().split(/=(.*)/s)).filter(v => v[0])); }
function isAdmin(request) { const actual = Buffer.from(parseCookies(request).solucionatech_admin || ""); const expected = Buffer.from(cookieValue()); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); }
function requireAdmin(request, response, next) { if (!isAdmin(request)) return response.status(401).json({ error: "No autorizado" }); next(); }

async function initDatabase() {
  const sql = await import("node:fs/promises").then(fs => fs.readFile(path.join(root, "sql/init.sql"), "utf8"));
  await pool.query(sql);
}

app.get("/", (_request, response) => response.sendFile(path.join(root, "public/index.html")));
app.get("/admin", (_request, response) => response.sendFile(path.join(root, "public/admin.html")));
app.get("/health", async (_request, response) => { try { await pool.query("SELECT 1"); response.json({ ok: true }); } catch { response.status(503).json({ ok: false }); } });

app.post("/api/tickets", async (request, response) => {
  try {
    const name = clean(request.body.name, 80), phone = clean(request.body.phone, 30), email = clean(request.body.email, 120);
    const service = clean(request.body.service, 140), description = clean(request.body.description, 2000), priority = clean(request.body.priority, 20);
    if (clean(request.body.website, 100)) return response.status(201).json({ ok: true });
    if (name.length < 2 || phone.replace(/\D/g, "").length < 9 || description.length < 10) return response.status(400).json({ error: "Revisa el nombre, teléfono y descripción." });
    if (!SERVICES.includes(service) || !PRIORITIES.includes(priority)) return response.status(400).json({ error: "Servicio o prioridad no válidos." });
    const reference = `TK-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    await pool.query("INSERT INTO tickets(reference,name,phone,email,service,description,priority) VALUES($1,$2,$3,$4,$5,$6,$7)", [reference, name, phone, email || null, service, description, priority]);
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const message = `<b>🎫 Nuevo ticket ${escapeHtml(reference)}</b>\n<b>Cliente:</b> ${escapeHtml(name)}\n<b>Servicio:</b> ${escapeHtml(service)}\n<b>Prioridad:</b> ${escapeHtml(priority)}\n<b>Problema:</b> ${escapeHtml(description)}\n\n<a href="https://wa.me/${whatsappPhone(phone)}">Abrir WhatsApp</a>`;
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML", disable_web_page_preview: true }) }).catch(error => console.error("telegram_error", error));
    }
    response.status(201).json({ ok: true, reference });
  } catch (error) { console.error(error); response.status(500).json({ error: "No se pudo crear el ticket." }); }
});

app.post("/api/admin/login", (request, response) => {
  const supplied = Buffer.from(String(request.body.password || ""));
  const expected = Buffer.from(process.env.ADMIN_PASSWORD || "");
  if (!expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return response.status(401).json({ error: "Clave incorrecta" });
  response.cookie("solucionatech_admin", cookieValue(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 12 * 60 * 60 * 1000, path: "/" }).json({ ok: true });
});
app.post("/api/admin/logout", (_request, response) => response.clearCookie("solucionatech_admin", { path: "/" }).json({ ok: true }));
app.get("/api/admin/tickets", requireAdmin, async (request, response) => {
  const status = clean(request.query.status, 30) || "active", priority = clean(request.query.priority, 20) || "all";
  const values = [], where = [];
  if (status === "active") where.push("status <> 'Resuelto'"); else if (status === "resolved") where.push("status = 'Resuelto'"); else if (STATUSES.includes(status)) { values.push(status); where.push(`status = $${values.length}`); }
  if (PRIORITIES.includes(priority)) { values.push(priority); where.push(`priority = $${values.length}`); }
  const result = await pool.query(`SELECT * FROM tickets ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE priority WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 ELSE 3 END, created_at DESC LIMIT 250`, values);
  response.json({ tickets: result.rows });
});
app.patch("/api/admin/tickets/:id", requireAdmin, async (request, response) => {
  const status = clean(request.body.status, 30), id = Number(request.params.id);
  if (!STATUSES.includes(status) || !Number.isInteger(id)) return response.status(400).json({ error: "Datos no válidos" });
  const result = await pool.query("UPDATE tickets SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *", [status, id]);
  if (!result.rowCount) return response.status(404).json({ error: "Ticket no encontrado" });
  response.json({ ticket: result.rows[0] });
});

await initDatabase();
app.listen(port, "0.0.0.0", () => console.log(`SolucionaTech listening on ${port}`));
