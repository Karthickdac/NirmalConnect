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
} from "./schema/index.js";
import { createHmac, randomBytes } from "crypto";

import bcrypt from "bcryptjs";
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}
function _legacyHashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return `${salt}:${hash}`;
}

async function seed() {
  console.log("Seeding database...");

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

  // Gallery
  await db.insert(galleryTable).values([
    { title: "Road Inauguration – Pallapatti Ward", mediaUrl: "https://images.unsplash.com/photo-1485738422979-f5c462d49f74?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1485738422979-f5c462d49f74?w=400", mediaType: "photo", album: "development" },
    { title: "Free Medical Camp – March 2025", mediaUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400", mediaType: "photo", album: "welfare" },
    { title: "Youth Meet – Tirupparankundram", mediaUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400", mediaType: "photo", album: "events" },
    { title: "School Kit Distribution", mediaUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400", mediaType: "photo", album: "education" },
    { title: "Tree Plantation Drive", mediaUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400", mediaType: "photo", album: "environment" },
    { title: "Water Tank Inauguration", mediaUrl: "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400", mediaType: "photo", album: "development" },
    { title: "Assembly Session – Chennai", mediaUrl: "https://images.unsplash.com/photo-1551818255-e6e10975bc17?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1551818255-e6e10975bc17?w=400", mediaType: "photo", album: "assembly" },
    { title: "Women's SHG Launch", mediaUrl: "https://images.unsplash.com/photo-1573497019236-17f8177b81e8?w=800", thumbnailUrl: "https://images.unsplash.com/photo-1573497019236-17f8177b81e8?w=400", mediaType: "photo", album: "welfare" },
  ]).onConflictDoNothing();

  // Wards / Areas — Tirupparankundram constituency (Madurai District, TN-199)
  // Coordinator contact details intentionally left blank — staff can fill
  // them in via Admin → Constituency & Wards once real assignments are made.
  await db.insert(wardsTable).values([
    { name: "Tirupparankundram Town", area: "Town Panchayat", notes: "Constituency headquarters area" },
    { name: "Pasumalai", area: "South Zone" },
    { name: "Avaniyapuram", area: "South Zone" },
    { name: "Thirumohur", area: "East Zone" },
    { name: "Vandiyur", area: "East Zone" },
    { name: "Sakkudi", area: "West Zone" },
    { name: "Manalur", area: "West Zone" },
    { name: "Vellaripatti", area: "West Zone" },
    { name: "Madurai Corporation – Zone 4", area: "Madurai South" },
    { name: "Madurai Corporation – Zone 5", area: "Madurai South" },
  ]).onConflictDoNothing();

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
