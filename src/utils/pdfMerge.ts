// src/utils/pdfMerge.ts
import { PDFDocument, PDFPage } from 'pdf-lib';
import axios from 'axios';

/**
 * Fetch multiple PDF URLs and merge them into a single PDF buffer.
 * The returned buffer can be uploaded to storage or streamed in a
 * response with `Content-Type: application/pdf`.
 */
export async function mergePdfs(urls: string[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const url of urls) {
    if (!url) continue;
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    const sourcePdf = await PDFDocument.load(resp.data);
    const copiedPages: PDFPage[] = await merged.copyPages(
      sourcePdf,
      sourcePdf.getPageIndices()
    );
    for (const page of copiedPages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
}

/**
 * Alias used by reportCard.service.ts. Same implementation.
 */
export const mergePDFsFromUrls = mergePdfs;

/**
 * Merge a list of already-in-memory buffers. Useful when report cards
 * are generated in batches and then stitched together.
 */
export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    if (!buf || buf.length === 0) continue;
    const sourcePdf = await PDFDocument.load(buf);
    const copiedPages: PDFPage[] = await merged.copyPages(
      sourcePdf,
      sourcePdf.getPageIndices()
    );
    for (const page of copiedPages) {
      merged.addPage(page);
    }
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}
