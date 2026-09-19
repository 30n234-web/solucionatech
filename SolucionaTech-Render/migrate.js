import "dotenv/config";
import pg from "pg";
import { initDatabase } from "./lib/app.js";
if (!process.env.DATABASE_URL) throw new Error("Configura DATABASE_URL para la base de destino.");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
try {
  await initDatabase(pool);
  console.log("Migración completada.");
} catch {
  console.error("No se pudo completar la migración. La transacción de ampliación se ha revertido.");
  process.exitCode = 1;
} finally { await pool.end(); }
