import { Router } from "express";
import { db } from "@workspace/db";
import { volunteersTable } from "@workspace/db/schema";
import { RegisterVolunteerBody } from "@workspace/api-zod";

const router = Router();

router.post("/volunteers", async (req, res) => {
  try {
    const body = RegisterVolunteerBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }
    const [volunteer] = await db.insert(volunteersTable).values({
      name: body.data.name,
      nameTa: body.data.nameTa ?? null,
      email: body.data.email ?? null,
      phone: body.data.phone,
      ward: body.data.ward ?? null,
      constituency: body.data.constituency,
      skills: body.data.skills ?? null,
      message: body.data.message ?? null,
      status: "pending",
    }).returning();
    res.status(201).json({
      ...volunteer,
      createdAt: volunteer.createdAt.toISOString(),
      updatedAt: volunteer.updatedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
