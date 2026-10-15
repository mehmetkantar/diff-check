// Generates the fixture documents used by tests and the demo:
//   service-agreement-v1/v2  Turkish service agreement (articles, auto-numbered list, table, a moved article)
//   bilingual-nda-v1/v2      Turkish | English NDA in two columns, including one-sided (unmirrored) edits
//   service-agreement-v2-scanned/-ocr  the revised agreement as an image-only scan, and as a searchable scan
// PDF copies are produced with LibreOffice when it is installed; the scans need pdftoppm, tesseract,
// ghostscript and an image-to-PDF tool (sips on macOS, or img2pdf).
// Usage: npm run fixtures
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AlignmentType, Document, Footer, Header, LevelFormat, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  HeadingLevel,
} from 'docx';

const OUT = join(import.meta.dirname, '..', 'fixtures');
mkdirSync(OUT, { recursive: true });

const TITLE = 'YAZILIM GELİŞTİRME VE BAKIM HİZMET SÖZLEŞMESİ';

const v1 = [
  ['h', 'MADDE 1 - TARAFLAR'],
  ['p', '1.1. İşbu Sözleşme, merkezi Maslak Mahallesi, Büyükdere Caddesi No: 255, Sarıyer/İstanbul adresinde bulunan Lacivert Lojistik Anonim Şirketi (“Müşteri”) ile merkezi Mustafa Kemal Mahallesi, Dumlupınar Bulvarı No: 266, Çankaya/Ankara adresinde bulunan Kuzeybatı Yazılım Teknolojileri Limited Şirketi (“Yüklenici”) arasında aşağıdaki şartlarla akdedilmiştir.'],
  ['p', '1.2. Müşteri ve Yüklenici, işbu Sözleşme’de ayrı ayrı “Taraf”, birlikte “Taraflar” olarak anılacaktır.'],
  ['h', 'MADDE 2 - TANIMLAR'],
  ['p', '2.1. “Yazılım”: Yüklenici tarafından Müşteri için geliştirilecek olan filo takip ve rota optimizasyon platformunu ifade eder.'],
  ['p', '2.2. “Teslim Tarihi”: Yazılım’ın kabul testlerinden geçmiş hâliyle Müşteri’ye teslim edileceği tarihi ifade eder.'],
  ['p', '2.3. “Hizmet Seviyesi”: Ek-1’de belirtilen erişilebilirlik ve müdahale sürelerini ifade eder.'],
  ['h', 'MADDE 3 - SÖZLEŞMENİN KONUSU'],
  ['p', '3.1. İşbu Sözleşme’nin konusu, Yazılım’ın geliştirilmesi, kurulumu ve Sözleşme süresince bakım ve destek hizmetlerinin verilmesine ilişkin Tarafların hak ve yükümlülüklerinin belirlenmesidir.'],
  ['h', 'MADDE 4 - SÜRE'],
  ['p', '4.1. İşbu Sözleşme imza tarihinde yürürlüğe girer ve 12 (on iki) ay süreyle geçerlidir.'],
  ['p', '4.2. Taraflardan biri süre bitiminden en az 30 (otuz) gün önce yazılı olarak bildirimde bulunmadıkça Sözleşme aynı şartlarla 1 (bir) yıl uzar.'],
  ['h', 'MADDE 5 - ÜCRET VE ÖDEME'],
  ['p', '5.1. Müşteri, Yazılım’ın geliştirilmesi karşılığında Yüklenici’ye toplam 1.250.000,00 TL (bir milyon iki yüz elli bin Türk Lirası) ödeyecektir.'],
  ['p', '5.2. Ödemeler, aşağıdaki takvime göre faturanın tebliğinden itibaren 30 (otuz) gün içinde yapılacaktır.'],
  ['table', [['Aşama', 'Oran', 'Tutar'], ['Sözleşmenin imzalanması', '%30', '375.000,00 TL'], ['Prototipin kabulü', '%30', '375.000,00 TL'], ['Nihai teslim ve kabul', '%40', '500.000,00 TL']]],
  ['p', '5.3. Bakım ve destek hizmetleri için Müşteri, Yüklenici’ye her ay 42.000,00 TL ücret öder.'],
  ['h', 'MADDE 6 - YÜKLENİCİNİN YÜKÜMLÜLÜKLERİ'],
  ['p', '6.1. Yüklenici, Yazılım’ı Teslim Tarihi’ne kadar eksiksiz ve çalışır şekilde teslim etmek için makul çabayı gösterecektir.'],
  ['p', '6.2. Yüklenici, Hizmet Seviyesi’ne uygun bakım ve destek hizmeti verecektir. Kritik hatalara müdahale süresi 8 (sekiz) saattir.'],
  ['p', '6.3. Yüklenici, Müşteri’nin yazılı onayı olmaksızın Sözleşme konusu işi kısmen veya tamamen üçüncü kişilere devredemez.'],
  ['h', 'MADDE 7 - GİZLİLİK'],
  ['p', '7.1. Taraflar, işbu Sözleşme kapsamında öğrendikleri ticari sır niteliğindeki tüm bilgileri gizli tutmayı ve üçüncü kişilerle paylaşmamayı kabul eder.'],
  ['p', '7.2. Gizlilik yükümlülüğü, Sözleşme’nin herhangi bir sebeple sona ermesinden itibaren 2 (iki) yıl süreyle devam eder.'],
  ['p', '7.3. Kanunen yetkili makamların talebi üzerine yapılan açıklamalar bu madde kapsamında değildir.'],
  ['h', 'MADDE 8 - FİKRİ MÜLKİYET HAKLARI'],
  ['p', '8.1. Yazılım’a ilişkin tüm fikri mülkiyet hakları, bedelin tamamen ödenmesiyle birlikte Müşteri’ye geçer.'],
  ['p', '8.2. Yüklenici, Yazılım’da kullandığı kendisine ait hazır bileşenler üzerindeki haklarını saklı tutar.'],
  ['h', 'MADDE 9 - FESİH'],
  ['p', '9.1. Taraflardan biri Sözleşme’ye aykırı davranır ve bu aykırılığı yazılı ihtardan itibaren 15 (on beş) gün içinde gidermezse, diğer Taraf Sözleşme’yi derhal feshedebilir.'],
  ['p', '9.2. Fesih hâlinde:'],
  ['li', 'fesih', 'Müşteri, fesih tarihine kadar tamamlanmış işlerin bedelini öder;'],
  ['li', 'fesih', 'Yüklenici, o tarihe kadar geliştirilen kaynak kodlarını Müşteri’ye teslim eder;'],
  ['li', 'fesih', 'Taraflar, birbirlerine ait belge ve verileri iade eder.'],
  ['p', '9.3. Taraflardan her biri, 60 (altmış) gün önceden yazılı bildirimde bulunmak kaydıyla Sözleşme’yi herhangi bir sebep göstermeksizin feshedebilir.'],
  ['h', 'MADDE 10 - CEZAİ ŞART'],
  ['p', '10.1. Yüklenici’nin Teslim Tarihi’ni aşması hâlinde, gecikilen her gün için Sözleşme bedelinin binde 1 (bir) oranında cezai şart uygulanır.'],
  ['p', '10.2. Cezai şartın toplam tutarı Sözleşme bedelinin %10’unu (yüzde on) geçemez.'],
  ['h', 'MADDE 11 - UYUŞMAZLIKLARIN ÇÖZÜMÜ'],
  ['p', '11.1. İşbu Sözleşme’den doğacak uyuşmazlıkların çözümünde İstanbul (Çağlayan) Mahkemeleri ve İcra Daireleri yetkilidir.'],
  ['h', 'MADDE 12 - YÜRÜRLÜK'],
  ['p', '12.1. İşbu 12 (on iki) maddeden ibaret Sözleşme, Taraflarca okunarak 15.01.2026 tarihinde iki nüsha olarak imzalanmıştır.'],
];

const v2 = [
  ['h', 'MADDE 1 - TARAFLAR'],
  ['p', '1.1. İşbu Sözleşme, merkezi Maslak Mahallesi, Büyükdere Caddesi No: 199, Sarıyer/İstanbul adresinde bulunan Lacivert Lojistik Anonim Şirketi (“Müşteri”) ile merkezi Mustafa Kemal Mahallesi, Dumlupınar Bulvarı No: 266, Çankaya/Ankara adresinde bulunan Kuzeybatı Yazılım Teknolojileri Limited Şirketi (“Yüklenici”) arasında aşağıdaki şartlarla akdedilmiştir.'],
  ['p', '1.2. Müşteri ve Yüklenici, işbu Sözleşme’de ayrı ayrı “Taraf”, birlikte “Taraflar” olarak anılacaktır.'],
  ['h', 'MADDE 2 - TANIMLAR'],
  ['p', '2.1. “Yazılım”: Yüklenici tarafından Müşteri için geliştirilecek olan filo takip ve rota optimizasyon platformunu ifade eder.'],
  ['p', '2.2. “Teslim Tarihi”: Yazılım’ın kabul testlerinden geçmiş hâliyle Müşteri’ye teslim edileceği tarihi ifade eder.'],
  ['p', '2.3. “Hizmet Seviyesi”: Ek-1’de belirtilen erişilebilirlik ve müdahale sürelerini ifade eder.'],
  ['p', '2.4. “Kişisel Veri”: 6698 sayılı Kişisel Verilerin Korunması Kanunu’nda tanımlanan, kimliği belirli veya belirlenebilir gerçek kişiye ilişkin her türlü bilgiyi ifade eder.'],
  ['h', 'MADDE 3 - SÖZLEŞMENİN KONUSU'],
  ['p', '3.1. İşbu Sözleşme’nin konusu, Yazılım’ın geliştirilmesi, kurulumu ve Sözleşme süresince bakım ve destek hizmetlerinin verilmesine ilişkin Tarafların hak ve yükümlülüklerinin belirlenmesidir.'],
  ['p', '3.2. Yüklenici, Müşteri’nin önceden yazılı onayı olmaksızın Sözleşme konusu işi kısmen veya tamamen üçüncü kişilere devredemez.'],
  ['h', 'MADDE 4 - SÜRE'],
  ['p', '4.1. İşbu Sözleşme imza tarihinde yürürlüğe girer ve 24 (yirmi dört) ay süreyle geçerlidir.'],
  ['p', '4.2. Taraflardan biri süre bitiminden en az 60 (altmış) gün önce yazılı olarak bildirimde bulunmadıkça Sözleşme aynı şartlarla 1 (bir) yıl uzar.'],
  ['h', 'MADDE 5 - ÜCRET VE ÖDEME'],
  ['p', '5.1. Müşteri, Yazılım’ın geliştirilmesi karşılığında Yüklenici’ye toplam 1.400.000,00 TL + KDV (bir milyon dört yüz bin Türk Lirası) ödeyecektir.'],
  ['p', '5.2. Ödemeler, aşağıdaki takvime göre faturanın tebliğinden itibaren 45 (kırk beş) gün içinde yapılacaktır.'],
  ['table', [['Aşama', 'Oran', 'Tutar'], ['Sözleşmenin imzalanması', '%20', '280.000,00 TL'], ['Prototipin kabulü', '%30', '420.000,00 TL'], ['Nihai teslim ve kabul', '%50', '700.000,00 TL']]],
  ['p', '5.3. Bakım ve destek hizmetleri için Müşteri, Yüklenici’ye her ay 48.500,00 TL ücret öder.'],
  ['p', '5.4. Vadesinde ödenmeyen tutarlara, vade tarihinden itibaren yıllık %24 oranında gecikme faizi uygulanır.'],
  ['h', 'MADDE 6 - YÜKLENİCİNİN YÜKÜMLÜLÜKLERİ'],
  ['p', '6.1. Yüklenici, Yazılım’ı Teslim Tarihi’ne kadar eksiksiz ve çalışır şekilde teslim etmekle yükümlüdür.'],
  ['p', '6.2. Yüklenici, Hizmet Seviyesi’ne uygun bakım ve destek hizmeti verecektir. Kritik hatalara müdahale süresi 4 (dört) saattir.'],
  ['h', 'MADDE 7 - FİKRİ MÜLKİYET HAKLARI'],
  ['p', '7.1. Yazılım’a ilişkin tüm fikri mülkiyet hakları, bedelin tamamen ödenmesiyle birlikte Müşteri’ye geçer.'],
  ['p', '7.2. Yüklenici, Yazılım’da kullandığı kendisine ait hazır bileşenler üzerindeki haklarını saklı tutar.'],
  ['h', 'MADDE 8 - FESİH'],
  ['p', '8.1. Taraflardan biri Sözleşme’ye aykırı davranır ve bu aykırılığı yazılı ihtardan itibaren 15 (on beş) gün içinde gidermezse, diğer Taraf Sözleşme’yi derhal feshedebilir.'],
  ['p', '8.2. Fesih hâlinde:'],
  ['li', 'fesih', 'Müşteri, fesih tarihine kadar tamamlanmış işlerin bedelini öder;'],
  ['li', 'fesih', 'Yüklenici, o tarihe kadar geliştirilen kaynak kodlarını ve teknik dokümantasyonu 10 (on) gün içinde Müşteri’ye teslim eder;'],
  ['li', 'fesih', 'Taraflar, birbirlerine ait belge ve verileri iade eder;'],
  ['li', 'fesih', 'Yüklenici, Müşteri verilerini iade ettikten sonra kendi sistemlerinden kalıcı olarak siler.'],
  ['h', 'MADDE 9 - GİZLİLİK'],
  ['p', '9.1. Taraflar, işbu Sözleşme kapsamında öğrendikleri ticari sır niteliğindeki tüm bilgileri gizli tutmayı ve üçüncü kişilerle paylaşmamayı kabul eder.'],
  ['p', '9.2. Gizlilik yükümlülüğü, Sözleşme’nin herhangi bir sebeple sona ermesinden itibaren 5 (beş) yıl süreyle devam eder.'],
  ['p', '9.3. Kanunen yetkili makamların talebi üzerine yapılan açıklamalar bu madde kapsamında değildir.'],
  ['h', 'MADDE 10 - KİŞİSEL VERİLERİN KORUNMASI'],
  ['p', '10.1. Yüklenici, Sözleşme kapsamında eriştiği Kişisel Verileri yalnızca Müşteri’nin talimatları doğrultusunda ve 6698 sayılı Kanun’a uygun olarak işler.'],
  ['p', '10.2. Yüklenici, Kişisel Verilere yetkisiz erişimi öğrenmesi hâlinde durumu 24 (yirmi dört) saat içinde Müşteri’ye yazılı olarak bildirir.'],
  ['h', 'MADDE 11 - CEZAİ ŞART'],
  ['p', '11.1. Yüklenici’nin Teslim Tarihi’ni aşması hâlinde, gecikilen her gün için Sözleşme bedelinin binde 1 (bir) oranında cezai şart uygulanır.'],
  ['p', '11.2. Cezai şartın toplam tutarı Sözleşme bedelinin %15’ini (yüzde on beş) geçemez.'],
  ['h', 'MADDE 12 - UYUŞMAZLIKLARIN ÇÖZÜMÜ'],
  ['p', '12.1. İşbu Sözleşme’den doğacak uyuşmazlıkların çözümünde İstanbul Anadolu Mahkemeleri ve İcra Daireleri yetkilidir.'],
  ['h', 'MADDE 13 - YÜRÜRLÜK'],
  ['p', '13.1. İşbu 13 (on üç) maddeden ibaret Sözleşme, Taraflarca okunarak 02.03.2026 tarihinde iki nüsha olarak imzalanmıştır.'],
];

const FONT = 'Times New Roman';

function buildServiceAgreement(items, version) {
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: TITLE, bold: true, size: 28, font: FONT })] }),
  ];
  for (const it of items) {
    if (it[0] === 'h') {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: it[1] })] }));
    } else if (it[0] === 'p') {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 }, children: [new TextRun(it[1])] }));
    } else if (it[0] === 'li') {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 80 },
        numbering: { reference: 'harf', level: 0, instance: 1 },
        children: [new TextRun(it[2])],
      }));
    } else if (it[0] === 'table') {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: it[1].map((cells, ri) => new TableRow({
          children: cells.map((c) => new TableCell({
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })],
          })),
        })),
      }));
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }
  children.push(new Paragraph({ spacing: { before: 480 }, children: [] }));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: 'none' }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' }, insideHorizontal: { style: 'none' }, insideVertical: { style: 'none' } },
    rows: [new TableRow({
      children: ['MÜŞTERİ', 'YÜKLENİCİ'].map((t) => new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: true })] })],
      })),
    })],
  }));

  return new Document({
    creator: 'Redline fixtures',
    title: `${TITLE} (${version})`,
    styles: {
      default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 23, bold: true, color: '111111' },
          paragraph: { spacing: { before: 300, after: 120 }, keepNext: true },
        },
      ],
    },
    numbering: {
      config: [{
        reference: 'harf',
        levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: '(%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 420 } } } }],
      }],
    },
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 1300, left: 1400, right: 1400 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Lacivert Lojistik A.Ş. ile Kuzeybatı Yazılım Ltd. Şti. Hizmet Sözleşmesi, ${version}`, size: 16, color: '666666' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Sayfa ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: '666666' })] })] }) },
      children,
    }],
  });
}

// ---- Bilingual NDA: one table row per clause, Turkish left, English right ----

const NDA_TITLE = ['GİZLİLİK SÖZLEŞMESİ', 'NON-DISCLOSURE AGREEMENT'];

const nda1 = [
  ['h', 'MADDE 1 - TARAFLAR', 'ARTICLE 1 - PARTIES'],
  ['p', '1.1. İşbu Gizlilik Sözleşmesi (“Sözleşme”), Lacivert Lojistik Anonim Şirketi (“Açıklayan Taraf”) ile Kuzeybatı Yazılım Teknolojileri Limited Şirketi (“Alıcı Taraf”) arasında akdedilmiştir.', '1.1. This Non-Disclosure Agreement (the “Agreement”) is entered into by and between Lacivert Lojistik Anonim Şirketi (the “Disclosing Party”) and Kuzeybatı Yazılım Teknolojileri Limited Şirketi (the “Receiving Party”).'],
  ['h', 'MADDE 2 - GİZLİ BİLGİ', 'ARTICLE 2 - CONFIDENTIAL INFORMATION'],
  ['p', '2.1. Gizli Bilgi; ticari, mali ve teknik bilgiler, müşteri listeleri, kaynak kodları ve Açıklayan Taraf’ça gizli olarak nitelendirilen her türlü bilgiyi kapsar.', '2.1. Confidential Information includes commercial, financial and technical information, customer lists, source code and any information designated as confidential by the Disclosing Party.'],
  ['p', '2.2. Gizli Bilgi, yazılı, sözlü veya elektronik ortamda paylaşılmış olmasına bakılmaksızın bu Sözleşme kapsamındadır.', '2.2. Confidential Information is covered by this Agreement regardless of whether it is disclosed in writing, orally or electronically.'],
  ['h', 'MADDE 3 - YÜKÜMLÜLÜKLER', 'ARTICLE 3 - OBLIGATIONS'],
  ['p', '3.1. Alıcı Taraf, Gizli Bilgiyi yalnızca taraflar arasındaki iş ilişkisinin değerlendirilmesi amacıyla kullanacaktır.', '3.1. The Receiving Party shall use the Confidential Information solely for the purpose of evaluating the business relationship between the parties.'],
  ['p', '3.2. Alıcı Taraf, Gizli Bilgiyi makul özeni göstererek korur ve yalnızca bilmesi gereken çalışanlarıyla paylaşabilir.', '3.2. The Receiving Party shall protect the Confidential Information with reasonable care and may share it only with employees who need to know it.'],
  ['h', 'MADDE 4 - İSTİSNALAR', 'ARTICLE 4 - EXCEPTIONS'],
  ['p', '4.1. Kamuya açık olan veya Alıcı Taraf’ın Sözleşme öncesinde hukuka uygun olarak edindiği bilgiler Gizli Bilgi sayılmaz.', '4.1. Information that is publicly available or lawfully obtained by the Receiving Party before this Agreement is not Confidential Information.'],
  ['h', 'MADDE 5 - SÜRE', 'ARTICLE 5 - TERM'],
  ['p', '5.1. İşbu Sözleşme imza tarihinde yürürlüğe girer ve 2 (iki) yıl süreyle geçerlidir.', '5.1. This Agreement enters into force on the date of signature and remains in effect for 2 (two) years.'],
  ['h', 'MADDE 6 - CEZAİ ŞART', 'ARTICLE 6 - PENALTY'],
  ['p', '6.1. Alıcı Taraf’ın bu Sözleşme’ye aykırı davranması hâlinde, Açıklayan Taraf’a 500.000,00 TL cezai şart ödenir.', '6.1. If the Receiving Party breaches this Agreement, it shall pay the Disclosing Party a penalty of TRY 500,000.00.'],
  ['h', 'MADDE 7 - BİLGİLERİN İADESİ', 'ARTICLE 7 - RETURN OF INFORMATION'],
  ['p', '7.1. Sözleşme’nin sona ermesi hâlinde Alıcı Taraf, Gizli Bilgiyi içeren tüm belgeleri 15 (on beş) gün içinde iade eder.', '7.1. Upon termination of this Agreement, the Receiving Party shall return all documents containing Confidential Information within 15 (fifteen) days.'],
  ['h', 'MADDE 8 - UYGULANACAK HUKUK VE YETKİ', 'ARTICLE 8 - GOVERNING LAW AND JURISDICTION'],
  ['p', '8.1. İşbu Sözleşme Türk hukukuna tabidir. Uyuşmazlıklarda İstanbul Merkez (Çağlayan) Mahkemeleri ve İcra Daireleri yetkilidir.', '8.1. This Agreement is governed by Turkish law. The Courts and Enforcement Offices of Istanbul Central (Çağlayan) have jurisdiction over any dispute.'],
];

// Revised draft. Edits are mirrored in both languages except two deliberate slips:
// the penalty changed only in Turkish (6.1 -> 5.1) and the return period only in English (7.1).
const nda2 = [
  ['h', 'MADDE 1 - TARAFLAR', 'ARTICLE 1 - PARTIES'],
  nda1[1],
  ['h', 'MADDE 2 - GİZLİ BİLGİ', 'ARTICLE 2 - CONFIDENTIAL INFORMATION'],
  ['p', '2.1. Gizli Bilgi; ticari, mali ve teknik bilgiler, müşteri listeleri, kişisel veriler, kaynak kodları ve Açıklayan Taraf’ça gizli olarak nitelendirilen her türlü bilgiyi kapsar.', '2.1. Confidential Information includes commercial, financial and technical information, customer lists, personal data, source code and any information designated as confidential by the Disclosing Party.'],
  nda1[4],
  ['h', 'MADDE 3 - YÜKÜMLÜLÜKLER', 'ARTICLE 3 - OBLIGATIONS'],
  nda1[6],
  ['p', '3.2. Alıcı Taraf, Gizli Bilgiyi basiretli bir tacir gibi özen göstererek korur ve yalnızca bilmesi gereken çalışanlarıyla paylaşabilir.', '3.2. The Receiving Party shall protect the Confidential Information with the care of a prudent merchant and may share it only with employees who need to know it.'],
  ['p', '3.3. Alıcı Taraf, Gizli Bilgiyi Açıklayan Taraf’ın önceden yazılı onayı olmaksızın üçüncü kişilere açıklayamaz.', '3.3. The Receiving Party may not disclose Confidential Information to third parties without the prior written consent of the Disclosing Party.'],
  ['h', 'MADDE 4 - SÜRE', 'ARTICLE 4 - TERM'],
  ['p', '4.1. İşbu Sözleşme imza tarihinde yürürlüğe girer ve 3 (üç) yıl süreyle geçerlidir.', '4.1. This Agreement enters into force on the date of signature and remains in effect for 3 (three) years.'],
  ['h', 'MADDE 5 - CEZAİ ŞART', 'ARTICLE 5 - PENALTY'],
  ['p', '5.1. Alıcı Taraf’ın bu Sözleşme’ye aykırı davranması hâlinde, Açıklayan Taraf’a 750.000,00 TL cezai şart ödenir.', '5.1. If the Receiving Party breaches this Agreement, it shall pay the Disclosing Party a penalty of TRY 500,000.00.'],
  ['h', 'MADDE 6 - İSTİSNALAR', 'ARTICLE 6 - EXCEPTIONS'],
  ['p', '6.1. Kamuya açık olan veya Alıcı Taraf’ın Sözleşme öncesinde hukuka uygun olarak edindiği bilgiler Gizli Bilgi sayılmaz.', '6.1. Information that is publicly available or lawfully obtained by the Receiving Party before this Agreement is not Confidential Information.'],
  ['h', 'MADDE 7 - BİLGİLERİN İADESİ', 'ARTICLE 7 - RETURN OF INFORMATION'],
  ['p', '7.1. Sözleşme’nin sona ermesi hâlinde Alıcı Taraf, Gizli Bilgiyi içeren tüm belgeleri 15 (on beş) gün içinde iade eder.', '7.1. Upon termination of this Agreement, the Receiving Party shall return all documents containing Confidential Information within 10 (ten) days.'],
  ['h', 'MADDE 8 - UYGULANACAK HUKUK VE YETKİ', 'ARTICLE 8 - GOVERNING LAW AND JURISDICTION'],
  ['p', '8.1. İşbu Sözleşme Türk hukukuna tabidir. Uyuşmazlıklarda İstanbul Anadolu Mahkemeleri ve İcra Daireleri yetkilidir.', '8.1. This Agreement is governed by Turkish law. The Courts and Enforcement Offices of Istanbul Anatolian have jurisdiction over any dispute.'],
  ['p', '8.2. Türkçe ve İngilizce metinler arasında çelişki olması hâlinde Türkçe metin esas alınır.', '8.2. In case of any conflict between the Turkish and English texts, the Turkish text shall prevail.'],
];

function buildBilingual(rows, version) {
  const thin = { style: 'single', size: 4, color: 'BBBBBB' };
  const cell = (text, opts = {}) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      children: [new TextRun({ text, bold: !!opts.bold, size: opts.size })],
    })],
  });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
    rows: [
      new TableRow({ children: NDA_TITLE.map((t) => cell(t, { bold: true, center: true, size: 26 })) }),
      ...rows.map((r) => new TableRow({ children: [cell(r[1], { bold: r[0] === 'h' }), cell(r[2], { bold: r[0] === 'h' })] })),
    ],
  });
  return new Document({
    creator: 'Redline fixtures',
    title: `${NDA_TITLE[1]} (${version})`,
    styles: { default: { document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1000, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Sayfa / Page ', PageNumber.CURRENT], size: 16, color: '666666' })] })] }) },
      children: [table],
    }],
  });
}

const files = [
  ['service-agreement-v1.docx', buildServiceAgreement(v1, 'Taslak 1')],
  ['service-agreement-v2.docx', buildServiceAgreement(v2, 'Taslak 2')],
  ['bilingual-nda-v1.docx', buildBilingual(nda1, 'v1')],
  ['bilingual-nda-v2.docx', buildBilingual(nda2, 'v2')],
];
for (const [name, doc] of files) {
  writeFileSync(join(OUT, name), await Packer.toBuffer(doc));
  console.log('wrote', name);
}

const soffice = ['/opt/homebrew/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice', '/usr/bin/soffice'].find(existsSync);
if (soffice) {
  execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', OUT, ...files.map(([name]) => join(OUT, name))], { stdio: 'inherit' });
} else {
  console.log('LibreOffice not found; skipping PDF copies.');
}

// Simulated scans of the revised agreement: 200 dpi greyscale page images.
const has = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const src = join(OUT, 'service-agreement-v2.pdf');
if (existsSync(src) && has('pdftoppm') && has('tesseract') && has('gs') && (has('sips') || has('img2pdf'))) {
  const tmp = mkdtempSync(join(tmpdir(), 'redline-scan-'));
  execFileSync('pdftoppm', ['-r', '200', '-gray', '-png', src, join(tmp, 'scan')]);
  const pngs = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort().map((f) => join(tmp, f));
  const imagePdfs = pngs.map((png) => {
    const out = png.replace(/\.png$/, '-img.pdf');
    if (has('img2pdf')) execFileSync('img2pdf', [png, '-o', out]);
    else execFileSync('sips', ['-s', 'format', 'pdf', png, '--out', out], { stdio: 'ignore' });
    return out;
  });
  const ocrPdfs = pngs.map((png) => {
    const base = png.replace(/\.png$/, '-ocr');
    execFileSync('tesseract', [png, base, '-l', 'tur', 'pdf'], { stdio: 'ignore' });
    return `${base}.pdf`;
  });
  execFileSync('gs', ['-q', '-sDEVICE=pdfwrite', '-o', join(OUT, 'service-agreement-v2-scanned.pdf'), ...imagePdfs]);
  execFileSync('gs', ['-q', '-sDEVICE=pdfwrite', '-o', join(OUT, 'service-agreement-v2-ocr.pdf'), ...ocrPdfs]);
  rmSync(tmp, { recursive: true, force: true });
  console.log('wrote service-agreement-v2-scanned.pdf and service-agreement-v2-ocr.pdf');
} else {
  console.log('Scan tools not found; keeping the committed scanned fixtures.');
}
