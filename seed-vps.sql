-- ============================================================
-- Nirmal Connect — VPS Data Seed
-- Run on VPS: psql -U ctrnirmal -d nirmalconnect -f seed-vps.sql
-- ============================================================

-- ── Clear old dummy data (safe to re-run) ──────────────────
DELETE FROM news WHERE id < 100;
DELETE FROM events WHERE id < 100;
DELETE FROM gallery WHERE id < 100;

-- ── Reset sequences ────────────────────────────────────────
SELECT setval('news_id_seq', 14, true);
SELECT setval('events_id_seq', 14, true);
SELECT setval('gallery_id_seq', 7, true);

-- ── NEWS ───────────────────────────────────────────────────
INSERT INTO news (id, title, title_ta, content, content_ta, image_url, thumbnail_url, category, featured, published_at) VALUES

(7,
 'CTR Nirmal Kumar Sworn In as Minister of Energy Resources & Law',
 'CTR நிர்மல் குமார் மின்சக்தி மற்றும் சட்டத்துறை அமைச்சராக பதவியேற்றார்',
 'C.T.R. Nirmal Kumar, MLA of Tirupparankundram, was inducted into the first TVK cabinet on May 10, 2026, under Chief Minister C. Joseph Vijay at Raj Bhavan, Chennai. He has been assigned the portfolios of Energy Resources and Law — a significant role reflecting his background as an LL.B. holder and his senior position as Deputy General Secretary (IT & Social Media) of TVK.',
 'திருப்பரங்குன்றம் சட்டமன்ற உறுப்பினர் சி.டி.ஆர். நிர்மல் குமார் 10 மே 2026 அன்று முதல்வர் சி. ஜோசப் விஜய் தலைமையில் சென்னை கவர்னர் மாளிகையில் TVK அமைச்சரவையில் மின்சக்தி மற்றும் சட்டத்துறை அமைச்சராக பதவியேற்றார்.',
 NULL, NULL, 'news', true, '2026-05-10 00:00:00+00'),

(8,
 'TVK Wins Tamil Nadu 2026 Elections — Nirmal Kumar Triumphs in Tirupparankundram',
 'TVK தமிழ்நாடு 2026 தேர்தலில் வெற்றி — திருப்பரங்குன்றத்தில் நிர்மல் குமார் வெற்றி',
 'The Tamilaga Vettri Kazhagam (TVK), led by actor-politician C. Joseph Vijay, swept the 2026 Tamil Nadu Legislative Assembly elections. C.T.R. Nirmal Kumar secured a landmark victory in the Tirupparankundram constituency of Madurai district, defeating rival candidates by a significant margin. Thousands of TVK supporters celebrated across the constituency.',
 'நடிகர்-அரசியல்வாதி சி. ஜோசப் விஜய் தலைமையிலான தமிழக வெற்றி கழகம் (TVK) 2026 தமிழ்நாடு சட்டமன்ற தேர்தலில் பெரும் வெற்றி பெற்றது. சி.டி.ஆர். நிர்மல் குமார் மதுரை மாவட்டத்தில் திருப்பரங்குன்றம் தொகுதியில் தேர்தலில் வெற்றி பெற்றார்.',
 NULL, NULL, 'press', true, '2026-05-05 00:00:00+00'),

(9,
 'Nirmal Kumar: "People''s Power Will Decide — Not Money or Experience"',
 'நிர்மல் குமார்: "பணம் அல்ல, மக்கள் சக்திதான் தீர்மானிக்கும்"',
 'In an exclusive interview with The Federal ahead of the 2026 Tamil Nadu elections, C.T.R. Nirmal Kumar stated that experience, alliances, and money power would not matter in this election — only genuine people''s connection would. He outlined TVK''s development vision for Tirupparankundram, focusing on roads, water supply, employment, and transparent governance.',
 '2026 தமிழ்நாடு தேர்தலுக்கு முன்னதாக The Federal-க்கு அளித்த சிறப்பு நேர்காணலில் சி.டி.ஆர். நிர்மல் குமார், அனுபவம், கூட்டணி, பண பலம் ஆகியவை தேர்தலில் முக்கியமில்லை என்றும், மக்களுடனான உண்மையான தொடர்பு மட்டுமே முடிவு செய்யும் என்றும் தெரிவித்தார்.',
 NULL, NULL, 'press', true, '2026-04-18 00:00:00+00'),

(10,
 'CTR Nirmal Kumar — One of Six Key Architects Behind TVK''s Rise to Power',
 'CTR நிர்மல் குமார் — TVK வெற்றிக்கு பின்னால் உள்ள ஆறு முக்கிய தலைவர்களில் ஒருவர்',
 'The Week magazine profiles C.T.R. Nirmal Kumar as one of the six-man inner circle credited with architecting TVK''s stunning electoral sweep in Tamil Nadu 2026. As Deputy General Secretary for IT and Social Media, Nirmal Kumar spearheaded TVK''s digital outreach strategy, grassroots mobilisation through social media, and data-driven campaign management across the state.',
 'The Week இதழ் சி.டி.ஆர். நிர்மல் குமாரை TVK-யின் 2026 தேர்தல் வெற்றிக்கு பின்னால் உள்ள ஆறு முக்கிய தலைவர்களில் ஒருவராக குறிப்பிடுகிறது.',
 NULL, NULL, 'news', true, '2026-05-09 00:00:00+00'),

(11,
 'Newly Elected TVK Ministers Signal Radical Shift in Governance Approach',
 'புதிதாக தேர்ந்தெடுக்கப்பட்ட TVK அமைச்சர்கள் நிர்வாக முறையில் மாற்றத்தை உணர்த்துகின்றனர்',
 'DevDiscourse reports that newly elected TVK ministers, including C.T.R. Nirmal Kumar, are signalling a radical departure from traditional governance models in Tamil Nadu. With qualifications spanning engineering, law, and criminology, Nirmal Kumar''s appointment as Energy and Law Minister is seen as a move toward professional, technology-driven administration.',
 'DevDiscourse அறிக்கையின்படி, சி.டி.ஆர். நிர்மல் குமார் உள்ளிட்ட TVK அமைச்சர்கள் தமிழ்நாட்டின் பாரம்பரிய நிர்வாக முறையிலிருந்து மாறுபட்ட புதிய அணுகுமுறையை பின்பற்றுவதாக தெரிவிக்கின்றனர்.',
 NULL, NULL, 'news', false, '2026-05-12 00:00:00+00'),

(12,
 'Tirupparankundram Set for Major Infrastructure Push Under New MLA',
 'புதிய சட்டமன்ற உறுப்பினரின் கீழ் திருப்பரங்குன்றத்தில் பெரும் உள்கட்டமைப்பு முன்முயற்சி',
 'With C.T.R. Nirmal Kumar elected as MLA and simultaneously holding the Energy Resources portfolio in the state cabinet, Tirupparankundram constituency is poised for significant infrastructure investment. Priority areas include road repairs across all 10 wards, completion of the drinking water grid, upgrades to primary health centres, and expansion of the rooftop solar scheme to all eligible households.',
 'சி.டி.ஆர். நிர்மல் குமார் சட்டமன்ற உறுப்பினராகவும் மின்சக்தி வளத்துறையிலும் பொறுப்பு வகிப்பதால் திருப்பரங்குன்றம் தொகுதியில் கணிசமான உள்கட்டமைப்பு முதலீடு எதிர்பார்க்கப்படுகிறது.',
 NULL, NULL, 'development', false, '2026-05-20 00:00:00+00'),

(13,
 'CTR Nirmal Kumar Meets Alliance Partners During Government Formation',
 'அரசு அமைப்பில் கூட்டணி கட்சிகளை சந்தித்த CTR நிர்மல் குமார்',
 'During the critical government formation period following TVK''s 2026 election victory, C.T.R. Nirmal Kumar played a pivotal role as a senior party leader in meeting alliance partners including CPM leaders to secure the required majority for CM C. Joseph Vijay''s administration.',
 '2026 தேர்தல் வெற்றிக்குப் பிறகு அரசு அமைப்பு காலத்தில் சி.டி.ஆர். நிர்மல் குமார் CPM உள்ளிட்ட கூட்டணி கட்சியினரை சந்தித்து முதல்வரின் ஆட்சிக்கு தேவையான பெரும்பான்மையை உறுதிப்படுத்தினார்.',
 NULL, NULL, 'news', false, '2026-05-08 00:00:00+00'),

(14,
 'Green Energy Push: Rooftop Solar Scheme Announced for Tirupparankundram',
 'பசுமை ஆற்றல் முன்முயற்சி: திருப்பரங்குன்றத்தில் கூரை சூரிய ஆற்றல் திட்டம் அறிவிப்பு',
 'Energy Resources Minister C.T.R. Nirmal Kumar has announced a rooftop solar panel subsidy scheme for households in Tirupparankundram as part of TVK''s first 100-day action plan. Eligible families will receive up to 40% subsidy through TANGEDCO, with on-site registration camps planned across all wards starting August 2026.',
 'மின்சக்தி வளத்துறை அமைச்சர் சி.டி.ஆர். நிர்மல் குமார் TVK அரசின் முதல் 100 நாள் திட்டத்தின் ஒரு பகுதியாக திருப்பரங்குன்றம் குடும்பங்களுக்கு கூரை சூரிய மின்கலன் மானிய திட்டத்தை அறிவித்தார்.',
 NULL, NULL, 'development', false, '2026-05-25 00:00:00+00');

-- ── EVENTS ─────────────────────────────────────────────────
INSERT INTO events (id, title, title_ta, description, description_ta, image_url, thumbnail_url, venue, event_date, end_date, category) VALUES

(5,
 'Swearing-in Ceremony – Minister of Energy Resources & Law',
 'ஆணை ஏற்பு விழா – மின்சக்தி மற்றும் சட்டத்துறை அமைச்சர்',
 'Hon. C.T.R. Nirmal Kumar was inducted into the first TVK ministry under Chief Minister C. Joseph Vijay, sworn in as Minister of Energy Resources and Law at Raj Bhavan, Chennai.',
 'கவர்னர் மாளிகை, சென்னையில் முதல்வர் சி. ஜோசப் விஜய் தலைமையிலான அரசாங்கத்தில் மின்சக்தி மற்றும் சட்டத்துறை அமைச்சராக சி.டி.ஆர். நிர்மல் குமார் பதவியேற்றனர்.',
 NULL, NULL, 'Raj Bhavan, Chennai', '2026-05-10 05:30:00+00', '2026-05-10 07:30:00+00', 'ceremony'),

(6,
 'Victory Celebration & Public Thanks-Giving – Tirupparankundram',
 'வெற்றி கொண்டாட்டம் & மக்கள் நன்றி நிகழ்வு – திருப்பரங்குன்றம்',
 'A grand victory celebration was held at Tirupparankundram to honour MLA C.T.R. Nirmal Kumar''s win in the 2026 Tamil Nadu Legislative Assembly elections. Thousands of TVK supporters and constituents gathered to celebrate.',
 '2026 தமிழ்நாடு சட்டமன்ற தேர்தலில் MLA சி.டி.ஆர். நிர்மல் குமாரின் வெற்றியை கொண்டாட திருப்பரங்குன்றத்தில் பிரம்மாண்டமான வெற்றி விழா நடைபெற்றது.',
 NULL, NULL, 'Tirupparankundram Town, Madurai', '2026-05-07 11:30:00+00', '2026-05-07 15:30:00+00', 'public-event'),

(7,
 'Constituency Development Review Meeting',
 'தொகுதி வளர்ச்சி ஆய்வுக் கூட்டம்',
 'MLA C.T.R. Nirmal Kumar chairs a comprehensive review meeting with officials from PWD, TWAD, TNEB, and local administration to assess ongoing development projects and set priorities for roads, water supply, and infrastructure in Tirupparankundram constituency.',
 'MLA நிர்மல் குமார் தலைமையில் PWD, TWAD, TNEB மற்றும் உள்ளாட்சி அதிகாரிகளுடன் திருப்பரங்குன்றம் தொகுதி வளர்ச்சி திட்டங்களை மதிப்பாய்வு செய்ய கூட்டம்.',
 NULL, NULL, 'MLA Office, Tirupparankundram', '2026-06-05 04:30:00+00', '2026-06-05 08:30:00+00', 'official'),

(8,
 'Free Legal Aid & Awareness Camp',
 'இலவச சட்ட உதவி மற்றும் விழிப்புணர்வு முகாம்',
 'Free legal aid camp organised by MLA C.T.R. Nirmal Kumar (LL.B. holder) in association with the Bar Council of Madurai. Citizens can consult lawyers on land disputes, consumer rights, and family law. Special focus on rights of women and senior citizens.',
 'LLB பட்டதாரியான MLA நிர்மல் குமார் மதுரை வழக்கறிஞர் சங்கத்துடன் நடத்தும் இலவச சட்ட ஆலோசனை முகாம். நிலப்பிரச்சினை, நுகர்வோர் உரிமை மற்றும் குடும்பச் சட்டம் பற்றி ஆலோசனை பெறலாம்.',
 NULL, NULL, 'Community Hall, Tirupparankundram', '2026-06-14 03:30:00+00', '2026-06-14 11:30:00+00', 'welfare'),

(9,
 'Monthly Public Grievance Day',
 'மாதாந்திர மக்கள் குறைதீர் நாள்',
 'Monthly open meeting where MLA C.T.R. Nirmal Kumar meets constituents directly to hear and resolve complaints related to roads, water supply, ration, pensions, and civic issues. All residents of Tirupparankundram constituency are welcome.',
 'MLA நிர்மல் குமார் மக்களை நேரடியாக சந்தித்து சாலை, குடிநீர், ரேஷன், ஓய்வூதியம் உள்ளிட்ட பிரச்சினைகளை கேட்டு தீர்க்கும் மாதாந்திர மக்கள் குறைதீர் நாள்.',
 NULL, NULL, 'MLA Constituency Office, Tirupparankundram', '2026-06-20 03:30:00+00', '2026-06-20 07:30:00+00', 'public-hearing'),

(10,
 'Women''s Welfare & Self-Help Group Summit',
 'பெண்கள் நலன் & சுய உதவிக்குழு மாநாடு',
 'A special summit for women''s self-help groups (SHGs) across Tirupparankundram. MLA C.T.R. Nirmal Kumar will distribute welfare assistance, microfinance support certificates, and announce new government scheme benefits for women under TVK''s first budget.',
 'திருப்பரங்குன்றம் தொகுதியிலுள்ள பெண்கள் சுய உதவிக்குழுக்களுக்கு MLA நிர்மல் குமார் நிதி உதவி, அரசு திட்ட சான்றிதழ்கள் வழங்கி சிறப்பு மாநாடு நடத்துகிறார்.',
 NULL, NULL, 'Gandhi Nagar Grounds, Tirupparankundram', '2026-07-05 04:30:00+00', '2026-07-05 09:30:00+00', 'welfare'),

(11,
 'Road Inauguration – Ward 12 Internal Road Development',
 'வார்டு 12 அக சாலை திறப்பு விழா',
 'MLA C.T.R. Nirmal Kumar inaugurates newly laid internal roads in Ward 12, funded under the Tamil Nadu Urban Roads Infrastructure Development Project. The 2.3 km stretch serves approximately 4,500 residents and includes stormwater drains.',
 'MLA நிர்மல் குமார் வார்டு 12 அக சாலைகளை திறந்து வைக்கிறார். 2.3 கி.மீ. சாலை சுமார் 4,500 குடிமக்களுக்கு பயன்படுகிறது மற்றும் மழைநீர் வடிகால் அமைக்கப்பட்டுள்ளது.',
 NULL, NULL, 'Ward 12, Tirupparankundram', '2026-07-12 04:00:00+00', '2026-07-12 06:00:00+00', 'inauguration'),

(12,
 'Youth Skill Development & Employment Programme',
 'இளைஞர் திறன் மேம்பாடு & வேலைவாய்ப்பு நிகழ்ச்சி',
 'Skill development programme for youth aged 18–35, in partnership with Tamil Nadu Skill Development Corporation (TNSDC). Courses in IT, electrical work, automobile maintenance, and hospitality. MLA C.T.R. Nirmal Kumar to distribute TNSDC registration certificates.',
 'TNSDC உடன் இணைந்து 18-35 வயது இளைஞர்களுக்கு IT, மின்னணு, வாகன பராமரிப்பு மற்றும் விருந்தோம்பல் துறைகளில் திறன் பயிற்சி. MLA நிர்மல் குமார் TNSDC சான்றிதழ்கள் வழங்குகிறார்.',
 NULL, NULL, 'Government Polytechnic College, Tirupparankundram', '2026-07-20 03:30:00+00', '2026-07-20 11:30:00+00', 'welfare'),

(13,
 'Thiruparankundram Temple Heritage Walk & Constituent Meet',
 'திருப்பரங்குன்றம் கோவில் பாரம்பரிய நடைப்பயணம் & மக்கள் சந்திப்பு',
 'MLA C.T.R. Nirmal Kumar leads a heritage walk at the famous Thiruparankundram Murugan Temple — one of the six sacred abodes of Lord Murugan (Arupadaiveedu) — and holds an open-air constituent meet to discuss heritage conservation and local tourism development.',
 'அருபடைவீடுகளில் ஒன்றான திருப்பரங்குன்றம் முருகன் கோவிலில் MLA நிர்மல் குமார் பாரம்பரிய நடைப்பயணம் நடத்தி கோவில் பாதுகாப்பு மற்றும் சுற்றுலா வளர்ச்சி குறித்து மக்களுடன் கலந்துரையாடுகிறார்.',
 NULL, NULL, 'Thiruparankundram Murugan Temple, Madurai', '2026-08-02 01:30:00+00', '2026-08-02 04:30:00+00', 'cultural'),

(14,
 'Rooftop Solar Power Scheme Launch – Green Energy Initiative',
 'கூரை சூரிய ஆற்றல் திட்ட தொடக்கம் – பசுமை ஆற்றல் முன்முயற்சி',
 'As Minister of Energy Resources, C.T.R. Nirmal Kumar launches a rooftop solar power scheme for households in Tirupparankundram constituency, aligned with TVK government''s green energy policy. TANGEDCO subsidy forms and on-site registration guidance provided.',
 'ஆற்றல் வளத்துறை அமைச்சரான நிர்மல் குமார் TVK அரசின் பசுமை ஆற்றல் கொள்கையின்படி திருப்பரங்குன்றம் தொகுதி வீடுகளுக்கு கூரை சூரிய ஆற்றல் திட்டத்தை தொடங்கி வைக்கிறார்.',
 NULL, NULL, 'Tirupparankundram Municipal Office', '2026-08-15 04:30:00+00', '2026-08-15 07:30:00+00', 'official');

-- ── GALLERY (placeholder entries — upload real photos via Admin panel) ──
INSERT INTO gallery (id, title, media_url, thumbnail_url, media_type, album, display_order) VALUES
(1, 'திருப்பரங்குன்றம் சாலை திறப்பு விழா', '/uploads/gallery-1.jpg', '/uploads/gallery-1.jpg', 'photo', 'Development Works', 1),
(2, 'இலவச மருத்துவ முகாம் – திருப்பரங்குன்றம்',  '/uploads/gallery-2.jpg', '/uploads/gallery-2.jpg', 'photo', 'Welfare', 2),
(3, 'பொதுக் கூட்டம் – மக்கள் சந்திப்பு',         '/uploads/gallery-3.jpg', '/uploads/gallery-3.jpg', 'photo', 'Events', 3),
(4, 'பள்ளி கட்டிட திறப்பு விழா',                  '/uploads/gallery-4.jpg', '/uploads/gallery-4.jpg', 'photo', 'Development Works', 4),
(5, 'இளைஞர் விளையாட்டு போட்டி 2025',             '/uploads/gallery-5.jpg', '/uploads/gallery-5.jpg', 'photo', 'Events', 5),
(6, 'குடிநீர் திட்டம் – தொகுதி வளர்ச்சி',        '/uploads/gallery-6.jpg', '/uploads/gallery-6.jpg', 'photo', 'Development Works', 6),
(7, 'மர நடவடிக்கை – பச்சை திருப்பரங்குன்றம்',    '/uploads/gallery-7.jpg', '/uploads/gallery-7.jpg', 'photo', 'Environment', 7);

-- ── Done ───────────────────────────────────────────────────
SELECT 'News: ' || count(*) || ' rows' AS status FROM news
UNION ALL
SELECT 'Events: ' || count(*) || ' rows' FROM events
UNION ALL
SELECT 'Gallery: ' || count(*) || ' rows' FROM gallery;
