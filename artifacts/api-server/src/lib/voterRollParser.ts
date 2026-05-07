// Parser for Tamil Nadu CEO electoral-roll PDFs (one PDF per polling
// part for AC 195 Thiruparankundram). The CEO format is a 3-column
// grid where each cell holds one elector with English labels:
//
//   1
//   Name: KUMAR S
//   Husband Name: RAJA
//   House No: 12/3
//   Age: 45  Gender: Male
//   EPIC NO: ABC1234567
//
// Some pages are scanned images — we expose an OCR hook so a later
// patch can plug in tesseract.js. Out-of-the-box we extract from the
// text layer only; image-only PDFs report `ocrPagesCount` and the
// affected serials land in `skipped` so staff can re-upload with OCR.

import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);

export interface ParsedVoter {
  epicNumber: string;
  fullName: string;
  fullNameTa?: string | null;
  age?: number | null;
  gender?: "M" | "F" | "O" | null;
  relationType?: string | null;
  relationName?: string | null;
  houseNumber?: string | null;
  addressLine?: string | null;
  partNumber?: string | null;
  serialInPart?: number | null;
  sourcePage?: number | null;
}

export interface SkippedBlock {
  page: number;
  reason: string;
  raw: string;
}

export interface ParseResult {
  partNumber: string | null;
  pollingStationHint: string | null;
  pageCount: number;
  ocrPagesCount: number;
  voters: ParsedVoter[];
  skipped: SkippedBlock[];
}

// EPIC: typically 3 letters + 7 digits, but legacy IDs can be 10 chars
// of any uppercase letter/digit mix.
const EPIC_RE = /\b([A-Z]{2,3}[0-9]{6,8}|[A-Z0-9]{10})\b/g;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function pickGender(raw: string | null | undefined): "M" | "F" | "O" | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v.startsWith("M")) return "M";
  if (v.startsWith("F")) return "F";
  if (v.startsWith("O") || v.startsWith("T")) return "O";
  return null;
}

function pickRelationType(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes("father")) return "father";
  if (l.includes("mother")) return "mother";
  if (l.includes("husband")) return "husband";
  if (l.includes("wife")) return "wife";
  if (l.includes("guardian")) return "guardian";
  if (l.includes("other")) return "other";
  return null;
}

function extractField(block: string, labelRe: RegExp): string | null {
  const m = block.match(labelRe);
  if (!m) return null;
  return normalizeWhitespace(m[1] ?? "") || null;
}

function parsePartNumber(text: string): string | null {
  // "Part No. 123" or "Part No: 123" or "பாகம் எண் 123"
  const m =
    text.match(/Part\s*No\.?\s*[:\-]?\s*(\d{1,4})/i) ||
    text.match(/பாகம்\s*எண்\s*[:\-]?\s*(\d{1,4})/);
  return m ? m[1] : null;
}

function parsePollingStationHint(text: string): string | null {
  const m = text.match(/Polling\s*Station\s*[:\-]?\s*([^\n\r]+?)(?:Address|Number|Part|$)/i);
  if (!m) return null;
  return normalizeWhitespace(m[1]).slice(0, 200) || null;
}

// Split a page of text into voter blocks. The CEO format prefixes each
// elector cell with a serial number on its own line, followed by
// "Name:" and ending with "EPIC NO: ABC1234567". Splitting on the
// EPIC label is wrong because EPIC sits at the *end* of a cell, so a
// split-at-EPIC chunk would attach an EPIC to the *next* voter's
// Name/Age fields. Instead we split at the serial-then-Name boundary
// that opens each cell.
function splitVoterBlocks(pageText: string): { serial: number | null; raw: string }[] {
  // Normalize EPIC label variants to a single sentinel for downstream
  // field extraction, but DON'T split on it.
  const normalized = pageText.replace(
    /(?:EPIC\s*NO\.?|Card\s*No\.?|ID\s*Card\s*No\.?|EPIC)\s*[:\-]?/gi,
    "‹EPIC›",
  );

  // A new voter cell opens with: <serial number on its own>\n? Name:
  // We find every such boundary, then slice the page accordingly so
  // each block runs from one Name: header up to (but not including)
  // the next.
  const headerRe = /(?:^|\n)\s*(\d{1,4})\s*\n+\s*Name\s*[:\-]/gi;
  const offsets: { idx: number; serial: number; nameStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(normalized)) !== null) {
    // nameStart points to the "Name:" token so the slice keeps it.
    const nameStart = normalized.indexOf("Name", m.index);
    if (nameStart < 0) continue;
    offsets.push({ idx: m.index, serial: parseInt(m[1], 10), nameStart });
  }

  const blocks: { serial: number | null; raw: string }[] = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const start = offsets[i]!.nameStart;
    const end = i + 1 < offsets.length ? offsets[i + 1]!.idx : normalized.length;
    const raw = normalized.slice(start, end).trim();
    if (!/‹EPIC›/.test(raw)) continue;
    blocks.push({ serial: offsets[i]!.serial, raw });
  }
  return blocks;
}

function parseVoterBlock(
  block: string,
  serial: number | null,
  page: number,
  partNumber: string | null,
): ParsedVoter | { skipped: SkippedBlock } {
  const epicMatch = block.match(/‹EPIC›\s*([A-Z0-9]{7,12})/);
  const epic = epicMatch ? epicMatch[1].toUpperCase() : null;
  if (!epic || !EPIC_RE.test(epic)) {
    EPIC_RE.lastIndex = 0;
    return {
      skipped: { page, reason: "no-epic", raw: block.slice(0, 200) },
    };
  }
  EPIC_RE.lastIndex = 0;

  const name = extractField(block, /Name\s*[:\-]\s*([^\n\r]+?)(?:Father|Husband|Mother|Wife|Guardian|Other|Relation|House|Age|Gender|Sex|‹EPIC›|$)/i);
  if (!name) {
    return {
      skipped: { page, reason: "no-name", raw: block.slice(0, 200) },
    };
  }

  // Find the first relation label present and capture both type+value.
  const relMatch = block.match(
    /(Father|Husband|Mother|Wife|Guardian|Other)(?:'s)?\s*Name\s*[:\-]\s*([^\n\r]+?)(?:House|Age|Gender|Sex|‹EPIC›|$)/i,
  );
  const relationType = relMatch ? pickRelationType(relMatch[1]) : null;
  const relationName = relMatch ? normalizeWhitespace(relMatch[2]) : null;

  const ageRaw = extractField(block, /Age\s*[:\-]\s*(\d{1,3})/i);
  const age = ageRaw ? parseInt(ageRaw, 10) : null;
  const gender = pickGender(extractField(block, /(?:Gender|Sex)\s*[:\-]\s*([A-Za-z]+)/i));
  const houseNumber = extractField(block, /House\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:Age|Gender|Sex|‹EPIC›|$)/i);

  return {
    epicNumber: epic,
    fullName: normalizeWhitespace(name),
    age: age && age > 0 && age < 130 ? age : null,
    gender,
    relationType,
    relationName,
    houseNumber,
    addressLine: null,
    partNumber,
    serialInPart: serial,
    sourcePage: page,
  };
}

export async function parseVoterRollPdf(buffer: Buffer): Promise<ParseResult> {
  // Lazy CJS require — pdf-parse ships ESM/CJS hybrid that mis-resolves
  // when pulled in through esbuild's static analyzer.
  const { PDFParse } = requireCjs("pdf-parse") as {
    PDFParse: new (opts: { data: Buffer }) => {
      getText(): Promise<{ text: string; pages: { text: string }[] }>;
    };
  };

  const parser = new PDFParse({ data: buffer });
  const { text: fullText, pages } = await parser.getText();

  const partNumber = parsePartNumber(fullText);
  const pollingStationHint = parsePollingStationHint(fullText);

  const voters: ParsedVoter[] = [];
  const skipped: SkippedBlock[] = [];
  const seenEpics = new Set<string>();
  let ocrPagesCount = 0;

  pages.forEach((p, idx) => {
    const pageNo = idx + 1;
    const pageText = p.text ?? "";
    // Heuristic: a CEO roll page that's a scanned image yields almost
    // no extractable text. Treat such pages as needing OCR.
    if (normalizeWhitespace(pageText).length < 80) {
      ocrPagesCount += 1;
      skipped.push({
        page: pageNo,
        reason: "scanned-page-needs-ocr",
        raw: pageText.slice(0, 120),
      });
      return;
    }
    const blocks = splitVoterBlocks(pageText);
    for (const { serial, raw } of blocks) {
      const result = parseVoterBlock(raw, serial, pageNo, partNumber);
      if ("skipped" in result) {
        skipped.push(result.skipped);
        continue;
      }
      if (seenEpics.has(result.epicNumber)) continue;
      seenEpics.add(result.epicNumber);
      voters.push(result);
    }
  });

  return {
    partNumber,
    pollingStationHint,
    pageCount: pages.length,
    ocrPagesCount,
    voters,
    skipped,
  };
}
