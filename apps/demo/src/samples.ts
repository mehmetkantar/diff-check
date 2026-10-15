import ndaV1Docx from '../../../fixtures/bilingual-nda-v1.docx?url';
import ndaV1Pdf from '../../../fixtures/bilingual-nda-v1.pdf?url';
import ndaV2Docx from '../../../fixtures/bilingual-nda-v2.docx?url';
import ndaV2Pdf from '../../../fixtures/bilingual-nda-v2.pdf?url';
import serviceV1Docx from '../../../fixtures/service-agreement-v1.docx?url';
import serviceV1Pdf from '../../../fixtures/service-agreement-v1.pdf?url';
import serviceV2Docx from '../../../fixtures/service-agreement-v2.docx?url';
import serviceV2Ocr from '../../../fixtures/service-agreement-v2-ocr.pdf?url';
import serviceV2Pdf from '../../../fixtures/service-agreement-v2.pdf?url';
import serviceV2Scanned from '../../../fixtures/service-agreement-v2-scanned.pdf?url';
import type { Lang } from './i18n';
import { text } from './i18n';

export interface Sample {
  id: string;
  label: string;
  load(): Promise<[File, File]>;
}

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/** Bundled fixtures are fetched from the app's own origin (or inlined data: URLs in the single-file build). */
async function file(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load sample ${name} (${res.status})`);
  const ext = name.split('.').pop() ?? '';
  return new File([await res.blob()], name, { type: MIME[ext] ?? '' });
}

const pair = (a: [string, string], b: [string, string]) => (): Promise<[File, File]> =>
  Promise.all([file(a[0], a[1]), file(b[0], b[1])]);

export function samples(lang: Lang): Sample[] {
  const t = text[lang];
  return [
    {
      id: 'service-docx',
      label: t.serviceDocx,
      load: pair([serviceV1Docx, 'service-agreement-v1.docx'], [serviceV2Docx, 'service-agreement-v2.docx']),
    },
    {
      id: 'service-pdf',
      label: t.servicePdf,
      load: pair([serviceV1Pdf, 'service-agreement-v1.pdf'], [serviceV2Pdf, 'service-agreement-v2.pdf']),
    },
    {
      id: 'service-mixed',
      label: t.serviceMixed,
      load: pair([serviceV1Docx, 'service-agreement-v1.docx'], [serviceV2Pdf, 'service-agreement-v2.pdf']),
    },
    {
      // Image-only scan: the revised side is read with in-browser OCR.
      id: 'service-scanned',
      label: t.serviceScanned,
      load: pair([serviceV1Docx, 'service-agreement-v1.docx'], [serviceV2Scanned, 'service-agreement-v2-scanned.pdf']),
    },
    {
      // Searchable scan: an OCR text layer is already present; scanning mistakes are flagged, not hidden.
      id: 'service-ocr-layer',
      label: t.serviceOcrLayer,
      load: pair([serviceV1Docx, 'service-agreement-v1.docx'], [serviceV2Ocr, 'service-agreement-v2-ocr.pdf']),
    },
    {
      id: 'nda-docx',
      label: t.ndaDocx,
      load: pair([ndaV1Docx, 'bilingual-nda-v1.docx'], [ndaV2Docx, 'bilingual-nda-v2.docx']),
    },
    {
      id: 'nda-pdf',
      label: t.ndaPdf,
      load: pair([ndaV1Pdf, 'bilingual-nda-v1.pdf'], [ndaV2Pdf, 'bilingual-nda-v2.pdf']),
    },
  ];
}
