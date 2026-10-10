import type { QuizStimulus } from './stimulus-types';

// The same measured drawing is consumed by SVG and jsPDF. Coordinates are in
// a 680-unit-wide viewport; no generated HTML, SVG markup or executable code.
export type DrawItem =
  | { type: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; rotate?: boolean }
  | { type: 'line'; x: number; y: number; x2: number; y2: number; dash?: boolean }
  | { type: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number; fill?: string };
export interface StimulusPanel { width: number; height: number; items: DrawItem[] }
const W = 680;

/** Conservative character wrapping stays identical in browser and exported PDF. */
export function wrapStimulusText(text: string, width: number, size = 14): string[] {
  const limit = Math.max(1, Math.floor(width / (size * 0.63)));
  const result: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > limit) { result.push(line); line = ''; }
      while (word.length > limit) { result.push(word.slice(0, limit)); word = word.slice(limit); }
      if (word) line += (line ? ' ' : '') + word;
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}
function addText(items: DrawItem[], text: string, x: number, y: number, width: number, size = 14, bold = false): number {
  const lines = wrapStimulusText(text, width, size);
  lines.forEach((line, i) => items.push({ type: 'text', text: line, x, y: y + i * (size + 5), size, bold }));
  return y + lines.length * (size + 5);
}
function prosePanels(paragraphs: string[]): StimulusPanel[] {
  const panels: StimulusPanel[] = [];
  let items: DrawItem[] = [], y = 22;
  for (const paragraph of paragraphs) {
    for (const line of wrapStimulusText(paragraph, 648)) {
      if (y > 370) { panels.push({ width: W, height: y + 6, items }); items = []; y = 22; }
      items.push({ type: 'text', x: 16, y, text: line, size: 14 }); y += 19;
    }
    y += 8;
  }
  if (items.length) panels.push({ width: W, height: y + 6, items });
  return panels;
}
function formatTick(n: number): string {
  if (n !== 0 && (Math.abs(n) < 0.001 || Math.abs(n) >= 100000)) return n.toExponential(1);
  return Number(n.toPrecision(6)).toString();
}

export function layoutStimulus(stimulus: QuizStimulus): StimulusPanel[] {
  const panels = stimulus.context ? prosePanels([stimulus.context]) : [];
  if (stimulus.kind === 'text') return [...panels, ...prosePanels(stimulus.paragraphs)];
  if (stimulus.kind === 'table') {
    const cellWidth = 648 / stimulus.columns.length;
    const itemsForRow = (cells: string[], y: number, bold: boolean) => {
      const rows = cells.map(c => wrapStimulusText(c, cellWidth - 16, 13));
      const height = Math.max(...rows.map(r => r.length)) * 18 + 16;
      const items: DrawItem[] = [];
      rows.forEach((lines, col) => {
        const x = 16 + col * cellWidth;
        items.push({ type: 'rect', x, y, width: cellWidth, height, ...(bold ? { fill: '#eeeeee' } : {}) });
        lines.forEach((text, i) => items.push({ type: 'text', x: x + 8, y: y + 22 + i * 18, text, size: 13, bold }));
      });
      return { items, height };
    };
    const header = itemsForRow(stimulus.columns, 8, true);
    let items = [...header.items], y = 8 + header.height;
    for (const row of stimulus.rows) {
      let rendered = itemsForRow(row, y, false);
      if (y + rendered.height > 620) { panels.push({ width: W, height: y + 8, items }); items = [...header.items]; y = 8 + header.height; rendered = itemsForRow(row, y, false); }
      items.push(...rendered.items); y += rendered.height;
    }
    panels.push({ width: W, height: y + 8, items });
    return panels;
  }
  if (stimulus.kind === 'diagram') {
    const items: DrawItem[] = [];
    for (const e of stimulus.elements) {
      const x = e.x + 40, y = e.y + 16;
      if (e.type === 'label') { items.push({ type: 'text', x, y, text: e.text, size: 14 }); continue; }
      if (e.type === 'line' || e.type === 'arrow') {
        const x2 = e.x2 + 40, y2 = e.y2 + 16;
        items.push({ type: 'line', x, y, x2, y2 });
        if (e.type === 'arrow') {
          const angle = Math.atan2(y2 - y, x2 - x);
          for (const side of [-1, 1]) items.push({ type: 'line', x: x2, y: y2, x2: x2 - 10 * Math.cos(angle + side * 0.45), y2: y2 - 10 * Math.sin(angle + side * 0.45) });
        }
      } else if (e.type === 'rect' || e.type === 'ellipse') items.push({ type: e.type, x, y, width: e.width, height: e.height, ...(e.fill === 'none' ? {} : { fill: e.fill === 'dark' ? '#bbbbbb' : '#eeeeee' }) });
    }
    return [...panels, { width: W, height: 352, items }];
  }
  const items: DrawItem[] = [];
  const left = 98, top = 28, right = 650, bottom = 330;
  const { xAxis, yAxis } = stimulus;
  const px = (x: number) => left + (x - xAxis.min) / (xAxis.max - xAxis.min) * (right - left);
  const py = (y: number) => bottom - (y - yAxis.min) / (yAxis.max - yAxis.min) * (bottom - top);
  const line = (x: number, y: number, x2: number, y2: number, dash = false) => items.push({ type: 'line', x, y, x2, y2, dash });
  for (let i = 0; i <= Math.round((yAxis.max - yAxis.min) / yAxis.tickStep); i++) {
    const value = yAxis.min + i * yAxis.tickStep, y = py(value);
    line(left - 5, y, right, y, true);
    items.push({ type: 'text', x: left - 12 - formatTick(value).length * 7, y: y + 4, text: formatTick(value), size: 12 });
  }
  line(left, top, left, bottom); line(left, bottom, right, bottom);
  const ticks = stimulus.graphType === 'bar'
    ? stimulus.categories!.map((label, value) => ({ label, value }))
    : Array.from({ length: Math.round((xAxis.max - xAxis.min) / xAxis.tickStep) + 1 }, (_, i) => ({ value: xAxis.min + i * xAxis.tickStep, label: formatTick(xAxis.min + i * xAxis.tickStep) }));
  let labelBottom = bottom + 30;
  for (const tick of ticks) {
    const x = px(tick.value); line(x, bottom, x, bottom + 5);
    const width = stimulus.graphType === 'bar' ? (right - left) / ticks.length - 4 : 58;
    const lines = wrapStimulusText(tick.label, width, 12);
    lines.forEach((text, i) => items.push({ type: 'text', x: x - text.length * 3.2, y: bottom + 20 + i * 16, text, size: 12 }));
    labelBottom = Math.max(labelBottom, bottom + 25 + lines.length * 16);
  }
  const axisLabel = (a: { label: string; units: string }) => `${a.label}${a.units ? ` (${a.units})` : ''}`;
  const yLines = wrapStimulusText(axisLabel(yAxis), 275, 13);
  yLines.forEach((text, i) => items.push({ type: 'text', text, x: 20 + i * 17, y: 240, size: 13, rotate: true }));
  let y = addText(items, axisLabel(xAxis), left + 50, labelBottom + 5, right - left - 65, 13);
  const fills = ['#777777', '#bbbbbb', '#444444', '#dddddd'];
  stimulus.series.forEach((series, s) => {
    if (stimulus.graphType === 'line') series.points.slice(1).forEach((p, i) => line(px(series.points[i].x), py(series.points[i].y), px(p.x), py(p.y), s % 2 === 1));
    series.trendPoints?.slice(1).forEach((p, i) => line(px(series.trendPoints![i].x), py(series.trendPoints![i].y), px(p.x), py(p.y), true));
    for (const p of series.points) {
      let x = px(p.x);
      if (stimulus.graphType === 'bar') {
        const groupWidth = (right - left) / stimulus.categories!.length * 0.7, barWidth = groupWidth / stimulus.series.length;
        x += -groupWidth / 2 + barWidth * (s + 0.5);
        if (p.y === 0) {
          // A real zero is not missing data. Keep its height honest and show a
          // label rather than fabricating a minimum-height bar.
          line(x - barWidth / 2, py(0), x + barWidth / 2, py(0));
          items.push({ type: 'text', x: x - 3, y: py(0) + (yAxis.max === 0 ? 14 : -6), text: '0', size: 11 });
        } else items.push({ type: 'rect', x: x - barWidth / 2, y: Math.min(py(p.y), py(0)), width: barWidth, height: Math.abs(py(p.y) - py(0)), fill: fills[s] });
      } else if (s % 2 === 0) items.push({ type: 'ellipse', x: x - 3, y: py(p.y) - 3, width: 6, height: 6, fill: fills[s] });
      else items.push({ type: 'rect', x: x - 3, y: py(p.y) - 3, width: 6, height: 6, fill: fills[s] });
      if (p.yError !== undefined) { const hi = py(p.y + p.yError), lo = py(p.y - p.yError); line(x, hi, x, lo); line(x - 5, hi, x + 5, hi); line(x - 5, lo, x + 5, lo); }
    }
    // Always provide a key, including single-series data and fit explanations.
    if (stimulus.graphType === 'bar') items.push({ type: 'rect', x: left, y: y + 3, width: 22, height: 10, fill: fills[s] });
    else {
      if (stimulus.graphType === 'line') line(left, y + 8, left + 24, y + 8, s % 2 === 1);
      items.push({ type: s % 2 === 0 ? 'ellipse' : 'rect', x: left + 9, y: y + 5, width: 6, height: 6, fill: fills[s] });
    }
    y = addText(items, series.name, left + 32, y + 12, 510, 12) + 4;
    if (series.trendPoints) y = addText(items, 'Dashed line: supplied trend line', left + 32, y, 510, 12) + 4;
  });
  if (stimulus.errorDescription) y = addText(items, stimulus.errorDescription, left, y + 10, 535, 12);
  return [...panels, { width: W, height: y + 14, items }];
}
