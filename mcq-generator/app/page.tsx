'use client';

import { useState } from 'react';
import ImageUploader from '@/components/ImageUploader';
import QuestionTypeSelector from '@/components/QuestionTypeSelector';
import QuestionDisplay from '@/components/QuestionDisplay';
import LoadingSpinner from '@/components/LoadingSpinner';
import { GeneratedQuestion, QuizConfig } from '@/lib/types';
import { generatePDF, generateAnswerKey } from '@/lib/pdf-utils';
import { Download, FileText } from 'lucide-react';

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<File[] | File | null>(null);
  const [config, setConfig] = useState<QuizConfig>({
    questionCount: 10,
    questionType: 'MULTIPLE_CHOICE',
    educationLevel: 'GCSE',
    quizType: 'retrieval',
  });
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isMultipleImages = config.quizType === 'retrieval';

  const handleGenerate = async () => {
    if (!uploadedFiles) {
      setError(isMultipleImages ? 'Please upload 3 images (one for each topic)' : 'Please upload 1 image');
      return;
    }

    const filesArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
    
    if (isMultipleImages && filesArray.length !== 3) {
      setError('Retrieval Quiz requires exactly 3 images (Topic A, B, C)');
      return;
    }

    if (!isMultipleImages && filesArray.length !== 1) {
      setError('Mini Quiz requires exactly 1 image');
      return;
    }

    setLoading(true);
    setError('');
    setQuestions([]);

    try {
      if (config.quizType === 'retrieval') {
        // Use R2 workflow for retrieval quizzes (3 images)
        const formData = new FormData();
        filesArray.forEach((file) => {
          formData.append('images', file);
        });
        formData.append('educationLevel', config.educationLevel);

        const response = await fetch('/api/generate-questions-r2', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate questions');
        }

        const data = await response.json();
        setQuestions(data.questions);
      } else if (config.quizType === 'mini') {
        // Use Mini Quiz workflow (1 image)
        const formData = new FormData();
        formData.append('image', filesArray[0]);
        formData.append('educationLevel', config.educationLevel);

        const response = await fetch('/api/generate-mini-quiz', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate mini quiz');
        }

        const data = await response.json();
        setQuestions(data.questions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    const pdf = generatePDF(questions, `${config.educationLevel} ${config.quizType} Quiz`);
    pdf.save('quiz.pdf');
  };

  const handleDownloadAnswerKey = () => {
    const pdf = generateAnswerKey(questions);
    pdf.save('answer-key.pdf');
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Fixed Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <span className="text-xl">🎓</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">MCQ Generator</h1>
                <p className="text-xs text-slate-600">AI-Powered Quiz Creation</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Transform Your Study Materials Into<br />
            <span className="text-blue-600">Professional Quizzes in Seconds</span>
          </h2>
          <div className="flex items-center justify-center gap-4 mt-8 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📤</span>
              <span>Upload Image</span>
            </div>
            <span className="text-gray-400">→</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <span>AI Processing</span>
            </div>
            <span className="text-gray-400">→</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📥</span>
              <span>Download PDF</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          {/* Left Column - Image Upload (65%) */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-blue-600">📤</span>
                Upload Study Materials
              </h2>
              <ImageUploader 
                onImageUpload={setUploadedFiles} 
                multipleImages={isMultipleImages}
                maxImages={isMultipleImages ? 3 : 1}
              />
            </div>
            {isMultipleImages && (
              <div className="bg-blue-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">💡</span>
                  <div>
                    <p className="font-bold mb-2">Retrieval Quiz Requirements:</p>
                    <div className="space-y-1 text-sm opacity-95">
                      <p>• <strong>Topic A:</strong> Revised last week</p>
                      <p>• <strong>Topic B:</strong> Revised 2-3 weeks ago</p>
                      <p>• <strong>Topic C:</strong> Revised 4+ weeks ago</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!isMultipleImages && (
              <div className="bg-purple-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">📝</span>
                  <div>
                    <p className="font-bold mb-2">Mini Quiz Requirements:</p>
                    <div className="space-y-1 text-sm opacity-95">
                      <p>• Upload <strong>1 image</strong> of your study material</p>
                      <p>• AI will generate a comprehensive quiz</p>
                      <p>• Perfect for focused topic review</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Configuration (35%) */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-blue-600">⚙️</span>
                Quiz Configuration
              </h3>
              <QuestionTypeSelector config={config} onChange={setConfig} />
            </div>
            
            <button
              onClick={handleGenerate}
              disabled={!uploadedFiles || loading}
              className="w-full px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Generating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  🚀 Generate Questions
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-5 shadow-sm fade-in">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 mb-1">Something Went Wrong</h3>
                <p className="text-red-700 text-sm mb-3">{error}</p>
                <p className="text-xs text-red-600">Common issues: Image quality too low • Text not readable • API quota exceeded</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-8 bg-white rounded-xl shadow-xl p-12 border border-gray-200 text-center fade-in">
            <LoadingSpinner />
            <p className="mt-4 text-gray-700 font-medium">Analyzing your content with AI...</p>
            <p className="mt-2 text-sm text-gray-500">⏱️ This usually takes 10-15 seconds</p>
          </div>
        )}

        {/* Results */}
        {questions.length > 0 && !loading && (
          <div className="mt-8 fade-in">
            {/* Results Header Bar */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xl">✓</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {questions.length} Questions Generated Successfully
                    </h2>
                    <p className="text-sm text-gray-600">Your quiz is ready to download</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-all duration-150 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <Download className="w-4 h-4" />
                    Download Quiz PDF
                  </button>
                  {config.quizType === 'retrieval' && (
                    <button
                      onClick={handleDownloadAnswerKey}
                      className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all duration-150 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <FileText className="w-4 h-4" />
                      Download Answer Key
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <QuestionDisplay questions={questions} />
          </div>
        )}
      </div>
    </main>
  );
}