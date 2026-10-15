/**
 * redline: compare two documents from the command line or a server job.
 *
 *   redline original.docx revised.pdf                    # change list on stdout
 *   redline a.docx b.docx --format json > changes.json
 *   redline a.pdf b.pdf --format html --out report.html --lang tr
 *   redline a.docx b.docx --format docx --out redline.docx
 *
 * Exit code: 0 identical, 1 differences found, 2 error (handy in CI and batch jobs).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import {
  compareDocs, describeChange, isParseError, parseDocument, placeLabel, resolveLocale, toCSV, toHTMLReport, toJSON, toTrackedDocx,
} from './index';
import { createTesseractCliOcr } from './ocr/tesseract-cli';

const HELP = `Usage: redline <original> <revised> [options]

Options:
  --format text|json|csv|html|docx   Output format (default: text)
  --out <file>                       Write to a file instead of stdout (required for docx)
  --lang en|tr                       Language of descriptions (default: en)
  --ignore-case                      Ignore upper/lower case differences
  --ignore-punctuation               Ignore punctuation differences
  --no-moves                         Do not detect moved text
  --renumbering                      Report clause renumbering
  --ocr                              OCR scanned pages without a text layer (needs tesseract and pdftoppm on PATH)
  -h, --help                         Show this help
`;

async function main() {
  const args = argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    stdout.write(HELP);
    return 0;
  }
  const flag = (name: string) => args.includes(name);
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const files = args.filter((a, i) => !a.startsWith('--') && !['--format', '--out', '--lang'].includes(args[i - 1]));
  if (files.length !== 2) {
    stderr.write(`Expected two files.\n\n${HELP}`);
    return 2;
  }
  const m = resolveLocale(value('--lang') ?? 'en');
  const format = value('--format') ?? 'text';
  const out = value('--out');

  const ocr = flag('--ocr') ? createTesseractCliOcr() : undefined;
  const load = async (path: string) =>
    parseDocument(
      { name: basename(path), bytes: new Uint8Array(await readFile(path)) },
      { ocr, onProgress: (p) => p.phase === 'ocr' && stderr.write(`OCR ${basename(path)}: ${p.page}/${p.pages}\r`) },
    );
  const a = await load(files[0]);
  const b = await load(files[1]);
  await ocr?.dispose?.();
  for (const d of [a, b]) for (const w of d.warnings) stderr.write(`${d.name} ${m.warning[w]}\n`);
  const cmp = compareDocs(a, b, {
    ignoreCase: flag('--ignore-case'),
    ignorePunctuation: flag('--ignore-punctuation'),
    detectMoves: !flag('--no-moves'),
    showRenumbering: flag('--renumbering'),
  });

  let result: string | Uint8Array;
  switch (format) {
    case 'json':
      result = `${JSON.stringify(toJSON(cmp, m), null, 2)}\n`;
      break;
    case 'csv':
      result = toCSV(cmp, m);
      break;
    case 'html':
      result = toHTMLReport(cmp, m);
      break;
    case 'docx':
      if (!out) {
        stderr.write('--format docx needs --out <file>\n');
        return 2;
      }
      result = new Uint8Array(await toTrackedDocx(cmp, m));
      break;
    default:
      result = `${cmp.changes
        .map((c) => {
          const where = [placeLabel(c.locL, m), placeLabel(c.locR, m)].filter(Boolean);
          const place = where.length === 2 && where[0] === where[1] ? where[0] : where.join(' -> ');
          return `${String(c.n).padStart(3)}  ${m.type[c.type].padEnd(11)} ${place.padEnd(22)} ${describeChange(c, m)}${c.flags.length ? `  [${c.flags.map((f) => m.flag[f]).join(', ')}]` : ''}`;
        })
        .join('\n')}\n\n${m.list.count(cmp.stats.total)}\n`;
  }
  if (out) await writeFile(out, result);
  else stdout.write(result);
  return cmp.changes.length ? 1 : 0;
}

main().then(
  (code) => exit(code),
  (e) => {
    stderr.write(`${isParseError(e) ? resolveLocale('en').error[e.code] : String(e?.stack ?? e)}\n`);
    exit(2);
  },
);
