// OCR fallback for scanned voter-roll PDFs.
//
// The CEO portal sometimes serves PDFs that are flat scanned images
// with no text layer. For those pages we render the page to a PNG with
// pdf-to-img (which uses pdfjs internally — no system deps), then run
// tesseract.js with the eng+tam traineddata so Tamil names are picked
// up alongside English labels.
//
// Both deps are loaded lazily so the import code path stays fast on
// the common case (text-extractable PDF) and avoids 30-50 MB of WASM
// allocation on cold start.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const requireCjs = createRequire(import.meta.url);

export interface OcrPageText {
  page: number;
  text: string;
}

// Resolve the directory that ships eng.traineddata + tam.traineddata.
// Without this, tesseract.js silently falls back to the jsdelivr CDN
// (which is what was breaking OCR — no internet egress in this
// environment, so worker.recognize() returns empty strings and every
// scanned page yields zero voters).
function resolveLangPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Bundled run: `dist/index.mjs` → traineddata sits one level up.
  // Dev tsx run: `src/lib/voterOcr.ts` → traineddata is two levels up.
  // Plus a cwd-relative fallback for safety.
  const candidates = [
    resolve(here, ".."),
    resolve(here, "..", ".."),
    resolve(here, "..", "..", ".."),
    process.cwd(),
  ];
  for (const c of candidates) {
    if (existsSync(resolve(c, "eng.traineddata")) && existsSync(resolve(c, "tam.traineddata"))) {
      return c;
    }
  }
  // Last-resort: return the api-server root and let tesseract surface
  // a clear "ENOENT eng.traineddata" error rather than a silent CDN
  // fetch.
  return resolve(here, "..");
}

let workerPromise: Promise<unknown> | null = null;

async function getWorker() {
  if (!workerPromise) {
    const langPath = resolveLangPath();
    console.log(`[voter-ocr] using local traineddata at ${langPath}`);
    // tesseract.js exports both ESM and CJS; CJS is what bundles cleanly.
    const tesseract = requireCjs("tesseract.js") as {
      createWorker: (
        langs: string,
        oem?: number,
        opts?: { langPath?: string; cachePath?: string; gzip?: boolean; logger?: (m: unknown) => void },
      ) => Promise<{
        recognize(buf: Buffer): Promise<{ data: { text: string } }>;
        terminate(): Promise<void>;
      }>;
    };
    workerPromise = tesseract.createWorker("eng+tam", 1, {
      langPath,
      // Local traineddata files are uncompressed (.traineddata, not
      // .traineddata.gz). Without this flag tesseract appends ".gz"
      // and ENOENTs.
      gzip: false,
      // Keep the on-disk cache out of the (read-only in some envs)
      // package directory.
      cachePath: "/tmp",
    });
  }
  return workerPromise as Promise<{
    recognize(buf: Buffer): Promise<{ data: { text: string } }>;
    terminate(): Promise<void>;
  }>;
}

/**
 * Render the scanned pages of a PDF and OCR them. `targetPages` is a
 * 1-indexed list — only those pages are rendered so we don't waste
 * minutes OCRing pages that already have a text layer.
 *
 * Returns an empty array on any error; callers should treat OCR as
 * best-effort and keep the original "skipped" entry as the fallback.
 */
export async function ocrScannedPages(
  pdfBuffer: Buffer,
  targetPages: number[],
): Promise<OcrPageText[]> {
  if (targetPages.length === 0) return [];
  try {
    const mod = (await import("pdf-to-img")) as unknown as {
      pdf: (input: Buffer | Uint8Array, opts?: { scale?: number }) => AsyncIterable<Buffer>;
    };
    const targetSet = new Set(targetPages);
    const out: OcrPageText[] = [];
    let pageNo = 0;
    const worker = await getWorker();
    for await (const png of mod.pdf(pdfBuffer, { scale: 2 })) {
      pageNo += 1;
      if (!targetSet.has(pageNo)) continue;
      try {
        const { data } = await worker.recognize(png);
        const text = data.text ?? "";
        console.log(
          `[voter-ocr] page ${pageNo}: ${text.length} chars; preview="${text.replace(/\s+/g, " ").slice(0, 100)}"`,
        );
        out.push({ page: pageNo, text });
      } catch (e) {
        console.error(`[voter-ocr] page ${pageNo} failed:`, (e as Error).message);
      }
    }
    return out;
  } catch (e) {
    console.error("[voter-ocr] pipeline unavailable:", (e as Error).message);
    return [];
  }
}
