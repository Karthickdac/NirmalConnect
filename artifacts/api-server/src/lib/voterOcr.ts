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

const requireCjs = createRequire(import.meta.url);

export interface OcrPageText {
  page: number;
  text: string;
}

let workerPromise: Promise<unknown> | null = null;

async function getWorker() {
  if (!workerPromise) {
    // tesseract.js exports both ESM and CJS; CJS is what bundles cleanly.
    const tesseract = requireCjs("tesseract.js") as {
      createWorker: (langs: string, oem?: number, opts?: unknown) => Promise<{
        recognize(buf: Buffer): Promise<{ data: { text: string } }>;
        terminate(): Promise<void>;
      }>;
    };
    workerPromise = tesseract.createWorker("eng+tam");
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
        out.push({ page: pageNo, text: data.text });
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
