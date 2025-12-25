'use client';

import { QuizConfig } from '@/lib/types';

interface QuestionTypeSelectorProps {
  config: QuizConfig;
  onChange: (config: QuizConfig) => void;
}

export default function QuestionTypeSelector({ config, onChange }: QuestionTypeSelectorProps) {
  const getQuizDescription = () => {
    switch(config.quizType) {
      case 'retrieval':
        return { icon: '📚', title: 'Retrieval Quiz', desc: '30 MCQs across 3 topics', color: 'blue' };
      case 'mini':
        return { icon: '📝', title: 'Mini Quiz', desc: `${config.educationLevel === 'A-LEVEL' ? '24' : '19'} questions (AO1, AO2, AO3)`, color: 'purple' };
      case 'assignment':
        return { icon: '📋', title: 'Assignment', desc: '4 exam questions (40 marks)', color: 'indigo' };
      case 'application':
        return { icon: '🎯', title: 'Application Practice', desc: '12 questions in 3 tiers', color: 'green' };
      case 'marks-per-point':
        return { icon: '✍️', title: 'Marks Per Point', desc: '12 explanation questions', color: 'amber' };
      case 'specific':
        return { icon: '🎓', title: 'Specific Technique', desc: '12 focused practice questions', color: 'rose' };
      default:
        return { icon: '📚', title: '', desc: '', color: 'blue' };
    }
  };

  const quizInfo = getQuizDescription();

  return (
    <div className="space-y-5 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2.5">
          Education Level
        </label>
        <select
          value={config.educationLevel}
          onChange={(e) => onChange({ ...config, educationLevel: e.target.value as any })}
          className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150 text-gray-900 font-medium cursor-pointer hover:border-gray-300"
        >
          <option value="GCSE">🎓 GCSE</option>
          <option value="A-LEVEL">🎯 A-Level</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2.5">
          Quiz Type
        </label>
        <select
          value={config.quizType}
          onChange={(e) => onChange({ ...config, quizType: e.target.value as any })}
          className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150 text-gray-900 font-medium cursor-pointer hover:border-gray-300"
        >
          <option value="retrieval">📚 Retrieval Quiz</option>
          <option value="mini">📝 Mini Quiz</option>
          {/* COMMENTED OUT - Only Retrieval and Mini Quiz are active
          <option value="assignment">📋 Assignment</option>
          <option value="application">🎯 Application Practice</option>
          <option value="marks-per-point">✍️ Marks Per Point</option>
          <option value="specific">🎓 Specific Technique</option>
          */}
        </select>
      </div>

      <div className={`p-4 bg-gradient-to-br from-${quizInfo.color}-50 to-${quizInfo.color}-100 border-2 border-${quizInfo.color}-200 rounded-xl`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{quizInfo.icon}</span>
          <div className="flex-1">
            <h4 className={`text-sm font-bold text-${quizInfo.color}-900 mb-1`}>
              {quizInfo.title}
            </h4>
            <p className={`text-xs text-${quizInfo.color}-700 leading-relaxed`}>
              {quizInfo.desc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}