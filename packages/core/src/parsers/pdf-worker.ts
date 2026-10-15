// Bundled inline so hosts do not have to serve the pdf.js worker file separately.
// Hosts with a strict CSP (no blob: workers) can call configurePdf({ workerSrc }) instead.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';

export const createPdfWorker = (): Worker => new PdfWorker();
