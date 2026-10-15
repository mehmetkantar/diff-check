import { describeChange, placeLabel } from '../describe';
import type { Messages } from '../locales/en';
import { moveNote, redlineBlock, redlineSpans } from '../render';
import type { Comparison } from '../types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `
*{box-sizing:border-box}body{margin:0;font:14px/1.55 "Geist",ui-sans-serif,system-ui,sans-serif;color:#16181c;background:#fff}
main{max-width:860px;margin:0 auto;padding:40px 32px}h1{font-size:24px;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:15px;margin:32px 0 10px}
.muted{color:#5b616b}.files{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin-top:16px}
.stats{display:flex;flex-wrap:wrap;gap:8px 24px;margin:12px 0 0;padding:0;list-style:none}.stats b{font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;font-weight:600;color:#5b616b;border-bottom:1px solid #d6dae0;padding:6px 8px}
td{padding:7px 8px;vertical-align:top;border-bottom:1px solid #eceef1}td.n{font-variant-numeric:tabular-nums;color:#5b616b;width:36px}
.legend{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12.5px}
.doc{font:15px/1.62 "Source Serif 4",Georgia,"Times New Roman",serif}.doc p{margin:0 0 10px}.doc .h{font-weight:650}
.lbl{font:600 12px ui-sans-serif,system-ui,sans-serif;color:#6b717b;margin-right:6px}
.note{display:block;font:500 11.5px ui-sans-serif,system-ui,sans-serif;color:#0f6e3d;margin-bottom:2px}
.ins{color:#1d4ed8;text-decoration:underline double}.del{color:#b42318;text-decoration:line-through}
.mdst{color:#0f6e3d;text-decoration:underline double}.msrc{color:#0f6e3d;text-decoration:line-through double}
.bar{border-left:3px solid transparent;padding-left:10px;margin-left:-13px}.bar-mod{border-color:#935600}.bar-ins{border-color:#1d4ed8}.bar-del{border-color:#b42318}.bar-move{border-color:#0f6e3d}
.flag{display:inline-block;font-size:11px;border:1px solid #c9ced5;border-radius:999px;padding:0 6px;margin:2px 4px 0 0;color:#454a52}
@media print{main{padding:0}h2{break-after:avoid}tr,.doc p{break-inside:avoid}}
`;

/** A standalone, printable HTML redline report (no scripts, no external assets). */
export function toHTMLReport(cmp: Comparison, m: Messages, opts: { date?: Date; blackWhite?: boolean } = {}): string {
  const date = (opts.date ?? new Date()).toLocaleString(m.locale);
  const onOff = (v: boolean) => (v ? m.report.on : m.report.off);
  const s = cmp.stats;
  const stat = (k: 'mod' | 'ins' | 'del' | 'move') => `<li>${esc(m.type[k])}: <b>${s[k]}</b></li>`;

  const rows = cmp.changes
    .map((c) => {
      const where = [placeLabel(c.locL, m), placeLabel(c.locR, m)].filter(Boolean);
      const unique = where.length === 2 && where[0] === where[1] ? [where[0]] : where;
      const pages = [c.locL?.page, c.locR?.page].filter(Boolean).map((p) => m.page(p as number));
      const flags = c.flags.map((f) => `<span class="flag">${esc(m.flag[f])}</span>`).join('');
      return `<tr><td class="n">${c.n}</td><td>${esc(m.type[c.type])}${c.lang ? ` (${c.lang.toUpperCase()})` : ''}</td><td>${esc(unique.join(' → '))}<div class="muted">${esc([...new Set(pages)].join(' → '))}</div></td><td>${esc(describeChange(c, m))}<div>${flags}</div></td></tr>`;
    })
    .join('');

  const typeById = new Map(cmp.changes.map((c) => [c.id, c.type]));
  const body = cmp.ops
    .map((op, i) => {
      const { block } = redlineBlock(cmp, op);
      const spans = redlineSpans(cmp, op)
        .map((sp) => (sp.k === 'eq' ? esc(sp.text) : `<span class="${sp.k}">${esc(sp.text)}</span>`))
        .join('');
      const id = cmp.rows[i].changeId;
      const type = id ? typeById.get(id) : undefined;
      const bar = type ? ` bar bar-${type === 'renum' ? 'mod' : type}` : '';
      const note = moveNote(cmp, op, m);
      const label = block.label ? `<span class="lbl">${esc(block.label)}</span>` : '';
      return `<p class="${block.kind === 'heading' ? 'h' : ''}${bar}">${note ? `<span class="note">${esc(note)}</span>` : ''}${label}${spans}</p>`;
    })
    .join('\n');

  const bw = opts.blackWhite ? '.ins,.del,.mdst,.msrc,.note{color:inherit}' : '';
  return `<!doctype html>
<html lang="${esc(m.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.report.title)}: ${esc(cmp.left.name)} → ${esc(cmp.right.name)}</title><style>${CSS}${bw}</style></head>
<body><main>
<h1>${esc(m.report.title)}</h1><div class="muted">${esc(m.report.generated(date))}</div>
<div class="files"><span class="muted">${esc(m.doc.original)}</span><b>${esc(cmp.left.name)}</b><span class="muted">${esc(m.doc.revised)}</span><b>${esc(cmp.right.name)}</b></div>
<h2>${esc(m.report.summary)}</h2>
<div><b>${esc(m.list.count(s.total))}</b></div>
<ul class="stats">${stat('mod')}${stat('ins')}${stat('del')}${stat('move')}<li>${esc(m.list.attention)}: <b>${s.flagged}</b></li></ul>
<p class="muted">${esc(m.report.settings)}: ${esc(m.options.ignoreCase)} ${esc(onOff(cmp.options.ignoreCase))}; ${esc(m.options.ignorePunctuation)} ${esc(onOff(cmp.options.ignorePunctuation))}; ${esc(m.options.detectMoves)} ${esc(onOff(cmp.options.detectMoves))}</p>
<h2>${esc(m.report.legend)}</h2>
<div class="legend"><span class="ins">${esc(m.legend.ins)}</span><span class="del">${esc(m.legend.del)}</span><span class="mdst">${esc(m.legend.mdst)}</span><span class="msrc">${esc(m.legend.msrc)}</span></div>
<h2>${esc(m.report.changeTable)}</h2>
<table><thead><tr><th>${esc(m.report.colNo)}</th><th>${esc(m.report.colType)}</th><th>${esc(m.report.colWhere)}</th><th>${esc(m.report.colWhat)}</th></tr></thead><tbody>${rows}</tbody></table>
<h2 style="break-before:page">${esc(m.report.redline)}</h2>
<div class="doc">${body}</div>
</main></body></html>`;
}
