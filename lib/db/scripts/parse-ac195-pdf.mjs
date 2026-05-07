// Parses the official Madurai District / ECI polling-station PDF for
// AC 195 Thiruparankundram and writes a normalized JSON file that the
// seed step consumes. Re-run after replacing the source PDF.
//
// Source PDF index page: https://madurai.nic.in/list-of-polling-station-3/
// Direct PDF URL: https://cdn.s3waas.gov.in/s3f5f8590cd58a54e94377e6ae2eded4d9/uploads/2021/01/2021012361.pdf
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH = path.resolve(__dirname, "../data/ac195-thiruparankundram-polling-stations.pdf");
const OUT_PATH = path.resolve(__dirname, "../data/ac195-thiruparankundram-polling-stations.json");

function cleanText(text) {
  // Strip page headers/footers and column-header artifacts. Apply a
  // generous repeated cleanup so that booth chunks are not polluted by
  // the "l1 2 3 4 5" column-number row that the PDF repeats per page —
  // those stray digits get mistaken for a booth id otherwise.
  let t = text
    .replace(/Page Number\s*:\s*\d+\s*of\s*\d+/g, " ")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, " ")
    .replace(/List of Polling Stations for 195[\s\S]*?Constituency/g, " ")
    .replace(/Sl\.No[\s\S]*?only or Women/gi, " ")
    .replace(/\s+/g, " ");
  // Now strip the lingering column-header digits ("l1 2 3 4 5" or "1 2 3 4 5").
  t = t.replace(/(?:^|\s)l?1\s+2\s+3\s+4\s+5(?=\s)/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function extractPincode(s) {
  const m = s.match(/\b6\d{5}\b/);
  return m ? m[0] : null;
}

function parseAreas(areasRaw) {
  // Areas come as "1.X (R.V) Y (P) Z ward N ,2.A (R.V) ..." — note the lack
  // of a space between the comma and the next ordinal in the raw PDF text.
  const parts = areasRaw
    .split(/(?:^|\s|,)\d+\./)
    .map((p) => p.trim().replace(/^[,]+/, "").replace(/[,;]+$/, "").trim())
    .filter(Boolean)
    .filter((p) => !/^OVERSEAS ELECTORS/i.test(p));

  return parts.map((part) => {
    const rvMatch = part.match(/^(.+?)\s*\(R\.[VP]\)/i);
    const pMatch = part.match(/\(R\.[VP]\)\s*(.+?)\s*\(P\)/i);
    const wardMatch = part.match(/ward\s*(\d+[A-Za-z]?)/i);
    let tail = part;
    if (pMatch) {
      const idx = part.indexOf("(P)");
      tail = part.slice(idx + 3).trim();
    }
    tail = tail.replace(/ward\s*\d+[A-Za-z]?/i, "").replace(/[,;]+$/, "").trim();
    return {
      revenueVillage: rvMatch ? rvMatch[1].trim() : null,
      panchayat: pMatch ? pMatch[1].trim() : null,
      ward: wardMatch ? wardMatch[1] : null,
      locality: tail || null,
      raw: part,
    };
  });
}

function parseBlocks(text) {
  // Strategy: split on the voter-type tag (which terminates each booth block),
  // then walk back from each chunk to find the booth prefix "N N <location>".
  const VOTER = /(All Voters|Men only|Women only)/g;
  const matches = [...text.matchAll(VOTER)];
  const blocks = [];
  let cursor = 0;
  for (const m of matches) {
    const chunk = text.slice(cursor, m.index).trim();
    const voter = m[0];
    cursor = m.index + voter.length;

    // Find the *last* "N N " pattern in chunk that starts a booth block.
    const head = chunk.match(/(\d+)\s+(\d+)\s+([\s\S]+)$/);
    if (!head) continue;
    const sl = parseInt(head[1], 10);
    const ps = parseInt(head[2], 10);
    if (sl !== ps || sl < 1 || sl > 400) continue;

    const body = head[3].trim();
    const idx = body.search(/(?:^|\s)1\./);
    let location, areasRaw;
    if (idx === -1) {
      location = body;
      areasRaw = "";
    } else {
      location = body.slice(0, idx).trim().replace(/[,]+$/, "");
      areasRaw = body.slice(idx).trim();
    }
    blocks.push({ sl, ps, location, areasRaw, voter });
  }
  return blocks;
}

async function main() {
  const buf = fs.readFileSync(PDF_PATH);
  const parser = new PDFParse({ data: buf });
  const { text, pages } = await parser.getText();

  const cleaned = cleanText(text);
  const blocks = parseBlocks(cleaned);

  const booths = blocks.map(({ sl, ps, location, areasRaw, voter }) => {
    const areas = parseAreas(areasRaw);
    return {
      slNo: sl,
      boothNo: String(ps),
      location,
      pincode: extractPincode(location),
      voterType: voter.toLowerCase().includes("men") ? "men_only"
              : voter.toLowerCase().includes("women") ? "women_only"
              : "all",
      areas,
    };
  });

  // Sanity: dedupe on boothNo (some chunks can split across pages).
  const byBooth = new Map();
  for (const b of booths) {
    if (!byBooth.has(b.boothNo)) byBooth.set(b.boothNo, b);
  }
  const dedup = [...byBooth.values()].sort((a, b) => a.slNo - b.slNo);

  const summary = {
    source: {
      url: "https://cdn.s3waas.gov.in/s3f5f8590cd58a54e94377e6ae2eded4d9/uploads/2021/01/2021012361.pdf",
      indexUrl: "https://madurai.nic.in/list-of-polling-station-3/",
      assemblyConstituency: "AC 195 Thiruparankundram",
      parliamentaryConstituency: "PC 34 Viruthunagar",
      pdfPages: pages.length,
      fetchedAt: "2025-11-05",
      note: "Public PDF published by Madurai District (Government of Tamil Nadu).",
    },
    counts: {
      booths: dedup.length,
      uniqueRevenueVillages: new Set(dedup.flatMap(b => b.areas.map(a => a.revenueVillage).filter(Boolean))).size,
      uniquePanchayats: new Set(dedup.flatMap(b => b.areas.map(a => a.panchayat).filter(Boolean))).size,
      uniquePincodes: new Set(dedup.map(b => b.pincode).filter(Boolean)).size,
    },
    booths: dedup,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  console.log("Wrote", OUT_PATH);
  console.log("Booths:", summary.counts.booths);
  console.log("Unique RV:", summary.counts.uniqueRevenueVillages);
  console.log("Unique Panchayats:", summary.counts.uniquePanchayats);
  console.log("Unique Pincodes:", summary.counts.uniquePincodes);
  if (dedup.length > 0) {
    console.log("Sample booth #1:", JSON.stringify(dedup[0], null, 2));
    console.log("Sample booth last:", JSON.stringify(dedup[dedup.length - 1], null, 2));
  }
}
await main();
