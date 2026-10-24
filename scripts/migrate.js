import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const sql = fs.readFileSync(path.join(here, "../migrations/001_initial.sql"), "utf8");
  await pool.query(sql);
  console.log("Database migration completed.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
