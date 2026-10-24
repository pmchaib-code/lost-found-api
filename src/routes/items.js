import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const types = new Set(["lost", "found"]);
const statuses = new Set(["open", "recovered"]);
const editable = { type: "type", title: "title", description: "description", category: "category", location: "location", eventDate: "event_date" };

function validate(body, partial = false) {
  const errors = [];
  if (!partial || body.type !== undefined) {
    if (!types.has(body.type)) errors.push("type must be 'lost' or 'found'");
  }
  for (const key of ["title", "description", "category", "location"]) {
    if (!partial || body[key] !== undefined) {
      if (typeof body[key] !== "string" || !body[key].trim()) errors.push(`${key} is required`);
    }
  }
  if (typeof body.title === "string" && body.title.trim().length > 120) errors.push("title must be at most 120 characters");
  if (typeof body.category === "string" && body.category.trim().length > 60) errors.push("category must be at most 60 characters");
  if (typeof body.location === "string" && body.location.trim().length > 160) errors.push("location must be at most 160 characters");
  if (body.eventDate !== undefined && body.eventDate !== null && body.eventDate !== "" &&
      (typeof body.eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate) || Number.isNaN(Date.parse(body.eventDate)))) {
    errors.push("eventDate must use YYYY-MM-DD format");
  }
  return errors;
}

const selectFields = `id, user_id AS "userId", type, title, description, category, location,
 event_date AS "eventDate", status, created_at AS "createdAt", updated_at AS "updatedAt"`;

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ error: "VALIDATION_ERROR", details: errors });
    const { type, title, description, category, location, eventDate } = req.body;
    const result = await pool.query(
      `INSERT INTO items (user_id,type,title,description,category,location,event_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${selectFields}`,
      [req.user.id, type, title.trim(), description.trim(), category.trim(), location.trim(), eventDate || null]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const { type, category, location, status, q } = req.query;
    if (type && !types.has(type)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "type must be lost or found." });
    if (status && !statuses.has(status)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "status must be open or recovered." });

    const where = [], values = [];
    const add = (clause, value) => { values.push(value); where.push(clause.replace("?", `$${values.length}`)); };
    if (type) add("type = ?", type);
    if (category) add("category ILIKE ?", `%${category}%`);
    if (location) add("location ILIKE ?", `%${location}%`);
    if (status) add("status = ?", status);
    if (q) {
      values.push(`%${q}%`);
      where.push(`(title ILIKE $${values.length} OR description ILIKE $${values.length} OR category ILIKE $${values.length} OR location ILIKE $${values.length})`);
    }
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT ${selectFields} FROM items ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
    );
    res.json({ items: result.rows, pagination: { limit, offset, count: result.rowCount } });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "INVALID_ID", message: "Item id must be numeric." });
    const result = await pool.query(`SELECT ${selectFields} FROM items WHERE id = $1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "ITEM_NOT_FOUND", message: "Item not found." });
    res.json({ item: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "INVALID_ID", message: "Item id must be numeric." });
    const keys = Object.keys(req.body);
    if (!keys.length || keys.some(key => !Object.hasOwn(editable, key))) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Provide editable fields only: type, title, description, category, location, eventDate." });
    }
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: "VALIDATION_ERROR", details: errors });
    const values = [], sets = [];
    for (const key of keys) {
      const value = key === "eventDate" ? (req.body[key] || null) : (typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key]);
      values.push(value);
      sets.push(`${editable[key]} = $${values.length}`);
    }
    sets.push("updated_at = NOW()");
    values.push(req.params.id, req.user.id);
    const result = await pool.query(
      `UPDATE items SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING ${selectFields}`, values
    );
    if (!result.rowCount) {
      const exists = await pool.query("SELECT 1 FROM items WHERE id = $1", [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({ error: "ITEM_NOT_FOUND", message: "Item not found." });
      return res.status(403).json({ error: "FORBIDDEN", message: "You can only update your own reports." });
    }
    res.json({ item: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch("/:id/recovered", requireAuth, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "INVALID_ID", message: "Item id must be numeric." });
    const result = await pool.query(
      `UPDATE items SET status = 'recovered', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING ${selectFields}`,
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) {
      const exists = await pool.query("SELECT 1 FROM items WHERE id = $1", [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({ error: "ITEM_NOT_FOUND", message: "Item not found." });
      return res.status(403).json({ error: "FORBIDDEN", message: "You can only mark your own reports as recovered." });
    }
    res.json({ item: result.rows[0] });
  } catch (error) { next(error); }
});

export default router;
