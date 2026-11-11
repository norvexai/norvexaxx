import jwt from "jsonwebtoken";
import { query } from "./db.js";

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite:"none" ,
  path: "/",
  maxAge: 1000 * 60 * 60 * 8
};

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, process.env.SESSION_SECRET, { expiresIn: "8h" });
  res.cookie("norvexa_session", token, cookieOptions);
}

export function clearSession(res) {
  res.clearCookie("norvexa_session", { ...cookieOptions, maxAge: undefined });
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.norvexa_session;
    if (!token) return res.status(401).json({ error: "Please sign in." });
    const payload = jwt.verify(token, process.env.SESSION_SECRET);
    const { rows } = await query(
      `SELECT id, name, email::text AS email, role FROM users WHERE id = $1`, [payload.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: "Session is no longer valid." });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Please sign in again." });
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "Not authorized." });
  next();
};
