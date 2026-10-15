/** Saves a Blob through a temporary object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Prints an HTML document through a hidden iframe so the host page is untouched. */
export function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || 'document';
