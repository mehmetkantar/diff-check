import { parseDocx } from './docx';
import { parsePdf } from './pdf';
import { parseText } from './text';
import type { DocumentParser } from './registry';

export const pdfParser: DocumentParser = {
  kind: 'pdf',
  extensions: ['pdf'],
  detect: (head) => head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46, // %PDF
  parse: parsePdf,
};

export const docxParser: DocumentParser = {
  kind: 'docx',
  extensions: ['docx'],
  // A zip that is not another Office/ODF format by name; parseDocx validates the content.
  detect: (head, name) => head[0] === 0x50 && head[1] === 0x4b && !/\.(xlsx|pptx|odt|ods|zip)$/i.test(name),
  parse: parseDocx,
};

export const textParser: DocumentParser = {
  kind: 'text',
  extensions: ['txt', 'md'],
  detect: (_head, name) => /\.(txt|md|markdown)$/i.test(name),
  parse: parseText,
};
