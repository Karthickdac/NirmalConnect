import { db, pool } from "./index";
import { developmentProjectsTable } from "./schema";

const projects = [
  {
    title: "Tirupparankundram–Madurai Connectivity Road Upgrade",
    titleTa: "திருப்பரங்குன்றம் – மதுரை இணைப்பு சாலை மேம்பாடு",
    category: "Roads",
    categoryTa: "சாலை",
    status: "Completed",
    sortOrder: 1,
  },
  {
    title: "Drinking Water Project – 10 Wards Coverage",
    titleTa: "திருப்பரங்குன்றம் குடிநீர் திட்டம் – 10 வார்டுகள்",
    category: "Water",
    categoryTa: "நீர்",
    status: "Completed",
    sortOrder: 2,
  },
  {
    title: "Govt. School Infrastructure Upgrade – 15 Schools",
    titleTa: "அரசு பள்ளிகளில் கட்டமைப்பு மேம்பாடு (15 பள்ளிகள்)",
    category: "Education",
    categoryTa: "கல்வி",
    status: "Ongoing",
    sortOrder: 3,
  },
  {
    title: "Women's Health Center Inauguration",
    titleTa: "மகளிர் சுகாதார மையம் திறப்பு",
    category: "Health",
    categoryTa: "சுகாதாரம்",
    status: "Completed",
    sortOrder: 4,
  },
  {
    title: "Housing scheme for 200 homeless families",
    titleTa: "இல்லமில்லாத குடும்பங்களுக்கு வீட்டுவசதி",
    category: "Housing",
    categoryTa: "வீட்டுவசதி",
    status: "Ongoing",
    sortOrder: 5,
  },
  {
    title: "Skill Development Center Opening",
    titleTa: "தொழில் பயிற்சி மையம் திறப்பு",
    category: "Employment",
    categoryTa: "தொழில்",
    status: "Completed",
    sortOrder: 6,
  },
];

async function main() {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ title: developmentProjectsTable.title }).from(developmentProjectsTable);
    const existingTitles = new Set(existing.map((r) => r.title));
    const missing = projects.filter((p) => !existingTitles.has(p.title));
    if (missing.length === 0) {
      console.log("[seed-development] All legacy projects already present — nothing to insert.");
      return;
    }
    await tx.insert(developmentProjectsTable).values(missing);
    console.log(`[seed-development] Inserted ${missing.length} of ${projects.length} legacy projects (${projects.length - missing.length} already existed).`);
  });
}

main()
  .catch((err) => {
    console.error("[seed-development] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
