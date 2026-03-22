'use client';

import { useState, useEffect } from 'react';
import { Download, Beaker, Atom, FlaskConical, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';

// Subject configuration
const SUBJECTS = {
  chemistry: {
    id: 'chemistry',
    name: 'Chemistry',
    csvFile: '/data/topics_master.csv',
    icon: 'beaker',
    gradient: 'from-blue-600 via-indigo-600 to-purple-600',
    bgGradient: 'from-blue-50 via-indigo-50 to-purple-50',
    activeColor: 'from-indigo-600 to-purple-600',
    ringColor: 'ring-indigo-200',
    textColor: 'text-indigo-600',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    stepActiveColor: 'from-indigo-600 to-purple-600',
    stepBarColor: 'bg-indigo-600',
    cardBorder: 'border-indigo-500 bg-indigo-50',
    cardHover: 'hover:border-indigo-500 hover:bg-indigo-50',
    uploadBorder: 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50',
    uploadIcon: 'bg-indigo-100 text-indigo-600',
    resetText: 'text-indigo-600 hover:bg-indigo-50',
    specLabel: 'GCSE Chemistry Specification',
    emoji: '⚗️',
  },
  biology: {
    id: 'biology',
    name: 'Biology',
    csvFile: '/data/topics_master_bio.csv',
    icon: 'microscope',
    gradient: 'from-green-600 via-emerald-600 to-teal-600',
    bgGradient: 'from-green-50 via-emerald-50 to-teal-50',
    activeColor: 'from-emerald-600 to-teal-600',
    ringColor: 'ring-emerald-200',
    textColor: 'text-emerald-600',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    stepActiveColor: 'from-emerald-600 to-teal-600',
    stepBarColor: 'bg-emerald-600',
    cardBorder: 'border-emerald-500 bg-emerald-50',
    cardHover: 'hover:border-emerald-500 hover:bg-emerald-50',
    uploadBorder: 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50',
    uploadIcon: 'bg-emerald-100 text-emerald-600',
    resetText: 'text-emerald-600 hover:bg-emerald-50',
    specLabel: 'GCSE Biology Specification',
    emoji: '🧬',
  },
  physics: {
    id: 'physics',
    name: 'Physics',
    csvFile: '/data/topics_master_phy.csv',
    icon: 'zap',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    bgGradient: 'from-orange-50 via-amber-50 to-yellow-50',
    activeColor: 'from-amber-500 to-orange-500',
    ringColor: 'ring-amber-200',
    textColor: 'text-amber-600',
    badgeColor: 'bg-amber-100 text-amber-800',
    stepActiveColor: 'from-amber-500 to-orange-500',
    stepBarColor: 'bg-amber-500',
    cardBorder: 'border-amber-500 bg-amber-50',
    cardHover: 'hover:border-amber-500 hover:bg-amber-50',
    uploadBorder: 'border-amber-300 bg-amber-50/50 hover:bg-amber-50',
    uploadIcon: 'bg-amber-100 text-amber-600',
    resetText: 'text-amber-600 hover:bg-amber-50',
    specLabel: 'GCSE Physics Specification',
    emoji: '⚡',
  },
} as const;

type SubjectKey = keyof typeof SUBJECTS;

interface Question {
  question_id: string;
  text: string;
  mark_scheme?: string;
}

interface QuestionMapping {
  question_id: string;
  primary_topic: string | null;
  topic_name: string;
  secondary_topic: string | null;
  reason: string;
  needs_review: boolean;
  review_reason: string | null;
}

export default function TopicMapperPage() {
  // Subject selection
  const [subject, setSubject] = useState<SubjectKey | null>(null);
  const subjectConfig = subject ? SUBJECTS[subject] : null;

  // Step 1: PDF Upload & Extraction
  const [pastPaperFile, setPastPaperFile] = useState<File | null>(null);
  const [markSchemeFile, setMarkSchemeFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  
  // Step 2: Questions & Topics
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  
  // Step 3: Mapping Results
  const [results, setResults] = useState<QuestionMapping[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [mapping, setMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  
  // Current step
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // Modal state for viewing full question
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  
  // Reset function to start over (keeps subject selection)
  const handleReset = () => {
    setPastPaperFile(null);
    setMarkSchemeFile(null);
    setExtracting(false);
    setExtractionError(null);
    setQuestions([]);
    setResults([]);
    setStats(null);
    setMapping(false);
    setMappingError(null);
    setCurrentStep(1);
  };

  // Full reset including subject
  const handleFullReset = () => {
    handleReset();
    setSubject(null);
    setTopics([]);
  };

  // Load topics when subject changes
  useEffect(() => {
    if (!subject) return;
    const loadTopics = async () => {
      setLoadingTopics(true);
      try {
        const response = await fetch(SUBJECTS[subject].csvFile);
        const text = await response.text();
        const parsed = parseCSV(text);
        setTopics(parsed);
      } catch (err) {
        console.error('Failed to load topics:', err);
        setExtractionError('Failed to load topics database');
      } finally {
        setLoadingTopics(false);
      }
    };
    loadTopics();
  }, [subject]);

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
      const response = await fetch('https://api.pastpaperpal.co.uk/api/map-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, topics })
      });
      
      if (!response.ok) throw new Error('Mapping failed');
      
      const data = await response.json();
      setResults(data.results);
      setStats(data.stats);
      setCurrentStep(3);
      
      // Automatically send email with Excel attachment
      await sendEmailWithExcel(data.results, data.stats);
      
    } catch (err: any) {
      setMappingError(err.message);
    } finally {
      setMapping(false);
    }
  };
  
  // Send email with Excel attachment
  const sendEmailWithExcel = async (mappingResults: QuestionMapping[], mappingStats: any) => {
    try {
      // ===== USE SAME NEW HORIZONTAL STRUCTURE FOR EMAIL =====
      
      // Helper function to parse question_id
      const parseQuestionId = (questionId: string): { main: number; sub: string } => {
        const match = questionId.match(/^Q?(\d+)([a-i]?)$/i);
        if (match) {
          return {
            main: parseInt(match[1], 10),
            sub: match[2]?.toLowerCase() || ''
          };
        }
        return { main: parseInt(questionId.replace(/\D/g, ''), 10) || 0, sub: '' };
      };
      
      // Group results by main question number
      const groupedByMain: { [key: number]: QuestionMapping[] } = {};
      
      mappingResults.forEach(result => {
        const { main } = parseQuestionId(result.question_id);
        if (!groupedByMain[main]) {
          groupedByMain[main] = [];
        }
        groupedByMain[main].push(result);
      });
      
      // Build Excel rows
      const excelRows: any[] = [];
      
      // Dynamically determine max sub-question letter from actual data
      let maxSubLetter = 'a';
      mappingResults.forEach(result => {
        const { sub } = parseQuestionId(result.question_id);
        if (sub && sub > maxSubLetter) {
          maxSubLetter = sub;
        }
      });
      
      // Generate sub-letters array up to the max found (e.g., if max is 'j', generate a-j)
      const subLetters: string[] = [];
      for (let i = 'a'.charCodeAt(0); i <= maxSubLetter.charCodeAt(0); i++) {
        subLetters.push(String.fromCharCode(i));
      }
      
      const sortedMainQuestions = Object.keys(groupedByMain)
        .map(k => parseInt(k, 10))
        .sort((a, b) => a - b);
      
      sortedMainQuestions.forEach(mainNum => {
        const subQuestions = groupedByMain[mainNum];
        
        const row: any = {
          'Question Number': mainNum,
          'Linked Questions': '',
          'Total Question Marks': 0
        };
        
        subLetters.forEach(letter => {
          row[letter] = '';
          row[`${letter}_marks`] = '';
        });
        
        let totalMarks = 0;
        
        subQuestions.forEach(subQ => {
          const { sub } = parseQuestionId(subQ.question_id);
          
          if (sub && subLetters.includes(sub)) {
            row[sub] = subQ.topic_name || '';
            
            const question = questions.find(q => q.question_id === subQ.question_id);
            let marks = 0;
            
            if (question) {
              const marksMatch = question.text.match(/\((\d+)\)|\[(\d+)\s*marks?\]/i) ||
                                question.mark_scheme?.match(/\((\d+)\)|\[(\d+)\s*marks?\]/i);
              if (marksMatch) {
                marks = parseInt(marksMatch[1] || marksMatch[2], 10) || 0;
              }
            }
            
            row[`${sub}_marks`] = marks;
            totalMarks += marks;
          }
        });
        
        row['Total Question Marks'] = totalMarks;
        excelRows.push(row);
      });
      
      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet([]);
      
      const headers = [
        'Question Number',
        'Linked Questions',
        'Total Question Marks'
      ];
      
      subLetters.forEach(letter => {
        headers.push(letter);
        headers.push('Marks for sub-question');
      });
      
      XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });
      
      excelRows.forEach((row, index) => {
        const rowData = [
          row['Question Number'],
          row['Linked Questions'],
          row['Total Question Marks']
        ];
        
        subLetters.forEach(letter => {
          rowData.push(row[letter] || '');
          rowData.push(row[`${letter}_marks`] || '');
        });
        
        XLSX.utils.sheet_add_aoa(worksheet, [rowData], { origin: `A${index + 2}` });
      });
      
      const colWidths = [
        { wch: 18 },
        { wch: 18 },
        { wch: 22 }
      ];
      
      subLetters.forEach(() => {
        colWidths.push({ wch: 35 });
        colWidths.push({ wch: 25 });
      });
      
      worksheet['!cols'] = colWidths;
      
      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Question Mappings');
      
      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      // Convert buffer to base64 for JSON transmission
      const base64Buffer = Buffer.from(excelBuffer).toString('base64');
      
      // Send email via API
      const emailResponse = await fetch('/api/send-excel-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excelBuffer: base64Buffer,
          filename: `mapped_questions_${subject || 'output'}.xlsx`,
          stats: mappingStats
        })
      });
      
      if (emailResponse.ok) {
        console.log('Email sent successfully');
      } else {
        const errorData = await emailResponse.json();
        console.error('Email sending failed:', errorData.error);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      // Don't throw - email is optional, mapping results are still available
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

  // Export mapping results as Excel
  const exportResults = () => {
    // ===== OLD EXCEL STRUCTURE (COMMENTED FOR SAFE REVERT) =====
    // const excelData = results.map(r => ({
    //   'Question ID': r.question_id,
    //   'Primary Topic': r.primary_topic || '',
    //   'Topic Name': r.topic_name || '',
    //   'Secondary Topic': r.secondary_topic || '',
    //   'Reason': r.reason,
    //   'Needs Review': r.needs_review ? 'Yes' : 'No',
    //   'Review Reason': r.review_reason || ''
    // }));
    // 
    // const worksheet = XLSX.utils.json_to_sheet(excelData);
    // 
    // worksheet['!cols'] = [
    //   { wch: 15 },  // Question ID
    //   { wch: 15 },  // Primary Topic
    //   { wch: 35 },  // Topic Name
    //   { wch: 15 },  // Secondary Topic
    //   { wch: 60 },  // Reason
    //   { wch: 12 },  // Needs Review
    //   { wch: 20 }   // Review Reason
    // ];
    // ===== END OLD EXCEL STRUCTURE =====
    
    // ===== NEW HORIZONTAL EXCEL STRUCTURE IMPLEMENTATION =====
    
    // Helper function to parse question_id into main number and sub-letter
    const parseQuestionId = (questionId: string): { main: number; sub: string } => {
      // Match patterns like Q1a, Q2b, 1a, 2b, etc.
      const match = questionId.match(/^Q?(\d+)([a-i]?)$/i);
      if (match) {
        return {
          main: parseInt(match[1], 10),
          sub: match[2]?.toLowerCase() || ''
        };
      }
      // Fallback: treat entire ID as main question
      return { main: parseInt(questionId.replace(/\D/g, ''), 10) || 0, sub: '' };
    };
    
    // Group results by main question number
    const groupedByMain: { [key: number]: QuestionMapping[] } = {};
    
    results.forEach(result => {
      const { main } = parseQuestionId(result.question_id);
      if (!groupedByMain[main]) {
        groupedByMain[main] = [];
      }
      groupedByMain[main].push(result);
    });
    
    // Build Excel rows
    const excelRows: any[] = [];
    
    // Dynamically determine max sub-question letter from actual data
    let maxSubLetter = 'a';
    results.forEach(result => {
      const { sub } = parseQuestionId(result.question_id);
      if (sub && sub > maxSubLetter) {
        maxSubLetter = sub;
      }
    });
    
    // Generate sub-letters array up to the max found (e.g., if max is 'j', generate a-j)
    const subLetters: string[] = [];
    for (let i = 'a'.charCodeAt(0); i <= maxSubLetter.charCodeAt(0); i++) {
      subLetters.push(String.fromCharCode(i));
    }
    
    // Sort main question numbers
    const sortedMainQuestions = Object.keys(groupedByMain)
      .map(k => parseInt(k, 10))
      .sort((a, b) => a - b);
    
    sortedMainQuestions.forEach(mainNum => {
      const subQuestions = groupedByMain[mainNum];
      
      // Create row object
      const row: any = {
        'Question Number': mainNum,
        'Linked Questions': '', // Leave blank as per requirements
        'Total Question Marks': 0
      };
      
      // Initialize all sub-question columns
      subLetters.forEach(letter => {
        row[letter] = '';
        row[`${letter}_marks`] = '';
      });
      
      // Fill in sub-question data
      let totalMarks = 0;
      
      subQuestions.forEach(subQ => {
        const { sub } = parseQuestionId(subQ.question_id);
        
        if (sub && subLetters.includes(sub)) {
          // Set topic name in the sub-letter column
          row[sub] = subQ.topic_name || '';
          
          // Extract marks from question text or mark_scheme
          // Look for patterns like (2), [3 marks], (4 marks), etc.
          const question = questions.find(q => q.question_id === subQ.question_id);
          let marks = 0;
          
          if (question) {
            const marksMatch = question.text.match(/\((\d+)\)|\[(\d+)\s*marks?\]/i) ||
                              question.mark_scheme?.match(/\((\d+)\)|\[(\d+)\s*marks?\]/i);
            if (marksMatch) {
              marks = parseInt(marksMatch[1] || marksMatch[2], 10) || 0;
            }
          }
          
          // Set marks in the column after the sub-letter column
          // We'll handle this by creating unique column names
          row[`${sub}_marks`] = marks;
          totalMarks += marks;
        }
      });
      
      row['Total Question Marks'] = totalMarks;
      excelRows.push(row);
    });
    
    // Create worksheet with proper column structure
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    
    // Build header row
    const headers = [
      'Question Number',
      'Linked Questions',
      'Total Question Marks'
    ];
    
    // Add sub-question columns (a, Marks for sub-question, b, Marks for sub-question, ...)
    subLetters.forEach(letter => {
      headers.push(letter);
      headers.push('Marks for sub-question');
    });
    
    // Add headers to worksheet
    XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });
    
    // Add data rows
    excelRows.forEach((row, index) => {
      const rowData = [
        row['Question Number'],
        row['Linked Questions'],
        row['Total Question Marks']
      ];
      
      // Add sub-question data
      subLetters.forEach(letter => {
        rowData.push(row[letter] || '');
        rowData.push(row[`${letter}_marks`] || '');
      });
      
      XLSX.utils.sheet_add_aoa(worksheet, [rowData], { origin: `A${index + 2}` });
    });
    
    // Set column widths
    const colWidths = [
      { wch: 18 },  // Question Number
      { wch: 18 },  // Linked Questions
      { wch: 22 }   // Total Question Marks
    ];
    
    // Add widths for sub-question columns
    subLetters.forEach(() => {
      colWidths.push({ wch: 35 });  // Topic name column
      colWidths.push({ wch: 25 });  // Marks column
    });
    
    worksheet['!cols'] = colWidths;
    
    // ===== END NEW HORIZONTAL EXCEL STRUCTURE =====
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Question Mappings');
    
    // Generate Excel file and trigger download
    XLSX.writeFile(workbook, `mapped_questions_${subject || 'output'}.xlsx`);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${subjectConfig ? subjectConfig.bgGradient : 'from-gray-50 to-gray-100'}`}>
      {/* Header */}
      <div className={`bg-gradient-to-r ${subjectConfig ? subjectConfig.gradient : 'from-gray-600 to-gray-700'} text-white shadow-lg transition-all duration-500`}>
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                {subject === 'biology' ? <FlaskConical className="w-12 h-12" /> :
                 subject === 'physics' ? <Atom className="w-12 h-12" /> :
                 <Beaker className="w-12 h-12" />}
                <Sparkles className="w-5 h-5 absolute -top-1 -right-1 text-yellow-300" />
              </div>
              <div>
                <h1 className="text-4xl font-bold">
                  {subjectConfig ? `${subjectConfig.name} AI Mapper` : 'AI Past Paper Mapper'}
                </h1>
                <p className="text-white/80 mt-1">PDF Extraction → Question Analysis → Topic Mapping</p>
              </div>
            </div>
            
            {/* Navigation and Reset Buttons */}
            <div className="flex items-center gap-3">
              <a
                href="/"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-semibold transition-all backdrop-blur-sm border border-white/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Home
              </a>
              
              {subject && currentStep > 1 && (
                <button
                  onClick={handleReset}
                  className={`flex items-center gap-2 bg-white ${subjectConfig?.resetText} px-4 py-2 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Start Over
                </button>
              )}

              {subject && (
                <button
                  onClick={handleFullReset}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-semibold transition-all border border-white/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Switch Subject
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">

        {/* SUBJECT SELECTOR - shown when no subject chosen */}
        {!subject && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Select a Subject</h2>
            <p className="text-gray-500 mb-10 text-lg">Choose the subject to start mapping past paper questions</p>
            <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
              {(Object.values(SUBJECTS) as typeof SUBJECTS[SubjectKey][]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubject(s.id as SubjectKey)}
                  className={`group relative flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border-2 border-gray-200 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 ${s.cardHover}`}
                >
                  <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <span className="text-4xl">{s.emoji}</span>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500 mt-1">{s.specLabel}</p>
                  </div>
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${s.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MAIN CONTENT - shown after subject is chosen */}
        {subject && subjectConfig && (
          <>
        {/* Step Indicator with Animation */}
        <div className="mb-8 bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-14 h-14 rounded-full font-bold text-lg transition-all duration-300 ${
                  currentStep >= step 
                    ? `bg-gradient-to-r ${subjectConfig.stepActiveColor} text-white shadow-lg scale-110` 
                    : 'bg-gray-200 text-gray-500'
                } ${currentStep === step ? `ring-4 ${subjectConfig.ringColor} animate-pulse` : ''}`}>
                  {currentStep > step ? <CheckCircle2 className="w-7 h-7" /> : step}
                </div>
                <div className="ml-4 flex-1">
                  <div className={`font-bold text-lg transition-colors ${currentStep >= step ? subjectConfig.textColor : 'text-gray-500'}`}>
                    {step === 1 && 'Upload PDFs'}
                    {step === 2 && 'Review Questions'}
                    {step === 3 && 'View Results'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {step === 1 && 'Past paper & mark scheme'}
                    {step === 2 && 'Extracted questions'}
                    {step === 3 && 'Topic mappings & email'}
                  </div>
                </div>
                {step < 3 && (
                  <div className={`h-1 w-full mx-4 ${currentStep > step ? subjectConfig.stepBarColor : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Topics Database Status */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Atom className={`w-6 h-6 ${subjectConfig.textColor}`} />
              <div>
                <h3 className="font-semibold text-gray-900">Topics Database</h3>
                <p className="text-sm text-gray-600">{subjectConfig.specLabel}</p>
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
                <FileText className={`w-6 h-6 ${subjectConfig.textColor}`} />
                Step 1: Upload PDF Files
              </h2>
              
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Past Paper Upload */}
                <div className={`border-2 border-dashed rounded-xl p-6 transition-colors ${subjectConfig.uploadBorder}`}>
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
                    <div className={`w-16 h-16 ${subjectConfig.uploadIcon} rounded-full flex items-center justify-center mb-4`}>
                      <FileText className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">Past Paper PDF</p>
                    <p className="text-sm text-gray-600 text-center mb-4">Upload the exam questions PDF</p>
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
                    <p className="text-lg font-semibold text-gray-900 mb-2">Mark Scheme PDF</p>
                    <p className="text-sm text-gray-600 text-center mb-4">Upload the marking guide PDF</p>
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
                className={`w-full bg-gradient-to-r ${subjectConfig.activeColor} text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]`}
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
                  <FlaskConical className={`w-6 h-6 ${subjectConfig.textColor}`} />
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
                className={`w-full bg-gradient-to-r ${subjectConfig.activeColor} text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]`}
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
                <div className={`bg-gradient-to-r ${subjectConfig.activeColor} px-8 py-6 flex justify-between items-center`}>
                  <h2 className="text-2xl font-bold text-white">Mapping Results</h2>
                  <button
                    onClick={exportResults}
                    className={`flex items-center gap-2 bg-white ${subjectConfig.textColor} px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors shadow-lg`}
                  >
                    <Download size={20} />
                    Export Excel
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Question ID</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Question Text</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Primary Topic</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Secondary Topic</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {results.map((r, i) => {
                        const question = questions.find(q => q.question_id === r.question_id);
                        const questionText = question?.text || 'N/A';
                        
                        return (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-mono text-sm font-semibold text-gray-900">{r.question_id}</td>
                            <td className="px-6 py-4 text-sm text-gray-700 max-w-lg">
                              <div 
                                className={`line-clamp-3 cursor-pointer hover:${subjectConfig.textColor} transition-colors`}
                                title="Click to view full question"
                                onClick={() => {
                                  setSelectedQuestion(question || null);
                                  setShowQuestionModal(true);
                                }}
                              >
                                {questionText}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {r.primary_topic ? (
                                <div className="flex flex-col gap-1">
                                  <span className={`px-3 py-1 ${subjectConfig.badgeColor} rounded-full text-sm font-medium`}>
                                    {r.primary_topic}
                                  </span>
                                  {r.topic_name && (
                                    <span className="text-xs text-gray-600">{r.topic_name}</span>
                                  )}
                                </div>
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
      
      {/* Question Detail Modal */}
      {showQuestionModal && selectedQuestion && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowQuestionModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-white" />
                <h3 className="text-2xl font-bold text-white">Question Details</h3>
              </div>
              <button
                onClick={() => setShowQuestionModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-8 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Question ID */}
              <div className="mb-6">
                <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Question ID</label>
                <p className="text-2xl font-mono font-bold text-indigo-600 mt-1">{selectedQuestion.question_id}</p>
              </div>
              
              {/* Question Text */}
              <div className="mb-6">
                <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Question Text</label>
                <div className="mt-2 p-6 bg-gray-50 rounded-xl border-2 border-gray-200">
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedQuestion.text}</p>
                </div>
              </div>
              
              {/* Mark Scheme */}
              {selectedQuestion.mark_scheme && (
                <div className="mb-6">
                  <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Mark Scheme</label>
                  <div className="mt-2 p-6 bg-green-50 rounded-xl border-2 border-green-200">
                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedQuestion.mark_scheme}</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="bg-gray-50 px-8 py-4 flex justify-end border-t">
              <button
                onClick={() => setShowQuestionModal(false)}
                className={`bg-gradient-to-r ${subjectConfig?.activeColor || 'from-indigo-600 to-purple-600'} text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
