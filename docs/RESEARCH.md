# Research notes

Two research passes were run before the build (October 2026). The first looked at open-source building blocks for comparing DOCX and PDF on-prem. The second looked at how commercial legal comparison tools present changes. This file summarises both and marks what Redline adopted.

## 1. Open-source landscape

Star counts and release dates came from the GitHub and npm APIs on 2026-10-15.

| Name | Type | License | Runs in browser | Strengths | Weaknesses for legal redlining |
|---|---|---|---|---|---|
| Docxodus (npm `docxodus` 13.0) | DOCX compare and render, .NET → WebAssembly | MIT | Yes | Compares document structure, not just text. Native ins/del/moveFrom/moveTo, formatting changes, JSON revisions | Young (2025), single maintainer, ~43 MB, DOCX only |
| Open-XML-PowerTools WmlComparer (Codeuctivity fork) | DOCX compare, C# | MIT | No | Proven; most open DOCX comparers descend from it | Original repo is unmaintained; no move output; server only |
| @usejunior/docx-compare (safe-docx) | DOCX compare, TS | Apache-2.0 | Probably | `detectMoves`, tracked-changes output | Pre-1.0 |
| LibreOffice compare via unoserver | Headless compare | MPL-2.0 | No | Mature Writer compare | Needs a LibreOffice server; move handling undocumented |
| Stirling-PDF Compare | PDF compare UI | MIT core | Yes | Word diff, pixel mode, change navigation; a good UI reference | No moves; ASCII-only tokenizer splits Turkish words |
| diff-pdf / DiffPDF | Visual PDF diff, C++ | GPL-2.0 | No | Pixel overlay | No text semantics, GPL, DiffPDF unmaintained |
| pdf-diff (JoshData) | PDF text diff, Python | CC0 | No | Change bounding boxes | No moves, little maintenance |
| pdftl `diff_text` | Position-aware PDF diff | MPL-2.0 | No | Header and footer margin filter | Young; no moves |
| prosediff | Prose diff, Python | MIT | No | Finds moved paragraphs even when they were also edited | Tiny project, needs git |
| redlines (houfu) | Text diff, Python | MIT | No | Legal-aware sentence splitting | Plain text only, no moves |
| Docling / unstructured | Document → structure | MIT / Apache-2.0 | No | Layout and table models | Heavy ML dependencies; no compare API |
| **pdf.js** (`pdfjs-dist` 6.x) | PDF render and text | Apache-2.0 | Yes | Canvas rendering; text runs with positions | Runs, not words; reading order, hyphenation and headers are yours to handle |
| pdfplumber / pdfminer.six | PDF extraction, Python | MIT | No | Character boxes, tables | Server only |
| PyMuPDF | PDF extraction | AGPL-3.0 | No | Fast and accurate | AGPL |
| mammoth.js | DOCX → semantic HTML | BSD-2 | Yes | Clean paragraph text | Loses literal list numbers such as "3.2(b)" |
| docx-preview | DOCX renderer | Apache-2.0 | Yes | High-fidelity HTML | No diff, approximate pagination |
| **JSZip** + DOMParser | Raw OOXML access | MIT | Yes | Full control | Numbering, fields and tracked changes are yours to implement |
| **jsdiff** (`diff` 9.x) | Myers diff | BSD-3 | Yes | Word, line and array diffs | No moves |
| diff-match-patch | Character diff with cleanup | Apache-2.0 | Yes | Readable output after cleanup | Archived upstream; no moves |
| wikEdDiff | Word diff with block moves | Public domain | Yes | Detects moves | Old, wiki-oriented tokenizer |
| Monaco / vscode-diff | Line diff with moves | MIT | Yes | `showMoves` | Built for code, not prose |
| daff | Table diff | MIT | Yes | Row- and column-aware | Tables only |

**Recommended stack from the research, and what Redline did**

| Recommendation | Redline |
|---|---|
| Static single-page app on on-prem nginx; parse and diff in the browser; block outbound requests with `connect-src 'self'` | Adopted (`deploy/`, CSP in `deploy/security-headers.conf`) |
| DOCX: try Docxodus; fallback is a JSZip OOXML parser that resolves list numbering | JSZip parser adopted (`packages/core/src/parsers/docx.ts`) with Word numbering, style-linked headings, page hints and bilingual tables. Docxodus is a roadmap option |
| PDF: pdf.js with word boxes, header/footer removal, hyphen joining, reading order | Adopted, plus column detection for bilingual layouts (`parsers/pdf.ts`) |
| One engine for both formats: align paragraphs first, then diff words, then detect moves with a minimum length and similarity | Adopted (`align.ts`, `inline.ts`, `compare.ts`) |
| Unicode-aware tokenizer, `tr-TR` lower-casing | Adopted (`text.ts`) |
| Avoid AGPL (PyMuPDF, SuperDoc) and GPL (diff-pdf) | Followed: dependencies are MIT, BSD and Apache-2.0 only |

## 2. Legal redline UX

### How the main tools present changes

- **Litera Compare** (formerly Change-Pro, Workshare, DeltaView):
  - Change list on the left, with a location filter, accept checkboxes and a summary tab.
  - Go To (page, section, change number) and keyboard navigation with F5 to F8.
  - Moves are off by default. When enabled they need at least 5 words, and a "Link to Move" jumps between the old and new place.
  - Options ignore case, whitespace and renumbering.
  - Exports a redline with a summary page, tracked changes, and changed pages only.
- **Workshare / DeltaView**: the change summary has category, list and status views. Noise such as numbering, whitespace and capitalization sits in its own categories, and changes can be marked read.
- **Draftable**: side by side with synchronized scrolling and a change-marker scrollbar, plus redline and three-pane views. Its default theme is red deletions, blue insertions and green moves, and it exports summary reports and tracked changes.
- **Microsoft Word Compare**: synchronized panes. Moved-from text is double strikethrough and moved-to text is double underline. Renumbering shows up as false changes on every later clause.
- **Adobe Acrobat Compare**: opens on a summary page. The side-by-side view joins matching areas with bands, and there is a searchable change list.

### Conventions

| Change | Style |
|---|---|
| Insertion | Blue, double underline |
| Deletion | Red, strikethrough |
| Moved from | Green, (double) strikethrough |
| Moved to | Green, double underline |

The line style carries the meaning when colour is lost, which is why every tool also ships a black-and-white style.

### Ranked patterns and Redline's status

| # | Pattern | Redline |
|---|---|---|
| 1 | Legal palette with redundant line styles, a persistent legend, black-and-white mode | Adopted (styles.css, legend, `blackWhite` option) |
| 2 | Location on every change: clause number, heading, page (original → revised) | Adopted (`Loc`, `placeLabel`) |
| 3 | Change list as the primary navigator: numbered, filters, click to sync, reviewed status | Adopted |
| 4 | Moves as linked pairs, with edits inside the moved block shown, and a minimum length | Adopted (4-word minimum, move connectors, old/new place links) |
| 5 | Collapse noise: renumbering, whitespace, case, quotes, ligatures | Adopted (renumbering hidden with a count; typographic normalization; NFKC for ligatures; header/footer removal) |
| 6 | Redline default with side-by-side and three-pane toggles, synced scroll, density gutter | Side by side, redline, clause map and pages views; overview ruler |
| 7 | Summary first, counts by type, "go to first change" | Adopted (change list header, report summary) |
| 8 | Keyboard navigation | Adopted (J, K, R) |
| 9 | Export what lawyers send: redline PDF with summary and legend, tracked-changes DOCX, CSV | Adopted |
| 10 | Make version direction clear: labels, file names, swap, settings in the report | Adopted |

### What confuses lawyers, and the mitigation

| Problem | Mitigation in Redline |
|---|---|
| False or missed moves | Minimum length, similarity thresholds, and a move is only declared when clearly better than a local match |
| Renumbering cascades | Clause numbers are compared separately from text |
| A whole paragraph shown as replaced for a one-word edit | Paragraph alignment first, then word-level diff with readability cleanup |
| Invisible character differences (ligatures, quotes, non-breaking spaces) | Canonicalised before comparing |
| Colour-only cues lost in print | Line styles always present; black-and-white mode |
| Repeated header and footer changes | Running headers, footers and page numbers are removed from PDFs |
| Wrong AI summaries | No generative summaries; every description is derived from the actual diff and links to it |

Sources are listed in the original research transcripts. Key references:
- Litera support articles (UI, style settings, moves, shortcuts)
- Draftable help centre
- Microsoft support "Advanced track changes options"
- Adobe Acrobat "Compare documents"
- The GitHub repositories named in the table above
