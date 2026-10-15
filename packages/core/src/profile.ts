/**
 * A profile holds the language- and jurisdiction-specific knowledge the engine
 * uses: how clause headings are introduced, which words signal a change in
 * obligations, and which function words stay lower-case in titles.
 *
 * Profiles are plain data so a host product can add its own (German "§",
 * French "Article", internal numbering schemes) without touching the engine.
 */
export interface Profile {
  /** Words that introduce an article or section heading: "MADDE 7", "Article 7", "§ 7" */
  articleWords: string[];
  /** Lower-case stems; a changed word containing one is flagged as legal wording */
  legalStems: string[];
  /** Whole words (case-insensitive); a changed word equal to one is flagged as legal wording */
  legalWords: string[];
  /** Function words kept lower-case when an ALL-CAPS heading is title-cased */
  smallWords: string[];
  /** Regex sources for negation/inability markers; toggling one flags the edit */
  negations: string[];
}

export const turkish: Profile = {
  articleWords: ['MADDE', 'Madde', 'BÖLÜM', 'Bölüm', 'KISIM', 'Kısım', 'Md.'],
  legalStems: [
    'yükümlü', 'zorunda', 'zorunlu', 'mecbur', 'edebilir', 'edemez', 'olabilir', 'olamaz', 'yapabilir', 'yapamaz',
    'değil', 'hariç', 'dahil', 'münhasır', 'sorumlu', 'tazmin', 'cezai', 'fesih', 'feshed', 'derhal', 'makul',
    'yazılı', 'kaydıyla', 'şartıyla', 'koşuluyla', 'ancak', 'asgari', 'azami', 'en az', 'en fazla', 'süresiz',
    'gizli', 'devred', 'garanti', 'teminat', 'faiz', 'yetkili', 'mahkeme', 'tahkim', 'uygulanmaz', 'sınırsız', 'esas alınır',
  ],
  legalWords: [],
  smallWords: ['ve', 'ile', 'veya', 'ya', 'da', 'de', 'için', 'ki', 'bir'],
  // -mayacak/-meyecek, -maz/-mez, -mamak/-memek, -sız/-siz/-suz/-süz
  negations: ['m[ae]y[ae]c[ae]k', 'm[ae]z\\b', 'm[ae]m[ae]k', 's[ıiuü]z\\b'],
};

export const english: Profile = {
  articleWords: ['ARTICLE', 'Article', 'SECTION', 'Section', 'CLAUSE', 'Clause', 'SCHEDULE', 'Schedule', '§'],
  legalStems: ['indemn', 'terminat', 'warrant', 'arbitrat', 'penalt', 'prevail', 'liabilit'],
  legalWords: [
    'shall', 'must', 'may', 'not', 'liable', 'exclusive', 'reasonable', 'written', 'unless', 'except',
    'court', 'only', 'immediately', 'without', 'no', 'never', 'sole',
  ],
  smallWords: ['and', 'or', 'of', 'the', 'to', 'in', 'for', 'a', 'an', 'on', 'by'],
  negations: ['\\bnot\\b', '\\bno\\b', "n't\\b", '\\bwithout\\b'],
};

export function mergeProfiles(...ps: Profile[]): Profile {
  const u = (k: keyof Profile) => [...new Set(ps.flatMap((p) => p[k]))];
  return {
    articleWords: u('articleWords'),
    legalStems: u('legalStems'),
    legalWords: u('legalWords'),
    smallWords: u('smallWords'),
    negations: u('negations'),
  };
}

/** Default: Turkish and English, the two languages of the bundled bilingual fixtures. */
export const defaultProfile: Profile = mergeProfiles(turkish, english);
