import type jsPDF from 'jspdf';
import { scientificCharacter, scientificText } from './scientific-text';

function characterWidth(doc: jsPDF, c: string, size: number, bold: boolean) {
  const part = scientificCharacter(c);
  doc.setFont(part.symbol ? 'symbol' : 'helvetica', part.symbol ? 'normal' : bold ? 'bold' : 'normal');
  doc.setFontSize(part.script ? size * 0.72 : size);
  return part.arrow ? size * 0.48 : doc.getTextWidth(part.text);
}

export function scientificWidth(doc: jsPDF, text: string, size = 11, bold = false): number {
  const width = [...scientificText(text)].reduce((sum, c) => sum + characterWidth(doc, c, size, bold), 0);
  doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
  return width;
}

/** Draw scripts at shifted baselines and reaction arrows as vectors, including rotated axes. */
export function drawScientificLine(doc: jsPDF, text: string, x: number, y: number, size = 11, bold = false, angle = 0) {
  const radians = angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const point = (dx: number, dy: number) => [x + dx * cos + dy * sin, y - dx * sin + dy * cos];
  let offset = 0;
  for (const c of scientificText(text)) {
    const part = scientificCharacter(c), width = characterWidth(doc, c, size, bold);
    if (part.arrow) {
      const arrow = (dy: number, right: boolean) => {
        const start = offset + (right ? 0.5 : width - 0.5), end = offset + (right ? width - 0.5 : 0.5);
        const [sx, sy] = point(start, dy), [ex, ey] = point(end, dy);
        doc.setLineWidth(0.2); doc.line(sx, sy, ex, ey);
        for (const h of [-0.55, 0.55]) { const [hx, hy] = point(end + (right ? -0.9 : 0.9), dy + h); doc.line(ex, ey, hx, hy); }
      };
      if (c === '⇌') { arrow(-size * 0.14, true); arrow(-size * 0.04, false); }
      else { arrow(-size * 0.09, c !== '←'); if (c === '↔') arrow(-size * 0.09, false); }
    } else {
      const [px, py] = point(offset, part.script > 0 ? -size * 0.11 : part.script < 0 ? size * 0.065 : 0);
      doc.text(part.text, px, py, angle ? { angle } : undefined);
    }
    offset += width;
  }
  doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
}

/** Take one line using actual script/symbol metrics; preserve explicit line breaks. */
export function takeScientificLine(doc: jsPDF, text: string, width: number, size = 11, bold = false): [string, string] {
  const value = scientificText(text);
  let used = 0, lastSpace = -1, index = 0;
  for (; index < value.length; index++) {
    if (value[index] === '\n') return [value.slice(0, index), value.slice(index + 1)];
    const next = characterWidth(doc, value[index], size, bold);
    if (used + next > width && index > 0) break;
    used += next;
    if (/\s/.test(value[index])) lastSpace = index;
  }
  if (index === value.length) return [value, ''];
  const split = lastSpace > 0 ? lastSpace : index;
  return [value.slice(0, split).trimEnd(), value.slice(split).trimStart()];
}
