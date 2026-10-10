'use client';

import { GeneratedQuestion } from '@/lib/types';
import QuizStimulus from './QuizStimulus';

interface QuestionDisplayProps {
  questions: GeneratedQuestion[];
}

export default function QuestionDisplay({ questions }: QuestionDisplayProps) {
  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <div key={index} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-indigo-600 text-white rounded-full text-sm font-bold">
                  {index + 1}
                </div>
                <h3 className="text-base font-semibold text-gray-900">
                  Question {index + 1}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {question.type && (
                  <span className="px-3 py-1 bg-white border border-indigo-200 text-indigo-700 text-xs font-medium rounded-full">
                    {question.type.replace(/_/g, ' ')}
                  </span>
                )}
                {question.maxMarks && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                    {question.maxMarks} {question.maxMarks === 1 ? 'mark' : 'marks'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {question.stimuli?.map(stimulus => {
              const firstIndex = questions.findIndex(q => q.stimuli?.some(s => s.id === stimulus.id));
              return firstIndex === index
                ? <div key={stimulus.id} id={`stimulus-${stimulus.id}`} className="scroll-mt-24"><QuizStimulus stimulus={stimulus} /></div>
                : <p key={stimulus.id} className="mb-3 text-sm text-gray-700">Use <a href={`#stimulus-${stimulus.id}`} className="text-indigo-700 underline">{stimulus.title}</a> shown with Question {firstIndex + 1}.</p>;
            })}
            <p className="text-gray-800 leading-relaxed mb-4 text-base whitespace-pre-line">{question.text}</p>
            
            {question.type === "MULTIPLE_CHOICE" && question.options && (
              <div className="space-y-2.5">
                {question.options.map((option, optIndex) => (
                  <div
                    key={optIndex}
                    className="group relative p-4 rounded-lg border-2 bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-150"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-gray-300 text-gray-700">
                        {String.fromCharCode(65 + optIndex)}
                      </span>
                      <span className="flex-1 text-gray-800">{option}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {question.type === "TRUE_FALSE" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg border-2 text-center font-medium bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-150 text-gray-700">
                  True
                </div>
                <div className="p-4 rounded-lg border-2 text-center font-medium bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-150 text-gray-700">
                  False
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
