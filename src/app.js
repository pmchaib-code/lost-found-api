import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import itemRoutes from "./routes/items.js";
import { pool } from "./db.js";

export const app = express();
app.use(helmet());
app.use(express.json({ limit: "20kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) { next(error); }
});
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND", message: "Route not found." }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." });
});
