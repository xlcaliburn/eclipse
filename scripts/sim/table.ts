// Shared console-table formatting — was copy-pasted across balance.ts,
// actRun.ts, and enemyValue.ts as three near-identical `pad` functions.

export function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

export function padNum(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

export function printHeader(cols: [string, number][]): void {
  const header = cols.map(([label, width]) => pad(label, width)).join('');
  console.log(header);
  console.log('-'.repeat(header.length));
}
