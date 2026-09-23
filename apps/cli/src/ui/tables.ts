/** Render rows as aligned columns. */
export function table(headers: string[], rows: string[][], indent = ''): string[] {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const fmt = (cells: string[]) =>
    indent +
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]! + 2)))
      .join('')
      .trimEnd();
  return [fmt(headers), ...rows.map(fmt)];
}
