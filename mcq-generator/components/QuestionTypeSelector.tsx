'use client';

import { QuizConfig } from '@/lib/types';
import { miniQuizCounts } from '@/lib/mini-quiz-config';
import Image from 'next/image';

interface QuestionTypeSelectorProps {
  config: QuizConfig;
  onChange: (config: QuizConfig) => void;
}

export default function QuestionTypeSelector({ config, onChange }: QuestionTypeSelectorProps) {
  return <div className="space-y-5 text-[#090c64]">
    <div>
      <label htmlFor="qualification" className="block font-bold mb-2">Choose your qualification</label>
      <div className="relative">
      <Image src="/data/graduation-hat.png" alt="" width={28} height={28} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-7 w-7 object-contain" />
      <select id="qualification" value={config.educationLevel}
        onChange={e => onChange({ ...config, educationLevel: e.target.value as QuizConfig['educationLevel'] })}
        className="w-full rounded-xl border-2 pl-14 pr-4 py-3 bg-white font-semibold">
        <option value="GCSE">GCSE</option><option value="A-LEVEL">A-level</option>
      </select>
      </div>
    </div>
    <div>
      <label htmlFor="quiz-type" className="block font-bold mb-2">Choose quiz type</label>
      <div className="relative">
      <Image src="/data/pencil.png" alt="" width={28} height={28} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-7 w-7 object-contain" />
      <select id="quiz-type" value={config.quizType}
        onChange={e => onChange({ ...config, quizType: e.target.value as QuizConfig['quizType'] })}
        className="w-full rounded-xl border-2 pl-14 pr-4 py-3 bg-white font-semibold">
        <option value="mini">Mini Quiz</option><option value="retrieval">Retrieval Quiz</option>
      </select>
      </div>
    </div>
    <p className="text-sm text-slate-500">{config.quizType === 'mini' ? `${miniQuizCounts(config.educationLevel).total} written-answer questions across AO1, AO2 and AO3.` : '30 multiple-choice questions across 3 topics.'}</p>
  </div>;
}
