// Source metadata belongs to the mapper only; quiz generation does not use it.
export interface MapperSourceQuestion {
  question_id: string;
  text: string;
  source_marks: number | null;
  source_page: number;
  source_part_ids: string[];
  extraction_review?: string;
}

export interface PdfItem { text: string; x: number; y: number; width: number; height: number }
export interface PdfPage { page: number; height: number; items: PdfItem[] }
export interface PdfLine { text: string; x: number; y: number; page: number }

export function questionKey(id: string): string {
  return id.toLowerCase().replace(/^\s*(?:question|q)\s*/, '')
    .replace(/[()[\]\s]/g, '').replace(/\d+/g, number => String(Number(number)));
}

export function pageLines(page: PdfPage): PdfLine[] {
  const rows: Array<{ y: number; items: PdfItem[] }> = [];
  for (const item of [...page.items].filter(item => item.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    // Use the baseline, not PDF stream order. Superscripts stay beside their base
    // where possible, without merging two ordinary lines of body text.
    const row = rows.find(row => Math.abs(row.y - item.y) <= Math.max(2, Math.min(item.height * 0.45, 4)));
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    const items = row.items.sort((a, b) => a.x - b.x);
    return { page: page.page, y: row.y, x: items[0].x, text: items.map(item => item.text.trim()).join(' ') };
  });
}

/** A conservative reader for PMT's single-column, numbered worksheets.
 * Other layouts retain the existing AI extractor, with unverified coverage.
 * Never use this reader to flatten a multi-column paper or a scanned image.
 */
export function readWorksheetQuestions(pages: PdfPage[]): MapperSourceQuestion[] | null {
  if (!pages.length || !pages.every(page => page.items.some(item => /PhysicsAndMathsTutor\.com/i.test(item.text)))) return null;
  const lines = pages.flatMap(page => pageLines(page).filter(line => line.y < page.height - 45 && line.y > 25));
  interface Part { id: string; lines: string[]; page: number; path: string[]; marks: number[] }
  const groups: Array<{ main: number; parts: Part[] }> = [];
  let group: typeof groups[number] | undefined;
  let current: Part | undefined;
  let letter = '';
  const start = (path: string[], line: PdfLine) => {
    const id = `Q${group!.main}${path.map(part => `(${part})`).join('')}`;
    if (group!.parts.some(part => part.id === id)) return false;
    current = { id, path, lines: [], page: line.page, marks: [] };
    group!.parts.push(current);
    return true;
  };
  for (const line of lines) {
    const main = line.text.match(/^(\d{1,3})(?:\(([a-z])\))?\.(?!\d)(?:\s|$)/);
    // A heading outside the supported left margin can indicate a second
    // question column. Do not certify just the first column as a whole paper.
    if (main && line.x >= 135) return null;
    if (main && line.x < 135 && (!group || Number(main[1]) > group.main)) {
      if (group && Number(main[1]) !== group.main + 1) return null;
      // Numbered method instructions are indented and do not finish a question.
      if (group && !group.parts.some(part => part.marks.length)) return null;
      group = { main: Number(main[1]), parts: [] };
      groups.push(group);
      letter = main[2] || '';
      if (!start([], line)) return null;
      if (letter && !start([letter], line)) return null;
    } else if (group) {
      const sub = line.x < 140 ? line.text.match(/^(?:\(([a-z]|[ivx]{1,5})\)\.?|([a-z]|[ivx]{1,5})\.)(?:\s|$)/) : null;
      if (sub) {
        const token = sub[1] || sub[2];
        const isRoman = /^[ivx]+$/.test(token) && !(token === 'i' && letter === 'h');
        if (isRoman) {
          if (!start(letter ? [letter, token] : [token], line)) return null;
        } else {
          letter = token;
          if (!start([letter], line)) return null;
        }
      }
    }
    if (!current) continue;
    current.lines.push(line.text);
    if (!/^\s*\(?total\b/i.test(line.text)) {
      const mark = line.text.match(/(?:\[(\d{1,2})(?:\s*marks?)?\]|\((\d{1,2})\s*marks?\))\s*$/i);
      if (mark) current.marks.push(Number(mark[1] || mark[2]));
    }
  }
  if (groups.length < 2) return null;
  const result: MapperSourceQuestion[] = [];
  for (const { parts } of groups) {
    const isParent = (part: Part, other: Part) => part !== other && part.path.length < other.path.length && part.path.every((p, i) => other.path[i] === p);
    // Retain unmarked leaf sections too: an absent/graphical allocation must
    // become an explicit review item, never a silently omitted question.
    const leaves = parts.filter(part => !parts.some(other => isParent(part, other)) || part.marks.length);
    const ids = leaves.map(part => part.id);
    for (const part of leaves) {
      const parents = parts.filter(parent => isParent(parent, part));
      result.push({
        question_id: part.id,
        text: [...parents, part].flatMap(p => p.lines).join('\n'),
        source_marks: part.marks.length === 1 ? part.marks[0] : null,
        source_page: part.page,
        source_part_ids: ids,
        ...(part.marks.length !== 1 ? { extraction_review: 'The question paper does not provide one readable mark allocation for this part. Check the source PDF.' } : {}),
      });
    }
  }
  return result.length ? result : null;
}
