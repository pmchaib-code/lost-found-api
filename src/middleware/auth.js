import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "A Bearer token is required." });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: String(payload.sub), email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN", message: "The token is invalid or expired." });
  }
}
