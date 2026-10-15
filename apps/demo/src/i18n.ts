// Strings that belong to the demo app itself. The viewer's own strings come from @redline/core locales.
export type Lang = 'en' | 'tr';

export const text = {
  en: {
    serviceDocx: 'Service agreement, Word',
    servicePdf: 'Service agreement, PDF',
    serviceMixed: 'Service agreement, Word against PDF',
    serviceScanned: 'Service agreement, Word against scanned PDF (OCR)',
    serviceOcrLayer: 'Service agreement, Word against OCR’d PDF',
    ndaDocx: 'Bilingual NDA (TR | EN), Word',
    ndaPdf: 'Bilingual NDA (TR | EN), PDF',
    languageName: 'English',
    switchLanguage: 'Switch the interface to English',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
  },
  tr: {
    serviceDocx: 'Hizmet sözleşmesi, Word',
    servicePdf: 'Hizmet sözleşmesi, PDF',
    serviceMixed: 'Hizmet sözleşmesi, Word ile PDF',
    serviceScanned: 'Hizmet sözleşmesi, Word ile taranmış PDF (OCR)',
    serviceOcrLayer: 'Hizmet sözleşmesi, Word ile OCR’lı PDF',
    ndaDocx: 'İki dilli gizlilik sözleşmesi (TR | EN), Word',
    ndaPdf: 'İki dilli gizlilik sözleşmesi (TR | EN), PDF',
    languageName: 'Türkçe',
    switchLanguage: 'Arayüzü Türkçeye çevir',
    theme: 'Tema',
    light: 'Açık',
    dark: 'Koyu',
  },
} satisfies Record<Lang, Record<string, string>>;
