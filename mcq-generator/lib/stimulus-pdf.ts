import { drawScientificLine } from './scientific-pdf';
import type jsPDF from 'jspdf';
import type { StimulusPanel } from './stimulus-layout';

export function drawStimulusPanel(doc: jsPDF, panel: StimulusPanel, x: number, y: number, width: number): number {
  const scale = width / panel.width;
  doc.saveGraphicsState();
  for (const item of panel.items) {
    const sx = x + item.x * scale, sy = y + item.y * scale;
    doc.setDrawColor('#444444'); doc.setTextColor('#111111'); doc.setLineWidth(0.25);
    doc.setLineDashPattern([], 0);
    if (item.type === 'text') {
      doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
      doc.setFontSize(item.size * scale * 72 / 25.4);
      drawScientificLine(doc, item.text, sx, sy, item.size * scale * 72 / 25.4, !!item.bold, item.rotate ? 90 : 0);
    } else if (item.type === 'line') {
      if (item.dash) doc.setLineDashPattern([scale * 4, scale * 4], 0);
      doc.line(sx, sy, x + item.x2 * scale, y + item.y2 * scale);
    } else {
      if (item.fill) doc.setFillColor(item.fill);
      if (item.type === 'rect') doc.rect(sx, sy, item.width * scale, item.height * scale, item.fill ? 'FD' : 'S');
      else doc.ellipse(sx + item.width * scale / 2, sy + item.height * scale / 2, item.width * scale / 2, item.height * scale / 2, item.fill ? 'FD' : 'S');
    }
  }
  doc.restoreGraphicsState();
  // jsPDF also tracks font state outside the PDF graphics-state stack.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(0); doc.setLineDashPattern([], 0);
  return panel.height * scale;
}
