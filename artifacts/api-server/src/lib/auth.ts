import { type Request, type Response, type NextFunction } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

function resolveJwtSecret(): string {
  const fromEnv = process.env["JWT_SECRET"];
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  // Dev fallback: ephemeral random secret per process. Tokens won't survive restarts,
  // but no secret is committed or shared. Set JWT_SECRET to make sessions persistent.
  const ephemeral = randomBytes(32).toString("hex");
  console.warn("[auth] JWT_SECRET not set; using an ephemeral dev-only secret. Set JWT_SECRET for persistent sessions.");
  return ephemeral;
}
const JWT_SECRET = resolveJwtSecret();

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function parseBase64url(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function createToken(payload: Record<string, unknown>, expiresIn = 86400): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresIn }));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(parseBase64url(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("$2")) {
    try { return bcrypt.compareSync(password, stored); } catch { return false; }
  }
  return legacyVerifyPassword(password, stored);
}

function legacyHashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return `${salt}:${hash}`;
}

function legacyVerifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = createHmac("sha256", salt).update(password).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
  } catch {
    return false;
  }
}

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; name: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload as { id: number; email: string; role: string; name: string };
  next();
}

/** All recognized staff roles that may access the admin panel. */
export const STAFF_ROLES = [
  "super_admin", "admin", "minister",
  "pa_staff", "constituency_coordinator", "media_team", "grievance_officer",
  "staff",
];

/** Allow any recognized staff role. */
export function requireStaff(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const role = req.user?.role;
    if (!role || !STAFF_ROLES.includes(role)) {
      res.status(403).json({ error: "Forbidden: staff access required" });
      return;
    }
    next();
  });
}

/** Factory: allow only the listed roles (apply per-route for privilege escalation). */
export function requireRole(...roles: string[]): (req: AuthRequest, res: Response, next: NextFunction) => void {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: `Forbidden: requires one of [${roles.join(", ")}]` });
      return;
    }
    next();
  };
}
