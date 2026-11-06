import { questionKey, type PdfPage, type MapperSourceQuestion } from './mapper-source';

export interface SourceMarkingRow { question_id: string; content: string }

/** PMT table identifiers occupy three narrow columns; their characters can
 * wrap vertically (2, 1 and i mean 21(i)). Preserve the original table-cell
 * stream order here, rather than flattening adjacent answer/guidance columns.
 */
export function readWorksheetMarkScheme(pages: PdfPage[]): SourceMarkingRow[] | null {
  if (!pages.length || !pages.every(page => page.items.some(item => /PhysicsAndMathsTutor\.com/i.test(item.text)))) return null;
  const rows: SourceMarkingRow[] = [];
  let main = '';
  let letter = '';
  let current: SourceMarkingRow | undefined;
  let pending: Array<{ text: string; x: number }> = [];
  const startRow = () => {
    if (!pending.length) return true;
    const digits = pending.filter(item => item.x < 85).map(item => item.text).join('');
    const alpha = pending.filter(item => item.x >= 85 && item.x < 97).map(item => item.text).join('');
    const roman = pending.filter(item => item.x >= 97).map(item => item.text).join('');
    pending = [];
    if (digits) {
      if (!/^\d{1,3}$/.test(digits) || (main && Number(digits) !== Number(main) + 1)) return false;
      main = digits;
      letter = '';
    }
    if (!main || (alpha && !/^[a-z]$/.test(alpha)) || (roman && !/^(?:i{1,3}|iv|v|vi{1,3}|ix|x)$/.test(roman))) return false;
    if (alpha) letter = alpha;
    const id = `Q${Number(main)}${letter ? `(${letter})` : ''}${roman ? `(${roman})` : ''}`;
    if (rows.some(row => row.question_id === id)) return false;
    current = { question_id: id, content: '' };
    rows.push(current);
    return true;
  };
  for (const page of pages) {
    for (const item of page.items) {
      const text = item.text.trim();
      if (!text || item.y >= page.height - 45 || item.y <= 25 || /^(?:Mark Scheme|PhysicsAndMathsTutor\.com)/i.test(text)) continue;
      if (item.x >= 65 && item.x < 110 && /^[0-9a-z]+$/.test(text)) {
        pending.push({ text, x: item.x });
        continue;
      }
      // Ignore the decorative title, which can have a separate 'Mark' item.
      if (item.x < 110 && /^(?:Mark|Scheme)$/i.test(text)) continue;
      if (!startRow()) return null;
      if (current) current.content += `${text}\n`;
    }
  }
  if (!startRow() || !rows.length || rows.some(row => !row.content.trim())) return null;
  return rows;
}

/** Exact-ID joining is safe only if the entire main-question part structure
 * agrees. A shifted scheme (e.g. a(i) instead of b(i)) must not accidentally
 * assign b's answer to b merely because those two individual IDs exist.
 */
export function matchingStructure(questions: MapperSourceQuestion[], rows: SourceMarkingRow[]): boolean {
  const actual = new Set(rows.map(row => questionKey(row.question_id)));
  return actual.size === questions.length && questions.every(question => actual.has(questionKey(question.question_id)));
}
