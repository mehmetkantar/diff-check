import { defaultProfile, type Profile } from './profile';
import type { Edit, Flag } from './types';

interface FlagMatchers {
  words: RegExp | null;
  negation: RegExp | null;
}
const cache = new WeakMap<Profile, FlagMatchers>();

function matchersFor(p: Profile): FlagMatchers {
  let m = cache.get(p);
  if (!m) {
    m = {
      words: p.legalWords.length ? new RegExp(`(^|[^\\p{L}])(${p.legalWords.join('|')})(?=$|[^\\p{L}])`, 'iu') : null,
      negation: p.negations.length ? new RegExp(p.negations.join('|'), 'iu') : null,
    };
    cache.set(p, m);
  }
  return m;
}

/** Flags edits a reviewer should not skim past: figures and obligation wording. */
export function flagsOf(edits: Edit[], profile: Profile = defaultProfile): Flag[] {
  const { words, negation } = matchersFor(profile);
  const flags = new Set<Flag>();
  for (const e of edits) {
    const raw = `${e.before} ${e.after}`;
    const lower = raw.toLocaleLowerCase('tr');
    if (/\p{N}/u.test(raw) || /%|\bTL\b|USD|EUR|GBP|€|\$|₺|£/u.test(raw)) flags.add('number');
    if (profile.legalStems.some((s) => lower.includes(s)) || words?.test(raw)) flags.add('legal');
    if (negation && negation.test(e.before) !== negation.test(e.after)) flags.add('legal');
  }
  return [...flags];
}
