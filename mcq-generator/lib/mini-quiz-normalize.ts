type Data = Record<string, unknown>;
const record = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;

/** Fix display arithmetic only. Never change measurements, errors, labels or answers. */
export function normalizeMiniQuizStimulus(value: unknown): unknown {
  if (!record(value) || value.kind !== 'graph' || !Array.isArray(value.series)) return value;
  const graph = { ...value };
  const allPoints: Data[] = [];
  for (const series of value.series) {
    if (!record(series) || !Array.isArray(series.points)) return value;
    const points = [...series.points, ...(Array.isArray(series.trendPoints) ? series.trendPoints : [])];
    for (const point of points) {
      if (!record(point) || !finite(point.x) || !finite(point.y)
        || (point.yError != null && (!finite(point.yError) || point.yError < 0))) return value;
      allPoints.push(point);
    }
  }
  if (!allPoints.length) return value;
  for (const key of ['xAxis', 'yAxis'] as const) {
    const axis = value[key];
    if (!record(axis) || !finite(axis.min) || !finite(axis.max) || axis.max <= axis.min) continue;
    // Category indices and their mapping must already be correct; do not guess.
    if (key === 'xAxis' && value.graphType === 'bar') continue;
    const lower = allPoints.map(p => key === 'xAxis' ? p.x as number : (p.y as number) - ((p.yError as number) || 0));
    const upper = allPoints.map(p => key === 'xAxis' ? p.x as number : (p.y as number) + ((p.yError as number) || 0));
    const min = Math.min(axis.min, ...lower, ...(key === 'yAxis' && value.graphType === 'bar' ? [0] : []));
    const max = Math.max(axis.max, ...upper, ...(key === 'yAxis' && value.graphType === 'bar' ? [0] : []));
    const intervals = finite(axis.tickStep) && axis.tickStep > 0 ? (max - min) / axis.tickStep : NaN;
    if (min === axis.min && max === axis.max && intervals >= 1 && intervals <= 12
      && Math.abs(intervals - Math.round(intervals)) <= 1e-6) continue;
    // Choose an outward, evenly spaced scale. This changes only the viewport;
    // in particular an error bar crossing zero remains intact and visible.
    const target = (max - min) / 8;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= target) ?? 10) * magnitude;
    const clean = (n: number) => Number(n.toPrecision(14));
    graph[key] = { ...axis, min: clean(Math.floor(min / step) * step), max: clean(Math.ceil(max / step) * step), tickStep: clean(step) };
  }
  return graph;
}
