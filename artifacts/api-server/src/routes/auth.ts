import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { createToken, verifyPassword, hashPassword, requireAuth, type AuthRequest } from "../lib/auth.js";

const router = Router();

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }
    const { email, password } = body.data;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (user.isActive !== "true") {
      res.status(403).json({ error: "Account inactive" });
      return;
    }
    const token = createToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    const response = LoginResponse.parse({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() } });
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const response = GetMeResponse.parse({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() });
    res.json(response);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
