'use client';

import { useState, useEffect } from 'react';
import { Download, Beaker, Atom, FlaskConical, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

interface Question {
  question_id: string;
  text: string;
  mark_scheme?: string;
}

interface QuestionMapping {
  question_id: string;
  primary_topic: string | null;
  secondary_topic: string | null;
  reason: string;
  needs_review: boolean;
  review_reason: string | null;
}

export default function TopicMapperPage() {
  // Step 1: PDF Upload & Extraction
  const [pastPaperFile, setPastPaperFile] = useState<File | null>(null);
  const [markSchemeFile, setMarkSchemeFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  
  // Step 2: Questions & Topics
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  
  // Step 3: Mapping Results
  const [results, setResults] = useState<QuestionMapping[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [mapping, setMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  
  // Current step
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Load topics from public/data on mount
  useEffect(() => {
    const loadTopics = async () => {
      try {
        const response = await fetch('/data/topics_master.csv');
        const text = await response.text();
        const parsed = parseCSV(text);
        setTopics(parsed);
        setLoadingTopics(false);
      } catch (err) {
        console.error('Failed to load topics:', err);
        setExtractionError('Failed to load topics database');
        setLoadingTopics(false);
      }
    };
    
    loadTopics();
  }, []);

  // Parse CSV
  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj: any = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = values[i]?.trim() || '';
      });
      return obj;
    });
  };

  // Handle PDF file selection
  const handlePDFUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'pastPaper' | 'markScheme') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      setExtractionError('Please upload a PDF file');
      return;
    }
    
    if (type === 'pastPaper') {
      setPastPaperFile(file);
    } else {
      setMarkSchemeFile(file);
    }
    setExtractionError(null);
  };

  // Extract questions from PDFs
  const extractQuestions = async () => {
    if (!pastPaperFile || !markSchemeFile) {
      setExtractionError('Please upload both PDF files');
      return;
    }
    
    setExtracting(true);
    setExtractionError(null);
    
    try {
      const formData = new FormData();
      formData.append('pastPaper', pastPaperFile);
      formData.append('markScheme', markSchemeFile);
      
      const response = await fetch('/api/extract-questions', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Extraction failed');
      }
      
      const data = await response.json();
      setQuestions(data.questions);
      setCurrentStep(2);
    } catch (err: any) {
      setExtractionError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  // Run mapping
  const runMapping = async () => {
    if (!questions.length) {
      setMappingError('No questions to map');
      return;
    }
    
    if (!topics.length) {
      setMappingError('Topics database not loaded');
      return;
    }
    
    setMapping(true);
    setMappingError(null);
    
    try {
      const response = await fetch('/api/map-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, topics })
      });
      
      if (!response.ok) throw new Error('Mapping failed');
      
      const data = await response.json();
      setResults(data.results);
      setStats(data.stats);
      setCurrentStep(3);
    } catch (err: any) {
      setMappingError(err.message);
    } finally {
      setMapping(false);
    }
  };

  // Download extracted questions as JSON
  const downloadQuestionsJSON = () => {
    const json = JSON.stringify(questions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted_questions.json';
    a.click();
  };

  // Export mapping results as CSV
  const exportResults = () => {
    const csv = [
      'question_id,primary_topic,secondary_topic,reason,needs_review,review_reason',
      ...results.map(r => 
        `${r.question_id},${r.primary_topic || ''},${r.secondary_topic || ''},"${r.reason}",${r.needs_review},${r.review_reason || ''}`
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mapped_questions.csv';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header with Chemistry Theme */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Beaker className="w-12 h-12" />
              <Sparkles className="w-5 h-5 absolute -top-1 -right-1 text-yellow-300" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Chemistry AI Mapper</h1>
              <p className="text-blue-100 mt-1">PDF Extraction → Question Analysis → Topic Mapping</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg ${
                  currentStep >= step 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' 
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {currentStep > step ? <CheckCircle2 className="w-6 h-6" /> : step}
                </div>
                <div className="ml-4 flex-1">
                  <div className={`font-semibold ${currentStep >= step ? 'text-indigo-600' : 'text-gray-500'}`}>
                    {step === 1 && 'Upload PDFs'}
                    {step === 2 && 'Review Questions'}
                    {step === 3 && 'View Results'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {step === 1 && 'Past paper & mark scheme'}
                    {step === 2 && 'Extracted questions'}
                    {step === 3 && 'Topic mappings'}
                  </div>
                </div>
                {step < 3 && (
                  <div className={`h-1 w-full mx-4 ${currentStep > step ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Topics Database Status */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Atom className="w-6 h-6 text-purple-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Topics Database</h3>
                <p className="text-sm text-gray-600">GCSE Chemistry Specification</p>
              </div>
            </div>
            {loadingTopics ? (
              <span className="text-sm text-gray-500">Loading...</span>
            ) : topics.length > 0 ? (
              <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                ✓ {topics.length} topics loaded
              </span>
            ) : (
              <span className="px-4 py-2 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                ✗ Failed to load
              </span>
            )}
          </div>
        </div>
        
        {/* STEP 1: PDF Upload */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <FileText className="w-6 h-6 text-indigo-600" />
                Step 1: Upload PDF Files
              </h2>
              
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Past Paper Upload */}
                <div className="border-2 border-dashed border-indigo-300 rounded-xl p-6 bg-indigo-50/50 hover:bg-indigo-50 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handlePDFUpload(e, 'pastPaper')}
                    className="hidden"
                    id="past-paper-upload"
                  />
                  <label 
                    htmlFor="past-paper-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                      <FileText className="w-8 h-8 text-indigo-600" />
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      Past Paper PDF
                    </p>
                    <p className="text-sm text-gray-600 text-center mb-4">
                      Upload the exam questions PDF
                    </p>
                    {pastPaperFile && (
                      <div className="mt-4 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        ✓ {pastPaperFile.name}
                      </div>
                    )}
                  </label>
                </div>

                {/* Mark Scheme Upload */}
                <div className="border-2 border-dashed border-purple-300 rounded-xl p-6 bg-purple-50/50 hover:bg-purple-50 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handlePDFUpload(e, 'markScheme')}
                    className="hidden"
                    id="mark-scheme-upload"
                  />
                  <label 
                    htmlFor="mark-scheme-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-8 h-8 text-purple-600" />
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      Mark Scheme PDF
                    </p>
                    <p className="text-sm text-gray-600 text-center mb-4">
                      Upload the marking guide PDF
                    </p>
                    {markSchemeFile && (
                      <div className="mt-4 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        ✓ {markSchemeFile.name}
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <button
                onClick={extractQuestions}
                disabled={extracting || !pastPaperFile || !markSchemeFile}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {extracting ? (
                  <span className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    Extracting Questions from PDFs...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    <Sparkles className="w-5 h-5" />
                    Extract Questions with AI
                  </span>
                )}
              </button>

              {extractionError && (
                <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
                  <p className="text-red-800 font-medium">{extractionError}</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* STEP 2: Review Questions */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <FlaskConical className="w-6 h-6 text-indigo-600" />
                  Step 2: Review Extracted Questions
                </h2>
                <button
                  onClick={downloadQuestionsJSON}
                  className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
                  <Download size={20} />
                  Download JSON
                </button>
              </div>

              <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
                <p className="text-green-800 font-medium">
                  ✓ Successfully extracted {questions.length} questions from PDFs
                </p>
              </div>

              {/* Questions Preview Table */}
              <div className="mb-6 max-h-96 overflow-y-auto border rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">Question ID</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">Question Text</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">Has Mark Scheme</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {questions.slice(0, 10).map((q, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-sm font-semibold">{q.question_id}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-md truncate">{q.text}</td>
                        <td className="px-4 py-3">
                          {q.mark_scheme ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-red-600">✗</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {questions.length > 10 && (
                  <div className="p-3 bg-gray-50 text-center text-sm text-gray-600">
                    Showing 10 of {questions.length} questions
                  </div>
                )}
              </div>

              <button
                onClick={runMapping}
                disabled={mapping || !topics.length}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {mapping ? (
                  <span className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    Mapping to Topics...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    <Sparkles className="w-5 h-5" />
                    Map Questions to Topics
                  </span>
                )}
              </button>

              {mappingError && (
                <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
                  <p className="text-red-800 font-medium">{mappingError}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Results */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* Stats */}
            {stats && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Mapping Statistics</h2>
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="text-3xl font-bold mb-2">{stats.total}</div>
                    <div className="text-blue-100 text-sm font-medium">Total Questions</div>
                  </div>
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="text-3xl font-bold mb-2">{stats.dataManipulation}</div>
                    <div className="text-orange-100 text-sm font-medium">Data Manipulation</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="text-3xl font-bold mb-2">{stats.dualTopics}</div>
                    <div className="text-purple-100 text-sm font-medium">Dual Topics</div>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="text-3xl font-bold mb-2">{stats.needsReview}</div>
                    <div className="text-yellow-100 text-sm font-medium">Needs Review</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="text-3xl font-bold mb-2">{stats.cleanMappings}</div>
                    <div className="text-green-100 text-sm font-medium">Clean Mappings</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Results Table */}
            {results.length > 0 && (
              <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">Mapping Results</h2>
                  <button
                    onClick={exportResults}
                    className="flex items-center gap-2 bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors shadow-lg"
                  >
                    <Download size={20} />
                    Export CSV
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Question ID</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Primary Topic</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Secondary Topic</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {results.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm font-semibold text-gray-900">{r.question_id}</td>
                          <td className="px-6 py-4">
                            {r.primary_topic ? (
                              <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                                {r.primary_topic}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {r.secondary_topic ? (
                              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                                {r.secondary_topic}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {r.review_reason === 'calculation_detected' && (
                              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-bold">
                                DATA MANIP
                              </span>
                            )}
                            {r.review_reason === 'dual_topic' && (
                              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-bold">
                                DUAL TOPIC
                              </span>
                            )}
                            {!r.needs_review && r.primary_topic && (
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">
                                ✓ CLEAN
                              </span>
                            )}
                            {r.needs_review && !r.review_reason && (
                              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-bold">
                                ⚠ REVIEW
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 max-w-md">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
