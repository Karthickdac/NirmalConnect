import { Router } from "express";
import { db } from "@workspace/db";
import { constituencyStatsTable, newsTable, eventsTable, activitiesTable, galleryTable, volunteersTable } from "@workspace/db/schema";
import { GetConstituencyStatsResponse, GetSiteSummaryResponse } from "@workspace/api-zod";
import { gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/stats/constituency", async (_req, res) => {
  try {
    const [stats] = await db.select().from(constituencyStatsTable).orderBy(constituencyStatsTable.id).limit(1);
    if (!stats) {
      // Return defaults if no stats row exists
      res.json({ roadsBuiltKm: 0, waterProjectsCompleted: 0, schoolsUpgraded: 0, healthClinicsOpened: 0, jobsCreated: 0, beneficiariesServed: 0, totalProjects: 0, completedProjects: 0, ongoingProjects: 0 });
      return;
    }
    const response = GetConstituencyStatsResponse.parse(stats);
    res.json(response);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/summary", async (_req, res) => {
  try {
    const now = new Date();
    const [[{ newsCount }], [{ eventsCount }], [{ activitiesCount }], [{ galleryCount }], [{ volunteersCount }], [{ upcomingEventsCount }]] = await Promise.all([
      db.select({ newsCount: sql<number>`count(*)::int` }).from(newsTable),
      db.select({ eventsCount: sql<number>`count(*)::int` }).from(eventsTable),
      db.select({ activitiesCount: sql<number>`count(*)::int` }).from(activitiesTable),
      db.select({ galleryCount: sql<number>`count(*)::int` }).from(galleryTable),
      db.select({ volunteersCount: sql<number>`count(*)::int` }).from(volunteersTable),
      db.select({ upcomingEventsCount: sql<number>`count(*)::int` }).from(eventsTable).where(gte(eventsTable.eventDate, now)),
    ]);
    res.json({ totalNews: newsCount, totalEvents: eventsCount, totalActivities: activitiesCount, totalGalleryItems: galleryCount, totalVolunteers: volunteersCount, upcomingEventsCount });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
