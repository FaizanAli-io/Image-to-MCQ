import { scientificText } from '@/lib/scientific-text';
import type { QuizStimulus as Stimulus } from '@/lib/stimulus-types';
import { layoutStimulus } from '@/lib/stimulus-layout';

export default function QuizStimulus({ stimulus, number }: { stimulus: Stimulus; number?: number }) {
  return (
    <figure className="my-4 rounded-lg border-2 border-gray-600 bg-white p-4 text-gray-900">
      <figcaption className="mb-2 font-semibold">{number ? `Stimulus ${number}: ` : ''}{scientificText(stimulus.title)}</figcaption>
      {layoutStimulus(stimulus).map((panel, index) => (
        <svg key={index} viewBox={`0 0 ${panel.width} ${panel.height}`} className="block h-auto w-full" role="img" aria-label={`${stimulus.title}${index ? ' continued' : ''}`}>
          {panel.items.map((item, i) => {
            if (item.type === 'text') return <text key={i} x={item.x} y={item.y} fontFamily="Arial, sans-serif" fontSize={item.size} fontWeight={item.bold ? 'bold' : 'normal'} fill="#111" transform={item.rotate ? `rotate(-90 ${item.x} ${item.y})` : undefined}>{scientificText(item.text)}</text>;
            if (item.type === 'line') return <line key={i} x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke="#444" strokeWidth={1.2} strokeDasharray={item.dash ? '4 4' : undefined} />;
            if (item.type === 'ellipse') return <ellipse key={i} cx={item.x + item.width / 2} cy={item.y + item.height / 2} rx={item.width / 2} ry={item.height / 2} fill={item.fill || 'none'} stroke="#333" />;
            return <rect key={i} x={item.x} y={item.y} width={item.width} height={item.height} fill={item.fill || 'none'} stroke="#333" />;
          })}
        </svg>
      ))}
    </figure>
  );
}
