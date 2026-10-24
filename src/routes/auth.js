import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = Router();

router.post("/signup", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Provide a valid email and password of at least 8 characters." });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "EMAIL_EXISTS", message: "An account with this email already exists." });
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;
    const result = await pool.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    }
    const expiresIn = process.env.JWT_EXPIRES_IN || "1h";
    const accessToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { subject: String(user.id), expiresIn });
    return res.json({ tokenType: "Bearer", expiresIn, accessToken });
  } catch (error) { next(error); }
});

export default router;
