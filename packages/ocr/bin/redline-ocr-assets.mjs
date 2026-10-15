#!/usr/bin/env node
// Copies the files @redline/ocr needs at runtime into a folder your web server serves:
//
//   npx redline-ocr-assets public/ocr                 # Turkish + English
//   npx redline-ocr-assets public/ocr --langs tur,eng,deu
//   npx redline-ocr-assets public/ocr --all-cores     # also the non-LSTM engine builds
//
// Result:
//   <target>/worker.min.js
//   <target>/core/tesseract-core-*.wasm.js   (picked at runtime by WebAssembly SIMD support)
//   <target>/lang/<lang>.traineddata.gz
//
// Language data comes from the @tesseract.js-data/<lang> packages; install any extra language you list.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** Source and destination (relative to the target folder) of every runtime file. */
export function ocrAssets({ langs = ['tur', 'eng'], allCores = false } = {}) {
  const tess = dirname(require.resolve('tesseract.js/package.json'));
  const core = dirname(createRequire(join(tess, 'package.json')).resolve('tesseract.js-core/package.json'));
  // The provider always uses the LSTM engine, which only needs the *-lstm builds.
  const coreFiles = readdirSync(core).filter((f) => /^tesseract-core.*\.wasm\.js$/.test(f) && (allCores || f.includes('-lstm')));
  const files = [{ from: join(tess, 'dist', 'worker.min.js'), to: 'worker.min.js' }, ...coreFiles.map((f) => ({ from: join(core, f), to: join('core', f) }))];
  for (const lang of langs) {
    let pkg;
    try {
      pkg = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    } catch {
      throw new Error(`Language data for "${lang}" is not installed. Run: npm install @tesseract.js-data/${lang}`);
    }
    files.push({ from: join(pkg, '4.0.0_best_int', `${lang}.traineddata.gz`), to: join('lang', `${lang}.traineddata.gz`) });
  }
  return files;
}

export function copyOcrAssets(target, options) {
  const files = ocrAssets(options);
  for (const f of files) {
    const to = resolve(target, f.to);
    mkdirSync(dirname(to), { recursive: true });
    if (!existsSync(f.from)) throw new Error(`Missing ${f.from}`);
    copyFileSync(f.from, to);
  }
  return files.map((f) => f.to);
}

if (argv[1] && import.meta.url === pathToFileURL(resolve(argv[1])).href) {
  const args = argv.slice(2);
  const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--langs');
  if (!target) {
    stderr.write('Usage: redline-ocr-assets <targetDir> [--langs tur,eng] [--all-cores]\n');
    exit(2);
  }
  const li = args.indexOf('--langs');
  try {
    const copied = copyOcrAssets(target, { langs: li >= 0 ? args[li + 1].split(',') : undefined, allCores: args.includes('--all-cores') });
    stdout.write(`Copied ${copied.length} OCR files to ${target}\n`);
  } catch (e) {
    stderr.write(`${e.message}\n`);
    exit(1);
  }
}
