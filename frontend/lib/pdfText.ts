export const MAX_PDF_PAGES = 150;
export const MAX_PDF_MB = 30;
export const MAX_QUESTIONS_PER_REQUEST = 15;
const CHUNK_CHARS = 10_000;

/** Reads the text of every page, in the browser. The file is never uploaded. */
export async function extractPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist"); // loaded only when needed, only in the browser
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`This PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Please split it into parts.`);
    }

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      }
      pages.push(text.replace(/[ \t]+/g, " ").trim());
      onProgress?.(i, pdf.numPages);
    }

    const totalChars = pages.reduce((n, p) => n + p.length, 0);
    if (totalChars < Math.max(300, pages.length * 40)) {
      throw new Error("This PDF has almost no readable text. Scanned PDFs (pictures of pages) are not supported yet.");
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

/**
 * Groups pages into pieces of about 10,000 characters. With overlapPages = 1 each piece
 * starts on the last page of the previous one, so a question that runs across a page break
 * is whole in at least one piece (the server skips the duplicates this creates).
 */
export function chunkPages(pages: string[], maxChars = CHUNK_CHARS, overlapPages = 0): string[] {
  const clean = pages.filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let text = "";
    let j = i;
    while (j < clean.length && (text.length === 0 || text.length + clean[j].length + 2 <= maxChars)) {
      text += (text ? "\n\n" : "") + clean[j];
      j++;
    }
    if (text.length > maxChars) {
      for (let k = 0; k < text.length; k += maxChars) chunks.push(text.slice(k, k + maxChars)); // one huge page
    } else {
      chunks.push(text);
    }
    if (j >= clean.length) break;
    i = Math.max(j - overlapPages, i + 1);
  }
  return chunks;
}

/** More questions than the text can honestly support just produces repeats and filler. */
export function maxQuestionsFor(chunks: string[]): number {
  const chars = chunks.reduce((n, c) => n + c.length, 0);
  return Math.max(0, Math.min(chunks.length * MAX_QUESTIONS_PER_REQUEST, Math.floor(chars / 500)));
}

/** Spreads `total` questions over the document: each request reads a different part. */
export function planBatches(chunkCount: number, total: number): { chunk: number; count: number }[] {
  const batches = Math.min(chunkCount, Math.ceil(total / 10));
  const base = Math.floor(total / batches);
  const extra = total % batches;
  return Array.from({ length: batches }, (_, b) => ({
    chunk: Math.floor((b * chunkCount) / batches),
    count: base + (b < extra ? 1 : 0),
  }));
}