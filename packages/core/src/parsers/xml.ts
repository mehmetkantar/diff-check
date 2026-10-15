// Native DOMParser in browsers; @xmldom/xmldom in Node and Web Workers, where it does not exist.
type Parser = { parseFromString(xml: string, type: string): Document };

let parser: Parser | null = null;
let mime = 'application/xml';

export async function parseXml(xml: string): Promise<Document> {
  if (!parser) {
    const NativeParser = (globalThis as { DOMParser?: new () => Parser }).DOMParser;
    if (NativeParser) parser = new NativeParser();
    else {
      const { DOMParser } = await import('@xmldom/xmldom');
      parser = new DOMParser() as unknown as Parser;
      mime = 'text/xml';
    }
  }
  return parser.parseFromString(xml, mime);
}

/** Element children, without relying on `.children` (missing in some DOM shims). */
export function kids(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}
