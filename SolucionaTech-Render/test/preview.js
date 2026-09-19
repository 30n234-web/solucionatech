import { createApp, initDatabase } from "../lib/app.js";
import { testDatabase } from "./database.js";
const pool = await testDatabase();
await initDatabase(pool);
const app = createApp({ pool, env: { ADMIN_PASSWORD: "demo-local", SESSION_SECRET: "local-preview-only" }, now: () => new Date("2026-09-21T10:00:00Z") });
app.listen(3100, "127.0.0.1", () => console.log("Local preview ready at http://127.0.0.1:3100 — synthetic data only"));
