'use client';

import { useEffect, useRef, useState } from 'react';
import { pollMiniQuiz, MiniQuizJobError, PENDING_MINI_QUIZ, forgetPendingMiniQuiz } from '@/lib/mini-quiz-poll';
import ImageUploader from '@/components/ImageUploader';
import QuestionTypeSelector from '@/components/QuestionTypeSelector';
import QuestionDisplay from '@/components/QuestionDisplay';
import LoadingSpinner from '@/components/LoadingSpinner';
import { GeneratedQuestion, QuizConfig } from '@/lib/types';
import { generatePDF, generateRetrievalPDF } from '@/lib/pdf-utils';
import { loadMiniQuizImages, miniQuizFilename } from '@/lib/mini-quiz-export';
import { retrievalQuizFilename } from '@/lib/retrieval-export';
import { Download, BookOpen, Rocket } from 'lucide-react';
import Image from 'next/image';
import QuizGuide from '@/components/QuizGuide';

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<File[] | File | null>(null);
  const [retrievalPages, setRetrievalPages] = useState<File[][]>([[], [], []]);
  const [config, setConfig] = useState<QuizConfig>({
    questionCount: 10,
    questionType: 'MULTIPLE_CHOICE',
    educationLevel: 'GCSE',
    quizType: 'mini',
  });
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');

  const [generationProgress, setGenerationProgress] = useState('');
  const polling = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    polling.current = controller;
    let id: string | null = null;
    try { id = localStorage.getItem(PENDING_MINI_QUIZ); } catch { /* Storage can be disabled. */ }
    if (id && /^[a-f0-9]{64}$/.test(id)) {
      setLoading(true);
      void pollMiniQuiz(id, controller.signal, setGenerationProgress).then(result => {
        if (controller.signal.aborted) return;
        setQuestions(result);
        setConfig(previous => ({ ...previous, quizType: 'mini', educationLevel: result[0]?.educationLevel || previous.educationLevel }));
        forgetPendingMiniQuiz(id!);
      }).catch(err => {
        if (controller.signal.aborted) return;
        setError(err.message);
        setErrorCode(err instanceof MiniQuizJobError ? err.code : '');
        if (err instanceof MiniQuizJobError && err.terminal) {
          forgetPendingMiniQuiz(id!);
        }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => { controller.abort(); polling.current?.abort(); };
  }, []);

  const isRetrieval = config.quizType === 'retrieval';
  const needsAO3Review = questions.some(q => q.reviewStatus === 'recommended' || q.reviewStatus === 'unavailable');

  const handleGenerate = async () => {
    let pendingJobId: string | undefined;
    setErrorCode('');
    if (!isRetrieval && !uploadedFiles) {
      setError(isRetrieval ? 'Please upload 3 images (one for each topic)' : 'Please upload 1 to 10 pages for one mini quiz');
      return;
    }

    const filesArray = isRetrieval ? retrievalPages.flat() : Array.isArray(uploadedFiles) ? uploadedFiles : uploadedFiles ? [uploadedFiles] : [];
    
    if (isRetrieval && retrievalPages.some(pages => pages.length < 1 || pages.length > 3)) {
      setError('Upload 1 to 3 pages for each topic (A, B and C).');
      return;
    }
    if (isRetrieval && filesArray.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
      setError('Retrieval images must total 50MB or less.');
      return;
    }

    if (!isRetrieval && (filesArray.length < 1 || filesArray.length > 10)) {
      setError('Mini Quiz requires 1 to 10 pages for the same quiz');
      return;
    }

    setLoading(true);
    setGenerationProgress('Preparing your questions, evidence and mark scheme...');
    setError('');
    setQuestions([]);

    try {
      if (config.quizType === 'retrieval') {
        // Keep the pages for each topic together and in upload order.
        const formData = new FormData();
        filesArray.forEach((file) => {
          formData.append('images', file);
        });
        formData.append('topicPageCounts', JSON.stringify(retrievalPages.map(pages => pages.length)));
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
        setQuestions(data.questions.map((q: GeneratedQuestion) => ({ ...q, educationLevel: config.educationLevel })));
      } else if (config.quizType === 'mini') {
        // Use all supplied pages together in one Mini Quiz request
        const formData = new FormData();
        filesArray.forEach((file) => formData.append('images', file));
        formData.append('educationLevel', config.educationLevel);

        const response = await fetch('/api/generate-mini-quiz', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          setErrorCode(errorData.code || '');
          throw new Error(errorData.error || 'Failed to generate mini quiz');
        }

        const data = await response.json();
        if (response.status === 202 && typeof data.jobId === 'string') {
          pendingJobId = data.jobId;
          try { localStorage.setItem(PENDING_MINI_QUIZ, data.jobId); } catch {}
          polling.current?.abort();
          const controller = new AbortController();
          polling.current = controller;
          const result = await pollMiniQuiz(data.jobId, controller.signal, setGenerationProgress);
          setQuestions(result);
          forgetPendingMiniQuiz(data.jobId);
        } else {
          setQuestions(data.questions);
        }
      }
    } catch (err) {
      if (err instanceof MiniQuizJobError) {
        setErrorCode(err.code);
        if (err.terminal && pendingJobId) forgetPendingMiniQuiz(pendingJobId);
      }
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const mini = questions.some(q => q.aoLevel);
      const level = questions[0]?.educationLevel || config.educationLevel;
      const images = mini ? await loadMiniQuizImages() : undefined;
      const pdf = mini
        ? generatePDF(questions, `${level} ${config.quizType} Quiz`, { educationLevel: level, images })
        : generateRetrievalPDF(questions, `${level} retrieval Quiz`);
      pdf.save(mini ? miniQuizFilename(questions, level) : retrievalQuizFilename(questions, level));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not download the quiz PDF.');
    }
  };

  return (
    <main className="quiz-home min-h-screen bg-white">
      <header className="quiz-header">
        <a href="/" className="quiz-brand">Past Paper Pal<span>REVISION TOOLS · BY HI TUTORING</span></a>
        <a href="/topic-mapper" className="mapper-link"><BookOpen size={22} /> AI Mapper</a>
      </header>
      <section className="quiz-hero">
        <h1>Quiz Generator</h1>
        <p>Turn <strong>any</strong> revision resource into <strong>GCSE or A-level</strong> practice questions.</p>
        <div className="quiz-steps">
          {[
            { image: 'take_picture', title: 'Take a screenshot or photo' },
            { image: 'upload-image', title: 'Upload your image(s)' },
            { image: 'download-quiz', title: 'Download your quiz' },
          ].map(({ image, title }, i) => <div className="quiz-step" key={title}>
            <div className="step-picture"><Image src={`/data/${image}.png`} alt="" width={600} height={360} sizes="(max-width: 700px) 90vw, 30vw" /></div>
            <h2><span>{i + 1}</span>{title}</h2>
          </div>)}
        </div>
        <a href="#quiz-setup" className="create-quiz"><Rocket aria-hidden="true" /> Create quiz now</a>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        <div id="quiz-setup" className="quiz-setup grid lg:grid-cols-[1fr_400px] gap-6">
          {/* Left Column - Image Upload (65%) */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-blue-600">📤</span>
                Upload Study Materials
              </h2>
              {isRetrieval ? <div className="space-y-6">
                <p className="text-sm text-gray-600">Upload 1–3 pages per topic. Up to 10MB per image and 50MB in total.</p>
                {['A', 'B', 'C'].map((label, index) => <div key={label}>
                  <h3 className="font-semibold text-gray-900 mb-2">Topic {label}</h3>
                  <ImageUploader multipleImages maxImages={3} imageLabels="pages" topicLabel={`Topic ${label}`}
                    onImageUpload={files => setRetrievalPages(previous => previous.map((pages, i) => i === index ? (Array.isArray(files) ? files : [files]) : pages))} />
                </div>)}
              </div> : <ImageUploader 
                onImageUpload={setUploadedFiles} 
                key={config.quizType}
                multipleImages
                imageLabels={isRetrieval ? 'topics' : 'pages'}
                maxImages={isRetrieval ? 3 : 10}
              />}
            </div>
            {isRetrieval && (
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
            {!isRetrieval && (
              <div className="bg-purple-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">📝</span>
                  <div>
                    <p className="font-bold mb-2">Mini Quiz Requirements:</p>
                    <div className="space-y-1 text-sm opacity-95">
                      <p>• Upload <strong>1 to 10 pages</strong> of your study material for one quiz</p>
                      <p>• Complete questions to practice revised content</p>
                      <p>• Self mark to assess how effective your revision was</p>
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
                Quiz Settings
              </h3>
              <QuestionTypeSelector config={config} onChange={(nextConfig) => {
                if (nextConfig.quizType !== config.quizType) {
                  setUploadedFiles(null);
                  setRetrievalPages([[], [], []]);
                  setQuestions([]);
                  setError('');
                }
                setConfig(nextConfig);
              }} />
            </div>
            
            <button
              onClick={handleGenerate}
              disabled={(isRetrieval ? retrievalPages.some(pages => pages.length === 0) : !uploadedFiles) || loading}
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
                  🚀 Generate Quiz
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
                <p className="text-xs text-red-600">{errorCode === 'INVALID_AO3_EVIDENCE'
                  ? 'The generated quiz could not be completed. If this repeats, share the message above with support.'
                  : 'Check the message above and try again. If the problem continues, share the error with support.'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-8 bg-white rounded-xl shadow-xl p-12 border border-gray-200 text-center fade-in">
            <LoadingSpinner />
            <p className="mt-4 text-gray-700 font-medium">Analyzing your content with AI...</p>
            <p className="mt-2 text-sm text-gray-500">{config.quizType === 'mini' ? generationProgress || 'Preparing your questions, evidence and mark scheme...' : '⏱️ This usually takes 10-15 seconds'}</p>
          </div>
        )}

        {/* Results */}
        {questions.length > 0 && !loading && (
          <div className="mt-8 fade-in">
            {needsAO3Review && (
              <div role="status" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
                <p className="font-semibold">Draft quiz — AO3 review recommended</p>
                <p className="mt-1 text-sm">The stimulus data passed validation. Check the AO3 questions and answers before using this quiz; the automatic quality review flagged concerns or could not finish.</p>
              </div>
            )}
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
                    <p className="text-sm text-gray-600">{needsAO3Review ? 'Your draft quiz is ready to review and download' : 'Your quiz is ready to download'}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-all duration-150 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <Download className="w-4 h-4" />
                    {needsAO3Review ? 'Download Draft Quiz PDF' : 'Download Quiz PDF'}
                  </button>
                </div>
              </div>
            </div>
            
            <QuestionDisplay questions={questions} />
          </div>
        )}
        <QuizGuide />
      </div>
    </main>
  );
}
