// Chrome ignores @font-face rules inside shadow roots, so the fonts are registered on the
// document once. Only the Latin and Latin Extended subsets are bundled (Turkish, English and
// most European languages); they are inlined into the bundle, so nothing is fetched.
import geistLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url';
import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import monoLatinExt from '@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2?url';
import monoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url';
import serifLatinExt from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-wght-normal.woff2?url';
import serifLatin from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const face = (family: string, weight: string, url: string, range: string) =>
  `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(${url}) format('woff2-variations');unicode-range:${range}}`;

const CSS = [
  face('Geist Variable', '100 900', geistLatin, LATIN),
  face('Geist Variable', '100 900', geistLatinExt, LATIN_EXT),
  face('Geist Mono Variable', '100 900', monoLatin, LATIN),
  face('Geist Mono Variable', '100 900', monoLatinExt, LATIN_EXT),
  face('Source Serif 4 Variable', '200 900', serifLatin, LATIN),
  face('Source Serif 4 Variable', '200 900', serifLatinExt, LATIN_EXT),
].join('\n');

export function ensureFonts() {
  if (typeof document === 'undefined' || document.querySelector('style[data-redline-fonts]')) return;
  const style = document.createElement('style');
  style.dataset.redlineFonts = '';
  style.textContent = CSS;
  document.head.appendChild(style);
}
