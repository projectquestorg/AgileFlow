/** Remove terminal control sequences and control characters from untrusted text (registry, skills.sh, skill files). */
export function safeText(text: string): string {
  return text
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/[\r\n\t]+/g, ' ');
}

/** Render rows as aligned columns. Cells are sanitized: they often carry third-party text. */
export function table(headers: string[], rows: string[][], indent = ''): string[] {
  const clean = rows.map((r) => r.map((c) => safeText(c ?? '')));
  const widths = headers.map((h, i) => Math.max(h.length, ...clean.map((r) => (r[i] ?? '').length)));
  const fmt = (cells: string[]) =>
    indent +
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]! + 2)))
      .join('')
      .trimEnd();
  return [fmt(headers), ...clean.map(fmt)];
}
