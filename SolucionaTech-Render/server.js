import "dotenv/config";
import { pathToFileURL } from "node:url";
import pg from "pg";
import express from "express";
import { createApp, initDatabase } from "./lib/app.js";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
const app = createApp({ pool });
let ready;
// Preview deployments must not apply migrations to a shared database implicitly.
const initialize = () => ready ||= (process.env.AUTO_MIGRATE_SUPPORT === "true" ? initDatabase(pool) : pool.query("SELECT 1"))
  .catch(error => { ready = undefined; throw error; });
// Export an Express instance so Vercel can detect the existing Node backend.
const server = express();
server.use(async (_request, response, next) => {
  try { await initialize(); next(); }
  catch { response.status(503).json({ error: "Servicio temporalmente no disponible." }); }
});
server.use(app);
export default server;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await initialize();
  server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log("SolucionaTech listo"));
}
