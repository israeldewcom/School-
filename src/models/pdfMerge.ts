import { PDFDocument } from 'pdf-lib';
import axios from 'axios';

// Downloads each PDF by URL (they're stored on Cloudinary as raw files)
// and merges them into a single PDF buffer for one-click printing.
export const mergePDFsFromUrls = async (urls: string[]): Promise<Buffer> => {
  const merged = await PDFDocument.create();

  for (const url of urls) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const sourceDoc = await PDFDocument.load(response.data);
    const copiedPages = await merged.copyPages(sourceDoc, sourceDoc.getPageIndices());
    copiedPages.forEach((page) => merged.addPage(page));
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
};
