export interface StimulusAxis {
  label: string;
  units: string;
  min: number;
  max: number;
  tickStep: number;
}

export interface PlotPoint { x: number; y: number; yError?: number }
export interface PlotSeries {
  name: string;
  points: PlotPoint[];
  // Optional explicitly specified fit, never calculated or invented by the renderer.
  trendPoints?: PlotPoint[];
}

export type DiagramElement =
  | { type: 'line' | 'arrow'; x: number; y: number; x2: number; y2: number }
  | { type: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number; fill: 'none' | 'light' | 'dark' }
  | { type: 'label'; x: number; y: number; text: string };

interface StimulusBase { id: string; title: string; context?: string }
export type QuizStimulus = StimulusBase & (
  | { kind: 'graph'; graphType: 'line' | 'scatter' | 'bar'; xAxis: StimulusAxis; yAxis: StimulusAxis; series: PlotSeries[]; categories?: string[]; errorDescription?: string }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'text'; paragraphs: string[] }
  | { kind: 'diagram'; diagramType: 'apparatus' | 'geometry'; elements: DiagramElement[] }
);
