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

import { ocrScannedPages } from "./voterOcr.js";


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

  // ── Strict path (text-layer PDFs) ──────────────────────────────
  // A new voter cell opens with: <serial number on its own>\n? Name:
  // We find every such boundary, then slice the page accordingly so
  // each block runs from one Name: header up to (but not including)
  // the next.
  const headerRe = /(?:^|\n)\s*(\d{1,4})\s*\n+\s*Name\s*[:\-]/gi;
  const offsets: { idx: number; serial: number; nameStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(normalized)) !== null) {
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
  if (blocks.length > 0) return blocks;

  // ── Lenient fallback (OCR output) ──────────────────────────────
  // OCR'd 3-column grids rarely produce a clean "<serial>\nName:"
  // boundary — column reading order, line-wrap noise, and dropped
  // newlines all break the strict regex. As a fallback, anchor on
  // the EPIC sentinel (which IS reliably recognised by tesseract
  // because the IDs are uppercase ASCII), then walk backwards to
  // grab the surrounding ~600 chars as the cell body. We accept any
  // serial we can find inside that window; otherwise the row will
  // still get an EPIC + name and the import job assigns serial=null.
  const epicSentinelRe = /‹EPIC›\s*([A-Z0-9]{7,12})/g;
  const epicMatches: { idx: number; epicEnd: number }[] = [];
  while ((m = epicSentinelRe.exec(normalized)) !== null) {
    epicMatches.push({ idx: m.index, epicEnd: m.index + m[0].length });
  }
  const out: { serial: number | null; raw: string }[] = [];
  for (let i = 0; i < epicMatches.length; i += 1) {
    const epicIdx = epicMatches[i]!.idx;
    const prevEnd = i > 0 ? epicMatches[i - 1]!.epicEnd : 0;
    // Window from the previous EPIC end to a little past this EPIC.
    const winStart = Math.max(prevEnd, epicIdx - 600);
    const winEnd = Math.min(normalized.length, epicMatches[i]!.epicEnd + 40);
    const raw = normalized.slice(winStart, winEnd).trim();
    if (!/Name|பெயர்/i.test(raw)) continue;
    const serialMatch = raw.match(/(?:^|\n)\s*(\d{1,4})\s*(?:\n|Name|பெயர்)/i);
    const serial = serialMatch ? parseInt(serialMatch[1]!, 10) : null;
    out.push({ serial, raw });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// OCR grid parser
// ─────────────────────────────────────────────────────────────────
// Tamil-Nadu CEO scanned voter-roll PDFs render each page as a
// 3-column × ~9-row grid of voter cards. Tesseract reads the grid
// row-by-row, so a single OCR text line concatenates the SAME field
// from all three columns. A typical row band looks like:
//
//   <epic-line>            ← 3 EPIC codes, often partly garbled
//   Name : A    Name : B    Name : C
//   Father Name: X  Husband Name: Y  Father Name: Z
//   House Number : 1-100 Photo House Number : 1-101 Photo House Number : 1-102 Photo
//   Age : 32 Gender : Male  Age : 28 Gender : Female  Age : 41 Gender : Male
//   Available  Available  Available
//
// We anchor on the Name line (which must contain ≥2 "Name :"
// markers), then split each of the next 3 lines at the corresponding
// field marker to recover up to 3 column cells. EPICs come from the
// preceding line when readable, otherwise we mint a deterministic
// surrogate keyed off the file SHA + grid coordinates so re-uploads
// of the same scan dedup cleanly while still satisfying the
// `voters.epic_number NOT NULL UNIQUE` constraint.

const NAME_MARKER_RE = /['‘`]?\s*N(?:ame|ama|amo|am)\s*[:;.\-]\s*/gi;
const REL_MARKER_RE = /\b(Father|Husband|Mother|Wife|Guardian)(?:'s)?\s*Names?\s*[:;.\-]?\s*/gi;
const HOUSE_MARKER_RE = /House\s*Number\s*[:;.\-]?\s*/gi;
const AGE_MARKER_RE = /\bA(?:ge|go|ga)\b/gi;
// Strict canonical-EPIC shape only (3 uppercase letters + 7 digits).
// We deliberately do NOT accept loose numeric-only or short-prefix
// variants here: a misread that happens to look like a valid EPIC
// would otherwise become an upsert key on `voters.epic_number` and
// silently overwrite an unrelated voter row. Anything that doesn't
// match this strict shape falls through to a deterministic surrogate
// (`OCR-{fileSha16}-P{page}R{row}C{col}`).
const EPIC_LIKE_RE = /\b([A-Z]{3}[0-9]{7})\b/g;

function findMarkerRanges(
  line: string,
  markerRe: RegExp,
): Array<{ start: number; matchEnd: number; matchText: string; groups: RegExpExecArray }> {
  const re = new RegExp(
    markerRe.source,
    markerRe.flags.includes("g") ? markerRe.flags : markerRe.flags + "g",
  );
  const out: Array<{ start: number; matchEnd: number; matchText: string; groups: RegExpExecArray }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push({
      start: m.index,
      matchEnd: m.index + m[0].length,
      matchText: m[0],
      groups: m,
    });
    if (re.lastIndex === m.index) re.lastIndex += 1;
  }
  return out;
}

function splitCellValues(line: string, markerRe: RegExp): (string | null)[] {
  const ranges = findMarkerRanges(line, markerRe);
  const out: (string | null)[] = [null, null, null];
  for (let i = 0; i < ranges.length && i < 3; i += 1) {
    const start = ranges[i]!.matchEnd;
    const end = i + 1 < ranges.length ? ranges[i + 1]!.start : line.length;
    const v = line.slice(start, end).trim();
    out[i] = v.length > 0 ? v : null;
  }
  return out;
}

function splitRelationCells(line: string): Array<{ label: string; value: string } | null> {
  const ranges = findMarkerRanges(line, REL_MARKER_RE);
  const out: Array<{ label: string; value: string } | null> = [null, null, null];
  for (let i = 0; i < ranges.length && i < 3; i += 1) {
    const start = ranges[i]!.matchEnd;
    const end = i + 1 < ranges.length ? ranges[i + 1]!.start : line.length;
    const v = line.slice(start, end).trim();
    if (v.length === 0) continue;
    out[i] = { label: ranges[i]!.groups[1] ?? "", value: v };
  }
  return out;
}

function splitAgeGenderCells(line: string): Array<{ age: number | null; gender: "M" | "F" | "O" | null }> {
  const ranges = findMarkerRanges(line, AGE_MARKER_RE);
  const out: Array<{ age: number | null; gender: "M" | "F" | "O" | null }> = [
    { age: null, gender: null },
    { age: null, gender: null },
    { age: null, gender: null },
  ];
  for (let i = 0; i < ranges.length && i < 3; i += 1) {
    const start = ranges[i]!.matchEnd;
    const end = i + 1 < ranges.length ? ranges[i + 1]!.start : line.length;
    const seg = line.slice(start, end);
    const ageM = seg.match(/[:+\-]?\s*(\d{1,3})/);
    let age: number | null = null;
    if (ageM) {
      const n = parseInt(ageM[1]!, 10);
      // Drop a leading "1" artefact: OCR often reads "Age 128" when
      // the real value is 28 (the leading "1" is the column rule).
      if (n >= 100 && n < 130) {
        const stripped = parseInt(ageM[1]!.slice(1), 10);
        age = stripped >= 18 && stripped < 100 ? stripped : null;
      } else if (n >= 18 && n < 130) {
        age = n;
      }
    }
    const genderM = seg.match(/Gender\s*[:;.\-]?\s*([A-Za-z]+)/i);
    out[i] = { age, gender: pickGender(genderM ? genderM[1]! : null) };
  }
  return out;
}

function stripTrailingPhoto(s: string): string {
  return s.replace(/\s*Photo\s*$/i, "").replace(/\s*Phote\s*$/i, "").trim();
}

function isPlausibleName(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 80) return false;
  // Reject pure numbers / pure punctuation (e.g. OCR misread cell as "16")
  if (!/[A-Za-z\u0B80-\u0BFF]/.test(t)) return false;
  return true;
}

function extractEpicsForRow(epicLine: string): (string | null)[] {
  const out: (string | null)[] = [null, null, null];
  if (!epicLine) return out;
  const matches: Array<{ code: string; pos: number }> = [];
  let m: RegExpExecArray | null;
  EPIC_LIKE_RE.lastIndex = 0;
  while ((m = EPIC_LIKE_RE.exec(epicLine)) !== null) {
    matches.push({ code: m[1]!, pos: m.index });
  }
  EPIC_LIKE_RE.lastIndex = 0;
  if (matches.length === 0) return out;
  if (matches.length >= 3) {
    out[0] = matches[0]!.code;
    out[1] = matches[1]!.code;
    out[2] = matches[2]!.code;
    return out;
  }
  // Position-based assignment when fewer than 3 EPICs were recognised.
  const lineLen = Math.max(epicLine.length, 1);
  for (const { code, pos } of matches) {
    const frac = pos / lineLen;
    const col = frac < 0.34 ? 0 : frac < 0.67 ? 1 : 2;
    if (out[col] == null) out[col] = code;
  }
  return out;
}

export function parseOcrPage(
  pageText: string,
  pageNo: number,
  partNumber: string | null,
  fileShaShort: string,
): ParsedVoter[] {
  const lines = pageText.split(/\r?\n/);
  const voters: ParsedVoter[] = [];
  let rowIdx = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    // A row-band header line has at least 2 "Name :" markers.
    const nameMarkers = findMarkerRanges(line, NAME_MARKER_RE);
    if (nameMarkers.length < 2) continue;

    const relLine = lines[i + 1] ?? "";
    const houseLine = lines[i + 2] ?? "";
    const ageLine = lines[i + 3] ?? "";
    // Sanity check: at least the house OR age line must look right.
    // Otherwise we've matched a stray "Name :" inside body text.
    if (!/Number/i.test(houseLine) && !/Age|Ago|Aga/i.test(ageLine)) continue;

    rowIdx += 1;
    const epicLine = i > 0 ? lines[i - 1] ?? "" : "";
    const epics = extractEpicsForRow(epicLine);

    const names = splitCellValues(line, NAME_MARKER_RE);
    const rels = splitRelationCells(relLine);
    const houses = splitCellValues(houseLine, HOUSE_MARKER_RE);
    const ages = splitAgeGenderCells(ageLine);

    for (let col = 0; col < 3; col += 1) {
      const rawName = names[col];
      if (!rawName) continue;
      // Names sometimes have a trailing "Photo" or stray punctuation
      // when OCR slid the column boundary; strip and validate.
      const name = stripTrailingPhoto(rawName).replace(/[|]+$/g, "").trim();
      if (!isPlausibleName(name)) continue;

      const relInfo = rels[col];
      const houseRaw = houses[col];
      const ageInfo = ages[col] ?? { age: null, gender: null };

      const epicReal = epics[col];
      const epic =
        epicReal ?? `OCR-${fileShaShort}-P${pageNo}R${rowIdx}C${col + 1}`;

      voters.push({
        epicNumber: epic.toUpperCase(),
        fullName: normalizeWhitespace(name),
        age: ageInfo.age,
        gender: ageInfo.gender,
        relationType: relInfo ? pickRelationType(relInfo.label) : null,
        relationName: relInfo
          ? normalizeWhitespace(stripTrailingPhoto(relInfo.value))
          : null,
        houseNumber: houseRaw ? stripTrailingPhoto(houseRaw) || null : null,
        addressLine: null,
        partNumber,
        serialInPart: null,
        sourcePage: pageNo,
      });
    }

    // Skip the lines we just consumed (Name + 3 field lines).
    i += 3;
  }

  return voters;
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

export async function parseVoterRollPdf(
  buffer: Buffer,
  fileSha: string,
): Promise<ParseResult> {
  // fileSha is required because the OCR fallback uses it to mint
  // deterministic surrogate EPICs for cells whose printed EPIC was
  // unreadable. A blank or short SHA would risk surrogate collisions
  // across imports, which would corrupt unrelated voter rows on
  // upsert. Fail fast rather than silently degrade.
  if (!fileSha || fileSha.length < 16) {
    throw new Error(
      "parseVoterRollPdf: fileSha (≥16 hex chars) is required for safe OCR surrogate keys",
    );
  }
  // IMPORTANT: must be a dynamic ESM import, not requireCjs.
  // pdf-parse@2.4.5's CJS bundle (`dist/pdf-parse/cjs/index.cjs`) is
  // a single-line bundle that inlines its OWN copy of pdfjs-dist
  // 5.4.296 — it ignores whatever pdfjs-dist version is in node_modules.
  // pdf-to-img@6 loads pdfjs-dist 5.6.205 from node_modules, and pdfjs
  // strictly requires its API and Worker bundles to be the same
  // version. Mixing the two paths (CJS pdf-parse + ESM pdf-to-img)
  // crashed the OCR pipeline with
  //   "API version 5.6.205 does not match Worker version 5.4.296".
  // The ESM build of pdf-parse imports
  //   pdfjs-dist/legacy/build/pdf.mjs
  // which respects the workspace pnpm `pdfjs-dist` override and
  // resolves to the same 5.6.205 that pdf-to-img sees. Keep both libs
  // on the ESM path so they share one pdfjs version.
  const { PDFParse } = (await import("pdf-parse")) as unknown as {
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
  const scannedPages: number[] = [];

  pages.forEach((p, idx) => {
    const pageNo = idx + 1;
    const pageText = p.text ?? "";
    // Heuristic: a CEO roll page that's a scanned image yields almost
    // no extractable text. Queue it for OCR after we finish the
    // text-layer pass.
    if (normalizeWhitespace(pageText).length < 80) {
      ocrPagesCount += 1;
      scannedPages.push(pageNo);
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

  // OCR fallback (Tamil + English) for scanned pages. Best-effort: if
  // the pipeline fails or returns nothing for a page, we keep the
  // original "scanned-page-needs-ocr" skip marker so staff know.
  if (scannedPages.length > 0) {
    const ocrResults = await ocrScannedPages(buffer, scannedPages);
    const ocredSet = new Set<number>();
    // Short, stable surrogate-EPIC prefix derived from the file
    // contents so re-uploading the same scan dedups against itself.
    // 16 hex chars = 64 bits of entropy. Surrogate-key collisions
    // between two different files now require ~2^32 imports before
    // becoming likely (birthday bound), well beyond any plausible
    // workload for this app.
    const fileShaShort = fileSha.slice(0, 16).toUpperCase();
    for (const { page, text } of ocrResults) {
      // Try the strict block parser first (in case OCR produced a
      // clean text-layer-shaped output for this page).
      const blocks = splitVoterBlocks(text);
      let pageContributed = 0;
      for (const { serial, raw } of blocks) {
        const result = parseVoterBlock(raw, serial, page, partNumber);
        if ("skipped" in result) continue;
        if (seenEpics.has(result.epicNumber)) continue;
        seenEpics.add(result.epicNumber);
        voters.push(result);
        pageContributed += 1;
      }
      // Then run the 3-column grid parser, which handles the typical
      // CEO scanned-roll layout. Surrogate EPICs prevent collisions
      // across cells where OCR couldn't read the printed EPIC.
      const gridVoters = parseOcrPage(text, page, partNumber, fileShaShort);
      for (const v of gridVoters) {
        if (seenEpics.has(v.epicNumber)) continue;
        seenEpics.add(v.epicNumber);
        voters.push(v);
        pageContributed += 1;
      }
      if (pageContributed > 0) ocredSet.add(page);
    }
    for (const page of scannedPages) {
      if (!ocredSet.has(page)) {
        skipped.push({
          page,
          reason: "scanned-page-ocr-empty",
          raw: "(OCR returned no parseable voter records)",
        });
      }
    }
  }

  return {
    partNumber,
    pollingStationHint,
    pageCount: pages.length,
    ocrPagesCount,
    voters,
    skipped,
  };
}
