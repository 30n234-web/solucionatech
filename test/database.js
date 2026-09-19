import { PGlite } from "@electric-sql/pglite";
// PostgreSQL engine in memory: no credentials or production data.
export async function testDatabase() {
  const db = new PGlite();
  await db.waitReady;
  async function query(sql, params) {
    if (!params && sql.includes(";")) {
      const results = await db.exec(sql);
      const last = results.at(-1);
      return { rows: last?.rows || [], rowCount: last?.affectedRows ?? last?.rows?.length ?? 0 };
    }
    const result = await db.query(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
  }
  return { query, connect: async () => ({ query, release() {} }), end: () => db.close(), db };
}
