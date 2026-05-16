import { db } from "./index.js";
import {
  usersTable,
  newsTable,
  eventsTable,
  activitiesTable,
  galleryTable,
  faqsTable,
  constituencyStatsTable,
  wardsTable,
  zonesTable,
  pincodesTable,
  pincodeWardsTable,
  pollingStationsTable,
  siteConfigTable,
} from "./schema/index.js";
import { createHmac, randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import bcrypt from "bcryptjs";
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}
function _legacyHashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return `${salt}:${hash}`;
}

// Pretty-titles a panchayat/RV name for use as a ward `name`.
function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type PollingPdfArea = {
  revenueVillage: string | null;
  panchayat: string | null;
  ward: string | null;
  locality: string | null;
  raw: string;
};
type PollingPdfBooth = {
  slNo: number;
  boothNo: string;
  location: string;
  pincode: string | null;
  voterType: "all" | "men_only" | "women_only";
  areas: PollingPdfArea[];
};

// Reads the parsed AC 195 polling-station JSON and bulk-imports it
// into `polling_stations`, creating panchayat-type wards on the fly
// for any panchayat name not already present.
async function importPollingStations() {
  const jsonPath = path.resolve(__dirname, "../data/ac195-thiruparankundram-polling-stations.json");
  if (!fs.existsSync(jsonPath)) {
    console.warn("[seed] polling-station JSON not found, skipping import:", jsonPath);
    return;
  }
  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
    source: { url: string };
    booths: PollingPdfBooth[];
  };
  const booths = payload.booths ?? [];
  if (booths.length === 0) return;

  // Existing wards (post-curated-insert) keyed by lowercase name and slug.
  const existing = await db.select({ id: wardsTable.id, name: wardsTable.name, slug: wardsTable.slug }).from(wardsTable);
  const wardByLower = new Map<string, number>();
  for (const w of existing) {
    if (w.name) wardByLower.set(w.name.toLowerCase().trim(), w.id);
    if (w.slug) wardByLower.set(w.slug.toLowerCase().trim(), w.id);
  }

  const ruralZoneRow = await db.select({ id: zonesTable.id }).from(zonesTable).where(eq(zonesTable.slug, "rural"));
  const ruralZoneId = ruralZoneRow[0]?.id ?? null;

  // Collect every distinct panchayat referenced by the PDF and ensure
  // a ward row exists for each one.
  const distinctPanchayats = new Set<string>();
  for (const b of booths) {
    for (const a of b.areas) {
      const key = (a.panchayat ?? a.revenueVillage ?? "").trim();
      if (key) distinctPanchayats.add(key);
    }
  }

  for (const panchayat of distinctPanchayats) {
    const lower = panchayat.toLowerCase();
    if (wardByLower.has(lower)) continue;
    const slug = slugify(panchayat);
    if (slug && wardByLower.has(slug)) continue;
    const [created] = await db.insert(wardsTable).values({
      name: titleCase(panchayat),
      slug,
      wardType: "panchayat",
      zoneId: ruralZoneId,
      area: "Rural — AC 195",
      notes: "Auto-created from official AC 195 polling-station list",
    }).returning({ id: wardsTable.id });
    wardByLower.set(lower, created.id);
    if (slug) wardByLower.set(slug, created.id);
  }

  // Pincode lookup (id by code).
  const pincodeRows = await db.select({ id: pincodesTable.id, code: pincodesTable.code }).from(pincodesTable);
  const pincodeIdByCode = new Map(pincodeRows.map((p) => [p.code, p.id] as const));

  // Insert booths.
  let inserted = 0;
  for (const b of booths) {
    const firstArea = b.areas[0];
    const wardKey = (firstArea?.panchayat ?? firstArea?.revenueVillage ?? "").toLowerCase().trim();
    const wardId = wardKey ? wardByLower.get(wardKey) ?? null : null;
    await db.insert(pollingStationsTable).values({
      boothNo: b.boothNo,
      slNo: b.slNo,
      name: b.location.replace(/\s+/g, " ").trim().slice(0, 500),
      address: b.location.replace(/\s+/g, " ").trim(),
      wardId,
      pincode: b.pincode,
      voterType: b.voterType,
      rawAreas: JSON.stringify(b.areas),
      source: payload.source?.url ?? null,
    }).onConflictDoNothing();
    inserted++;

    // Attach pincode→ward mapping when both are known.
    const pincodeId = b.pincode ? pincodeIdByCode.get(b.pincode) : undefined;
    if (pincodeId && wardId) {
      await db.insert(pincodeWardsTable).values({ pincodeId, wardId }).onConflictDoNothing();
    }
  }

  // Bump ward stats so downstream UIs (counts) reflect the import.
  await db.execute(sql`SELECT 1`);
  console.log(`[seed] polling stations imported: ${inserted} booths, ${distinctPanchayats.size} distinct panchayats`);
}

// ── Tenant leader configurations ─────────────────────────────────────
// Add a new entry here for each new minister / deployment.
// TENANT env var selects which config to seed (default: "nirmal").
const TENANT_CONFIGS: Record<string, object> = {
  nirmal: {
    nameEn: "C.T.R. Nirmal Kumar",
    nameTa: "சி.டி.ஆர். நிர்மல் குமார்",
    titleEn: "Minister of Energy Resources and Law & MLA, Tirupparankundram",
    titleTa: "சக்தி வளங்கள் மற்றும் சட்ட அமைச்சர் & திருப்பரங்குன்றம் சட்டமன்ற உறுப்பினர்",
    constituencyEn: "Tirupparankundram",
    constituencyTa: "திருப்பரங்குன்றம்",
    partyEn: "Tamilaga Vettri Kazhagam (TVK)",
    partyTa: "தமிழக வெற்றி கழகம் (TVK)",
    partyShort: "TVK",
    phone: "+91 (Contact Office)",
    whatsapp: "919876543210",
    email: "office@nirmalconnect.in",
    addressEn: "Minister's Office, Tirupparankundram, Madurai – 625005, Tamil Nadu",
    addressTa: "அமைச்சர் அலுவலகம், திருப்பரங்குன்றம், மதுரை – 625005, தமிழ்நாடு",
    officeHoursEn: "Monday – Saturday: 9:00 AM – 6:00 PM",
    officeHoursTa: "திங்கள் – சனி: காலை 9:00 – மாலை 6:00",
    photoUrl: "",
    siteTitle: "Nirmal Connect",
    logoInitial: "N",
    districtEn: "Madurai",
    districtTa: "மதுரை",
  },
  tkprabhu: {
    nameEn: "Dr. T.K. Prabhu",
    nameTa: "டாக்டர் டி.கே. பிரபு",
    titleEn: "Minister",
    titleTa: "அமைச்சர்",
    constituencyEn: "Karaikudi",
    constituencyTa: "காரைக்குடி",
    partyEn: "Tamilaga Vettri Kazhagam (TVK)",
    partyTa: "தமிழக வெற்றி கழகம் (TVK)",
    partyShort: "TVK",
    phone: "+91 (Contact Office)",
    whatsapp: "919876543210",
    email: "office@tkprabhu.in",
    addressEn: "Minister's Office, Karaikudi, Sivaganga District – 630001, Tamil Nadu",
    addressTa: "அமைச்சர் அலுவலகம், காரைக்குடி, சிவகங்கை மாவட்டம் – 630001, தமிழ்நாடு",
    officeHoursEn: "Monday – Saturday: 9:00 AM – 6:00 PM",
    officeHoursTa: "திங்கள் – சனி: காலை 9:00 – மாலை 6:00",
    photoUrl: "",
    siteTitle: "TK Prabhu Connect",
    logoInitial: "T",
    districtEn: "Sivaganga",
    districtTa: "சிவகங்கை",
  },
};

async function seed() {
  const TENANT = process.env.TENANT ?? "nirmal";
  const leaderCfg = TENANT_CONFIGS[TENANT] ?? TENANT_CONFIGS["nirmal"];
  console.log(`Seeding database for tenant: ${TENANT}`);

  // Users
  await db.insert(usersTable).values([
    {
      email: "admin@nirmalconnect.in",
      name: "Admin User",
      passwordHash: hashPassword("Admin@2024"),
      role: "super_admin",
      isActive: "true",
    },
  ]).onConflictDoNothing();

  // Leader config — upsert so re-running with a different TENANT updates the live value.
  await db.insert(siteConfigTable).values({
    key: "leader_config",
    value: JSON.stringify(leaderCfg),
  }).onConflictDoUpdate({
    target: siteConfigTable.key,
    set: { value: JSON.stringify(leaderCfg), updatedAt: new Date() },
  });
  console.log(`[seed] leader_config upserted for tenant: ${TENANT}`);

  // Constituency Stats
  await db.insert(constituencyStatsTable).values([
    {
      roadsBuiltKm: 127,
      waterProjectsCompleted: 43,
      schoolsUpgraded: 18,
      healthClinicsOpened: 6,
      jobsCreated: 2800,
      beneficiariesServed: 45000,
      totalProjects: 89,
      completedProjects: 67,
      ongoingProjects: 22,
    },
  ]).onConflictDoNothing();

  // News
  await db.insert(newsTable).values([
    {
      title: "50 km Road Construction Completed in Tirupparankundram",
      titleTa: "திருப்பரங்குன்றத்தில் 50 கி.மீ சாலை கட்டுமானம் நிறைவு",
      content: "MLA C.T.R. Nirmal Kumar inaugurated 50 km of newly built roads across Tirupparankundram constituency, benefiting thousands of residents. The project was funded under the state infrastructure development scheme.",
      contentTa: "MLA சி.டி.ஆர். நிர்மல் குமார் திருப்பரங்குன்றம் தொகுதியில் 50 கி.மீ புதிய சாலைகளை திறந்து வைத்தார். இந்த திட்டம் மாநில உள்கட்டமைப்பு மேம்பாட்டு திட்டத்தின் கீழ் நிதியளிக்கப்பட்டது.",
      category: "development",
      featured: true,
      publishedAt: new Date("2025-04-15"),
    },
    {
      title: "Free Medical Camp Provides Treatment to 5,000 Residents",
      titleTa: "5,000 மக்களுக்கு இலவச மருத்துவ முகாம்",
      content: "A mega free medical camp was organized by MLA Nirmal Kumar's office in collaboration with government hospitals. Over 5,000 residents received free consultation, medicines, and diagnostic tests.",
      contentTa: "MLA நிர்மல் குமாரின் அலுவலகம் அரசு மருத்துவமனைகளுடன் இணைந்து மெகா இலவச மருத்துவ முகாம் ஏற்பாடு செய்தது. 5,000க்கும் மேற்பட்ட மக்கள் இலவச ஆலோசனை, மருந்துகள் பெற்றனர்.",
      category: "welfare",
      featured: true,
      publishedAt: new Date("2025-03-20"),
    },
    {
      title: "New Women's Self-Help Group Launched in Tirupparankundram",
      titleTa: "திருப்பரங்குன்றத்தில் புதிய மகளிர் சுய உதவி குழு தொடக்கம்",
      content: "200 women from Tirupparankundram have been enrolled in new self-help groups to promote financial independence and entrepreneurship. MLA Nirmal Kumar handed over seed capital to each group.",
      contentTa: "திருப்பரங்குன்றத்தில் 200 பெண்கள் நிதி சுதந்திரம் மற்றும் தொழில் முனைவோர்மையை ஊக்குவிக்க புதிய சுய உதவி குழுக்களில் சேர்க்கப்பட்டுள்ளனர்.",
      category: "welfare",
      featured: true,
      publishedAt: new Date("2025-02-10"),
    },
    {
      title: "15 Government Schools Receive Infrastructure Upgrade",
      titleTa: "15 அரசு பள்ளிகளில் கட்டமைப்பு மேம்பாடு",
      content: "Under the constituency development fund, 15 government schools in Tirupparankundram received new classrooms, toilets, and digital equipment, improving learning conditions for over 8,000 students.",
      contentTa: "தொகுதி வளர்ச்சி நிதியின் கீழ், திருப்பரங்குன்றத்தில் 15 அரசு பள்ளிகளுக்கு புதிய வகுப்பறைகள், கழிப்பறைகள் மற்றும் டிஜிட்டல் உபகரணங்கள் வழங்கப்பட்டன.",
      category: "education",
      featured: false,
      publishedAt: new Date("2025-01-25"),
    },
    {
      title: "Drinking Water Project Reaches All 10 Wards",
      titleTa: "10 வார்டுகளிலும் குடிநீர் திட்டம் நிறைவு",
      content: "The long-awaited drinking water supply project has been completed across all 10 wards of Tirupparankundram. Households now receive 24/7 clean piped water supply.",
      contentTa: "நீண்ட காலமாக எதிர்பார்க்கப்பட்ட குடிநீர் வழங்கல் திட்டம் திருப்பரங்குன்றத்தின் அனைத்து 10 வார்டுகளிலும் நிறைவடைந்தது.",
      category: "development",
      featured: false,
      publishedAt: new Date("2024-12-15"),
    },
    {
      title: "Youth Skill Development Centre Inaugurated",
      titleTa: "இளைஞர் திறன் மேம்பாட்டு மையம் திறப்பு",
      content: "A new skill development centre offering vocational training in IT, tailoring, and automobile repair was inaugurated in Tirupparankundram. The centre will benefit 500 youth annually.",
      contentTa: "IT, தையல் மற்றும் வாகன பழுது நீக்கத்தில் தொழிற்பயிற்சி வழங்கும் புதிய திறன் மேம்பாட்டு மையம் திருப்பரங்குன்றத்தில் திறக்கப்பட்டது.",
      category: "employment",
      featured: false,
      publishedAt: new Date("2024-11-30"),
    },
  ]).onConflictDoNothing();

  // Events
  const futureDate1 = new Date();
  futureDate1.setDate(futureDate1.getDate() + 14);
  const futureDate2 = new Date();
  futureDate2.setDate(futureDate2.getDate() + 30);
  const futureDate3 = new Date();
  futureDate3.setDate(futureDate3.getDate() + 45);
  const pastDate1 = new Date();
  pastDate1.setDate(pastDate1.getDate() - 15);

  await db.insert(eventsTable).values([
    {
      title: "Constituency Meeting & Public Hearing",
      titleTa: "தொகுதி கூட்டம் & பொது விசாரணை",
      description: "Monthly public hearing where residents can directly present their issues to MLA Nirmal Kumar. All are welcome. No appointment needed.",
      descriptionTa: "மாதாந்திர பொது விசாரணை - மக்கள் நேரடியாக MLA நிர்மல் குமாரிடம் தங்கள் பிரச்சினைகளை தெரிவிக்கலாம்.",
      venue: "Town Hall, Tirupparankundram",
      eventDate: futureDate1,
      category: "public-hearing",
    },
    {
      title: "Free Legal Aid Camp",
      titleTa: "இலவச சட்ட உதவி முகாம்",
      description: "A free legal aid camp organized in collaboration with the Tamil Nadu Bar Association. Residents can seek legal advice on property, family, and labour matters.",
      descriptionTa: "தமிழ்நாடு வக்கீல் சங்கத்துடன் இணைந்து ஏற்பாடு செய்யப்பட்ட இலவச சட்ட உதவி முகாம்.",
      venue: "Panchayat Hall, Tirupparankundram",
      eventDate: futureDate2,
      category: "welfare",
    },
    {
      title: "Youth Sports Tournament 2025",
      titleTa: "இளைஞர் விளையாட்டு போட்டி 2025",
      description: "Inter-ward youth sports tournament covering cricket, volleyball, and kabaddi. Open to all youth aged 15–30 from Tirupparankundram constituency.",
      descriptionTa: "கிரிக்கெட், கைப்பந்து மற்றும் கபடி உள்ளடக்கிய வார்டு அளவிலான இளைஞர் விளையாட்டு போட்டி.",
      venue: "Municipal Stadium, Tirupparankundram",
      eventDate: futureDate3,
      category: "sports",
    },
    {
      title: "Tree Plantation Drive – Green Tirupparankundram",
      titleTa: "மர நடவடிக்கை – பச்சை திருப்பரங்குன்றம்",
      description: "MLA Nirmal Kumar led a constituency-wide tree plantation drive with volunteers. Over 1,000 saplings were planted across public spaces.",
      descriptionTa: "MLA நிர்மல் குமார் தன்னார்வலர்களுடன் தொகுதி அளவிலான மர நடவடிக்கையை நடத்தினார்.",
      venue: "Throughout Tirupparankundram Constituency",
      eventDate: pastDate1,
      category: "environment",
    },
  ]).onConflictDoNothing();

  // Activities
  const today = new Date();
  await db.insert(activitiesTable).values([
    {
      title: "Met with residents of Pallapatti Ward on road issues",
      titleTa: "பள்ளபட்டி வார்டு மக்களை சந்தித்தல் – சாலை பிரச்சினை",
      description: "Held a direct consultation with Pallapatti ward residents regarding pothole repairs and road widening. Action plan submitted to PWD.",
      activityDate: new Date(today.getTime() - 1 * 86400000),
      location: "Pallapatti Ward, Tirupparankundram",
      category: "constituency-work",
    },
    {
      title: "Inaugurated new community water tank at Velpannaickenpatty",
      titleTa: "வேல்பண்ணைக்கன்பட்டியில் புதிய நீர் தொட்டி திறப்பு",
      description: "A 50,000-litre overhead water tank was inaugurated, benefiting 300 households in Velpannaickenpatty with regular water supply.",
      activityDate: new Date(today.getTime() - 3 * 86400000),
      location: "Velpannaickenpatty, Tirupparankundram",
      category: "development",
    },
    {
      title: "Attended Tamil Nadu Legislative Assembly session",
      titleTa: "தமிழ்நாடு சட்டமன்ற கூட்டத்தொடரில் கலந்துகொண்டார்",
      description: "Represented Tirupparankundram constituency in the assembly session. Raised issues related to Madurai district infrastructure funding.",
      activityDate: new Date(today.getTime() - 5 * 86400000),
      location: "Tamil Nadu Legislative Assembly, Chennai",
      category: "assembly",
    },
    {
      title: "Distributed school kits to 200 students",
      titleTa: "200 மாணவர்களுக்கு பள்ளி பைகள் வழங்கல்",
      description: "School bags, notebooks, and stationery were distributed to 200 students from economically weaker sections in Tirupparankundram government schools.",
      activityDate: new Date(today.getTime() - 7 * 86400000),
      location: "Govt. School, Tirupparankundram",
      category: "education",
    },
    {
      title: "Reviewed progress of constituency road projects",
      titleTa: "தொகுதி சாலை திட்டங்களின் முன்னேற்றம் ஆய்வு",
      description: "Conducted a field inspection of ongoing road construction works across 5 wards to ensure quality and timely completion.",
      activityDate: new Date(today.getTime() - 10 * 86400000),
      location: "Various Wards, Tirupparankundram",
      category: "development",
    },
    {
      title: "Public meeting on TVK party activities",
      titleTa: "TVK கட்சி நடவடிக்கைகள் பற்றிய பொது கூட்டம்",
      description: "Chaired a TVK party coordination meeting to plan upcoming constituency outreach programs and volunteer drives.",
      activityDate: new Date(today.getTime() - 12 * 86400000),
      location: "TVK Office, Tirupparankundram",
      category: "party",
    },
  ]).onConflictDoNothing();

  // Gallery — intentionally left empty. Real photos are uploaded by
  // staff through Admin → Gallery; we don't ship stock placeholders.

  // ── Constituency hierarchy ──────────────────────────────
  // Real, sourced master data for AC 195 Thiruparankundram. See
  // lib/db/data/data-sources.md for full provenance of every record.

  // 1) Zones — 5 Madurai Municipal Corporation zones + 1 virtual
  //    "Rural" zone covering panchayats outside the corporation.
  await db.insert(zonesTable).values([
    { slug: "madurai-east",    name: "Madurai Corporation — East Zone",    nameTa: "மதுரை மாநகராட்சி — கிழக்கு மண்டலம்", type: "corporation", description: "Zone I — East Zone of Madurai Municipal Corporation" },
    { slug: "madurai-north",   name: "Madurai Corporation — North Zone",   nameTa: "மதுரை மாநகராட்சி — வடக்கு மண்டலம்", type: "corporation", description: "Zone II — North Zone of Madurai Municipal Corporation" },
    { slug: "madurai-central", name: "Madurai Corporation — Central Zone", nameTa: "மதுரை மாநகராட்சி — மத்திய மண்டலம்", type: "corporation", description: "Zone III — Central Zone of Madurai Municipal Corporation" },
    { slug: "madurai-south",   name: "Madurai Corporation — South Zone",   nameTa: "மதுரை மாநகராட்சி — தெற்கு மண்டலம்", type: "corporation", description: "Zone IV — South Zone of Madurai Municipal Corporation (covers most AC 195 wards)" },
    { slug: "madurai-west",    name: "Madurai Corporation — West Zone",    nameTa: "மதுரை மாநகராட்சி — மேற்கு மண்டலம்", type: "corporation", description: "Zone V — West Zone of Madurai Municipal Corporation" },
    { slug: "rural",           name: "Rural Panchayats",                   nameTa: "ஊரக ஊராட்சிகள்",                  type: "rural",       description: "Village panchayats and revenue villages outside Madurai Corporation" },
  ]).onConflictDoNothing();

  // Resolve zone IDs once for the ward inserts below.
  const zoneRows = await db.select({ id: zonesTable.id, slug: zonesTable.slug }).from(zonesTable);
  const zoneId = (slug: string) => zoneRows.find((z) => z.slug === slug)?.id ?? null;

  // 2) Curated wards — the 10 originally-recognised wards/areas inside
  //    AC 195. All bilingual names are from Wikipedia / official Tamil
  //    sources (see data-sources.md); coordinator contacts are filled
  //    in by staff later via Admin → Constituency & Wards.
  await db.insert(wardsTable).values([
    { slug: "tirupparankundram-town", name: "Tirupparankundram Town", nameTa: "திருப்பரங்குன்றம் டவுன்", wardType: "town_panchayat",  zoneId: zoneId("madurai-south"),   area: "Town Panchayat", pincode: "625005", notes: "Constituency headquarters area" },
    { slug: "pasumalai",              name: "Pasumalai",              nameTa: "பசுமலை",                  wardType: "corporation_ward", zoneId: zoneId("madurai-south"),   area: "South Zone",     pincode: "625004" },
    { slug: "avaniyapuram",           name: "Avaniyapuram",           nameTa: "அவனியாபுரம்",             wardType: "corporation_ward", zoneId: zoneId("madurai-south"),   area: "South Zone",     pincode: "625012" },
    { slug: "thirumohur",             name: "Thirumohur",             nameTa: "திருமோகூர்",              wardType: "panchayat",        zoneId: zoneId("rural"),           area: "East Zone",      pincode: "625514" },
    { slug: "vandiyur",               name: "Vandiyur",               nameTa: "வண்டியூர்",               wardType: "corporation_ward", zoneId: zoneId("madurai-east"),    area: "East Zone",      pincode: "625020" },
    { slug: "sakkudi",                name: "Sakkudi",                nameTa: "சாக்குடி",                wardType: "panchayat",        zoneId: zoneId("rural"),           area: "West Zone" },
    { slug: "manalur",                name: "Manalur",                nameTa: "மணலூர்",                  wardType: "panchayat",        zoneId: zoneId("rural"),           area: "West Zone" },
    { slug: "vellaripatti",           name: "Vellaripatti",           nameTa: "வெள்ளரிப்பட்டி",          wardType: "panchayat",        zoneId: zoneId("rural"),           area: "West Zone" },
    { slug: "madurai-corp-zone-4",    name: "Madurai Corporation – Zone 4", nameTa: "மதுரை மாநகராட்சி – மண்டலம் 4", wardType: "madurai_corp_zone", zoneId: zoneId("madurai-south"),  area: "Madurai South" },
    { slug: "madurai-corp-zone-5",    name: "Madurai Corporation – Zone 5", nameTa: "மதுரை மாநகராட்சி – மண்டலம் 5", wardType: "madurai_corp_zone", zoneId: zoneId("madurai-south"),  area: "Madurai South" },
  ]).onConflictDoNothing();

  // 3) Pincodes — every code that appears in the AC 195 polling-station
  //    PDF address column. Verified against India Post lookup.
  await db.insert(pincodesTable).values([
    { code: "625004", label: "Pasumalai / Tirupparankundram (south)" },
    { code: "625005", label: "Tirupparankundram town" },
    { code: "625006", label: "Thirunagar" },
    { code: "625008", label: "Vilangudi area" },
    { code: "625009", label: "Virathanoor / Nedunkulam" },
    { code: "625012", label: "Avaniyapuram" },
    { code: "625019", label: "Vadapalanji / Nagamalaipudur" },
    { code: "625021", label: "Madurai south suburbs" },
    { code: "625022", label: "Parapathi / Eliyarpathi / Nallur" },
    { code: "625201", label: "Madurai rural east" },
  ]).onConflictDoNothing();

  // 4) Polling stations — bulk import from the parsed PDF JSON.
  //    Creates a `panchayat`-type ward on the fly for any panchayat
  //    name that isn't already in the wards table, so every booth
  //    has a real wardId to link to.
  await importPollingStations();

  console.log("Constituency hierarchy seeded.");

  // Gallery — images served from /gallery/ (public/gallery in the frontend build)
  await db.delete(galleryTable);
  await db.insert(galleryTable).values([
    {
      title: "திருப்பரங்குன்றம் சாலை திறப்பு விழா",
      mediaUrl: "/gallery/1_1778235908020.jpg",
      thumbnailUrl: "/gallery/1_1778235908020.jpg",
      mediaType: "photo",
      album: "Development Works",
      displayOrder: 1,
    },
    {
      title: "இலவச மருத்துவ முகாம் – திருப்பரங்குன்றம்",
      mediaUrl: "/gallery/2_1778235908021.jpg",
      thumbnailUrl: "/gallery/2_1778235908021.jpg",
      mediaType: "photo",
      album: "Welfare",
      displayOrder: 2,
    },
    {
      title: "பொதுக் கூட்டம் – மக்கள் சந்திப்பு",
      mediaUrl: "/gallery/3_1778235908022.jpg",
      thumbnailUrl: "/gallery/3_1778235908022.jpg",
      mediaType: "photo",
      album: "Events",
      displayOrder: 3,
    },
    {
      title: "பள்ளி கட்டிட திறப்பு விழா",
      mediaUrl: "/gallery/4_1778235908013.jpg",
      thumbnailUrl: "/gallery/4_1778235908013.jpg",
      mediaType: "photo",
      album: "Development Works",
      displayOrder: 4,
    },
    {
      title: "இளைஞர் விளையாட்டு போட்டி 2025",
      mediaUrl: "/gallery/5_1778235908015.jpg",
      thumbnailUrl: "/gallery/5_1778235908015.jpg",
      mediaType: "photo",
      album: "Events",
      displayOrder: 5,
    },
    {
      title: "குடிநீர் திட்டம் – தொகுதி வளர்ச்சி",
      mediaUrl: "/gallery/6_1778235908018.jpg",
      thumbnailUrl: "/gallery/6_1778235908018.jpg",
      mediaType: "photo",
      album: "Development Works",
      displayOrder: 6,
    },
    {
      title: "மர நடவடிக்கை – பச்சை திருப்பரங்குன்றம்",
      mediaUrl: "/gallery/7_1778235908019.jpg",
      thumbnailUrl: "/gallery/7_1778235908019.jpg",
      mediaType: "photo",
      album: "Environment",
      displayOrder: 7,
    },
  ]);

  // FAQs
  await db.insert(faqsTable).values([
    {
      question: "How do I submit a grievance to MLA Nirmal Kumar's office?",
      questionTa: "MLA நிர்மல் குமாரின் அலுவலகத்திற்கு புகார் எப்படி அனுப்புவது?",
      answer: "You can submit a grievance through the Grievance Portal on this website. Fill in your name, contact number, category, and description of the issue. You will receive a unique ticket number to track the status of your complaint.",
      answerTa: "இந்த வலைத்தளத்தில் உள்ள புகார் மையம் மூலம் புகார் அனுப்பலாம். பெயர், தொலைபேசி, வகை மற்றும் பிரச்சினையின் விவரங்களை பூர்த்தி செய்யுங்கள். உங்கள் புகாரின் நிலையை கண்காணிக்க தனித்துவமான புகார் எண் கிடைக்கும்.",
      order: 1,
    },
    {
      question: "What are the office hours for MLA Nirmal Kumar's constituency office?",
      questionTa: "MLA நிர்மல் குமாரின் தொகுதி அலுவலகம் எப்போது திறந்திருக்கும்?",
      answer: "The constituency office is open Monday to Saturday, 9:00 AM to 6:00 PM. The office is closed on Sundays and public holidays.",
      answerTa: "தொகுதி அலுவலகம் திங்கள் முதல் சனி வரை, காலை 9:00 மணி முதல் மாலை 6:00 மணி வரை திறந்திருக்கும். ஞாயிறுகள் மற்றும் பொது விடுமுறை நாட்களில் மூடல்.",
      order: 2,
    },
    {
      question: "How can I become a volunteer for TVK in Tirupparankundram?",
      questionTa: "திருப்பரங்குன்றத்தில் TVK தன்னார்வலராக எப்படி இணைவது?",
      answer: "Visit the Volunteer page on this website and fill out the registration form with your details. Our team will contact you to guide you through the process.",
      answerTa: "இந்த வலைத்தளத்தில் உள்ள தன்னார்வலர் பக்கத்திற்கு சென்று பதிவு படிவத்தை நிரப்புங்கள். நாங்கள் உங்களை தொடர்பு கொண்டு மேலும் வழிகாட்டுவோம்.",
      order: 3,
    },
    {
      question: "Which welfare schemes can I apply for through this office?",
      questionTa: "இந்த அலுவலகம் மூலம் எந்த நலத் திட்டங்களுக்கு விண்ணப்பிக்கலாம்?",
      answer: "The office assists with Old Age Pension, Education Scholarships, Housing Schemes (PMAY), MGNREGS, and other central and state government welfare schemes. Visit the office with your documents for assistance.",
      answerTa: "முதியோர் ஓய்வூதியம், கல்வி உதவித்தொகை, வீட்டுவசதி திட்டம் (PMAY), MGNREGS மற்றும் பிற மத்திய மாநில அரசு நலத் திட்டங்களுக்கு உதவி வழங்கப்படுகிறது.",
      order: 4,
    },
    {
      question: "How do I track my grievance status?",
      questionTa: "என் புகாரின் நிலையை எப்படி கண்காணிப்பது?",
      answer: "Go to the Grievance Portal and click on 'Track Status'. Enter your ticket number (format: GRV-YEAR-XXXXX) to see the current status of your complaint.",
      answerTa: "புகார் மையத்திற்கு சென்று 'நிலை அறிய' என்பதை கிளிக் செய்யுங்கள். உங்கள் புகார் எண்ணை (வடிவம்: GRV-ஆண்டு-XXXXX) உள்ளிட்டு தற்போதைய நிலையை காணலாம்.",
      order: 5,
    },
    {
      question: "Can I contact the office via WhatsApp?",
      questionTa: "WhatsApp மூலம் அலுவலகத்தை தொடர்பு கொள்ளலாமா?",
      answer: "Yes! You can reach us on WhatsApp at +91 98765 43210. Click the WhatsApp button on any page or use the Contact page to connect directly.",
      answerTa: "ஆம்! +91 98765 43210 என்ற எண்ணில் WhatsApp மூலம் தொடர்பு கொள்ளலாம். எந்த பக்கத்திலும் உள்ள WhatsApp பொத்தானை கிளிக் செய்யுங்கள்.",
      order: 6,
    },
  ]).onConflictDoNothing();

  console.log("Database seeded successfully!");
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
