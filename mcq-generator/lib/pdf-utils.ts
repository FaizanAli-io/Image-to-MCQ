import type { MiniQuizPDFOptions } from './mini-quiz-export';
import { generateMiniQuizPDF } from './mini-quiz-pdf';
import jsPDF from 'jspdf';
import { GeneratedQuestion } from './types';

/**
 * Render a single line with superscripts, subscripts, and symbols
 */
function renderLineWithFormatting(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  normalSize: number,
  superSubSize: number
) {
  let currentX = x;
  let i = 0;
  
  // Set normal font
  doc.setFontSize(normalSize);
  
  while (i < text.length) {
    const char = text[i];
    
    // Check for superscript characters
    if (isSuperscript(char)) {
      const superChar = convertSuperscript(char);
      doc.setFontSize(superSubSize);
      doc.text(superChar, currentX, y - normalSize * 0.3); // Raise up
      currentX += doc.getTextWidth(superChar);
      doc.setFontSize(normalSize);
    }
    // Check for subscript characters  
    else if (isSubscript(char)) {
      const subChar = convertSubscript(char);
      doc.setFontSize(superSubSize);
      doc.text(subChar, currentX, y + normalSize * 0.2); // Lower down
      currentX += doc.getTextWidth(subChar);
      doc.setFontSize(normalSize);
    }
    // Handle special symbols
    else if (isSpecialSymbol(char)) {
      const symbol = convertSpecialSymbol(char);
      doc.text(symbol, currentX, y);
      currentX += doc.getTextWidth(symbol);
    }
    // Regular character
    else {
      doc.text(char, currentX, y);
      currentX += doc.getTextWidth(char);
    }
    
    i++;
  }
}

/**
 * Check if character is a superscript
 */
function isSuperscript(char: string): boolean {
  const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ';
  return superscripts.includes(char);
}

/**
 * Check if character is a subscript
 */
function isSubscript(char: string): boolean {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎';
  return subscripts.includes(char);
}

/**
 * Check if character is a special symbol
 */
function isSpecialSymbol(char: string): boolean {
  const symbols = 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ°±×÷≤≥≠≈∞∑∏∫∂√π';
  return symbols.includes(char);
}

/**
 * Convert superscript to normal character
 */
function convertSuperscript(char: string): string {
  const map: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
    'ⁿ': 'n'
  };
  return map[char] || char;
}

/**
 * Convert subscript to normal character
 */
function convertSubscript(char: string): string {
  const map: Record<string, string> = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')'
  };
  return map[char] || char;
}

/**
 * Convert special symbols (keep as-is, jsPDF handles most Unicode)
 */
function convertSpecialSymbol(char: string): string {
  // Most symbols can be rendered directly by jsPDF
  // Add specific conversions if needed
  const map: Record<string, string> = {
    '°': '°',  // degree symbol
    '±': '±',  // plus-minus
    '×': 'x',  // multiplication (fallback)
    '÷': '/',  // division (fallback)
    '≤': '<=', // less than or equal (fallback)
    '≥': '>=', // greater than or equal (fallback)
    '≠': '!=', // not equal (fallback)
    '≈': '~',  // approximately (fallback)
    '∞': 'infinity', // infinity (fallback)
    'π': 'pi', // pi (fallback)
    '√': 'sqrt' // square root (fallback)
  };
  return map[char] || char;
}

/**
 * Enhanced text preprocessing for scientific content
 */
function preprocessScientificText(text: string): string {
  let processed = text;
  
  // Convert common chemical formulas to proper format
  processed = processed
    // Water: H2O
    .replace(/H2O/g, 'H₂O')
    .replace(/H₂O/g, 'H₂O') // Ensure consistency
    
    // Carbon dioxide: CO2
    .replace(/CO2/g, 'CO₂')
    .replace(/CO₂/g, 'CO₂')
    
    // Oxygen: O2
    .replace(/O2(?![₀-₉])/g, 'O₂')
    
    // Nitrogen: N2
    .replace(/N2(?![₀-₉])/g, 'N₂')
    
    // Hydrogen: H2
    .replace(/H2(?![₀-₉])/g, 'H₂')
    
    // Chlorine: Cl2
    .replace(/Cl2/g, 'Cl₂')
    
    // Methane: CH4
    .replace(/CH4/g, 'CH₄')
    
    // Ammonia: NH3
    .replace(/NH3/g, 'NH₃')
    
    // Sulfuric acid: H2SO4
    .replace(/H2SO4/g, 'H₂SO₄')
    
    // Calcium carbonate: CaCO3
    .replace(/CaCO3/g, 'CaCO₃')
    
    // Sodium chloride: NaCl (no subscript needed)
    
    // Common ions
    .replace(/Ca2\+/g, 'Ca²⁺')
    .replace(/Mg2\+/g, 'Mg²⁺')
    .replace(/Na\+/g, 'Na⁺')
    .replace(/K\+/g, 'K⁺')
    .replace(/Cl-/g, 'Cl⁻')
    .replace(/OH-/g, 'OH⁻')
    .replace(/SO4 2-/g, 'SO₄²⁻')
    .replace(/CO3 2-/g, 'CO₃²⁻')
    
    // Mathematical expressions
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/\^4/g, '⁴')
    .replace(/\^5/g, '⁵')
    .replace(/\^6/g, '⁶')
    .replace(/\^7/g, '⁷')
    .replace(/\^8/g, '⁸')
    .replace(/\^9/g, '⁹')
    
    // Temperature
    .replace(/(\d+)\s*degrees?\s*C/gi, '$1°C')
    .replace(/(\d+)\s*°\s*C/g, '$1°C')
    
    // pH values
    .replace(/pH\s*(\d+)/g, 'pH $1')
    
    // Percentages
    .replace(/(\d+)\s*%/g, '$1%');
  
  return processed;
}

// Retrieval measures
// complete question blocks and checks page space before drawing every line.
function retrievalLines(doc: jsPDF, text: string, width: number): string[] {
  // Helvetica supports the micro sign, but not Greek mu or the Unicode minus.
  text = text.replace(/μ/g, 'µ').replace(/−/g, '-');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line + (line ? ' ' : '') + word;
    if (line && doc.getTextWidth(next) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawRetrievalLines(doc: jsPDF, lines: string[], x: number, y: number, margin: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - margin - 3) {
      doc.addPage();
      y = margin;
    }
    renderLineWithFormatting(doc, line, x, y, 11, 11 * 0.7);
    y += 11 * 0.8;
  }
  return y;
}

export function generatePDF(questions: GeneratedQuestion[], title: string = "Generated Quiz", options: MiniQuizPDFOptions = {}): jsPDF {
  if (questions.some(q => q.aoLevel)) return generateMiniQuizPDF(questions, options);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  // Original format for Retrieval Quiz
  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, yPosition);
  yPosition += lineHeight * 1.5;

  // Horizontal separator after title
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += lineHeight * 1.5;

  // Instructions
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Answer all questions in the spaces provided.", margin, yPosition);
  yPosition += lineHeight * 3;

  // Group questions by topic
  let currentTopic = "";
  let questionNumberInTopic = 0;

  // Questions
  questions.forEach((question, index) => {
    const questionLines = retrievalLines(doc, preprocessScientificText(question.text), pageWidth - margin * 2 - 10);
    const optionLines = (question.options ?? []).map((option, i) => retrievalLines(
      doc, `  ${String.fromCharCode(65 + i)}) ${preprocessScientificText(option)}`, pageWidth - margin * 2 - 15
    ));
    const newTopic = !!question.topic && question.topic !== currentTopic;
    const nextNumber = newTopic ? 1 : questionNumberInTopic + 1;
    const headingHeight = (newTopic ? (index > 0 ? lineHeight * 3.5 : 0) + lineHeight * 0.8 : 0)
      + (question.topic ? nextNumber === 1 ? lineHeight * 1.5 : nextNumber === 6 ? lineHeight * 3.5 : 0 : 0);
    const blockHeight = headingHeight + questionLines.length * 8.8 + 5
      + optionLines.reduce((height, lines) => height + lines.length * 8.8 + 2, 0) + lineHeight * 1.5;
    // Keep an ordinary MCQ together. Oversized blocks still paginate line by line.
    if (yPosition + blockHeight > pageHeight - margin && yPosition > margin) {
      doc.addPage();
      yPosition = margin;
    }

    // Add topic header when topic changes
    if (question.topic && question.topic !== currentTopic) {
      currentTopic = question.topic;
      questionNumberInTopic = 0;
      
      // Add extra spacing before new topic (except for first topic)
      if (index > 0) {
        yPosition += lineHeight * 2;
        
        // Horizontal separator before new topic
        doc.setLineWidth(0.3);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += lineHeight * 1.5;
      }
      
      // Topic title
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(currentTopic, margin, yPosition);
      yPosition += lineHeight * 0.8;
      
      // Reset to normal font
      doc.setFontSize(11);
    }

    questionNumberInTopic++;

    // Add AO1/AO2 label for retrieval quizzes (questions 1-5 are AO1, 6-10 are AO2)
    if (question.topic && questionNumberInTopic === 1) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("AO1 Questions", margin, yPosition);
      yPosition += lineHeight * 1.5;
      doc.setFontSize(11);
    } else if (question.topic && questionNumberInTopic === 6) {
      yPosition += lineHeight * 2;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("AO2 Questions", margin, yPosition);
      yPosition += lineHeight * 1.5;
      doc.setFontSize(11);
    }

    // Question number and text
    doc.setFont("helvetica", "bold");
    const questionNumber = `${index + 1}. `;
    doc.text(questionNumber, margin, yPosition);
    
    doc.setFont("helvetica", "normal");
    yPosition = drawRetrievalLines(doc, questionLines, margin + 8, yPosition, margin);

    // Options for MCQ
    if (question.type === "MULTIPLE_CHOICE" && question.options) {
      yPosition += 5;
      optionLines.forEach(lines => {
        yPosition = drawRetrievalLines(doc, lines, margin + 5, yPosition, margin) + 2;
      });
    }

    // Answer space
    if (question.type === "SHORT_ANSWER" || question.type === "LONG_ANSWER") {
      yPosition += 8;
      const lines = question.type === "LONG_ANSWER" ? 5 : 2;
      for (let i = 0; i < lines; i++) {
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += lineHeight;
      }
    }

    yPosition += lineHeight * 1.5;
  });

  return doc;
}

export function generateAnswerKey(questions: GeneratedQuestion[]): jsPDF {
  return appendAnswerKey(new jsPDF(), questions);
}

/** Reuse the existing question and answer layouts without changing answer mapping. */
export function generateRetrievalPDF(questions: GeneratedQuestion[], title?: string): jsPDF {
  const doc = generatePDF(questions, title);
  doc.addPage();
  return appendAnswerKey(doc, questions);
}

function appendAnswerKey(doc: jsPDF, questions: GeneratedQuestion[]): jsPDF {
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Answer Key", margin, yPosition);
  yPosition += lineHeight * 1.5;

  // Horizontal separator after title
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += lineHeight * 2;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  // Group questions by topic
  let currentTopic = "";
  let questionNumberInTopic = 0;

  questions.forEach((question, index) => {
    let answerText = `${index + 1}. `;

    if (question.type === "MULTIPLE_CHOICE" && question.correctAnswer !== undefined && question.options) {
      const letter = String.fromCharCode(65 + question.correctAnswer); // uppercase A, B, C, D
      const processedAnswer = preprocessScientificText(question.options[question.correctAnswer]);
      answerText += `${letter}) ${processedAnswer}`;
    } else if (question.type === "TRUE_FALSE" && question.correctAnswer !== undefined) {
      answerText += question.correctAnswer === 1 ? "True" : "False";
    } else {
      answerText += "[Open-ended answer]";
    }

    const lines = retrievalLines(doc, answerText, pageWidth - margin * 2);
    const newTopic = !!question.topic && question.topic !== currentTopic;
    const nextNumber = newTopic ? 1 : questionNumberInTopic + 1;
    const headingHeight = (newTopic ? (index > 0 ? lineHeight * 3.5 : 0) + lineHeight * 2 : 0)
      + (question.topic ? nextNumber === 1 ? lineHeight * 1.5 : nextNumber === 6 ? lineHeight * 3.5 : 0 : 0);
    if (yPosition + headingHeight + lines.length * 8.8 + 4 > doc.internal.pageSize.getHeight() - margin && yPosition > margin) {
      doc.addPage();
      yPosition = margin;
    }

    // Add topic header when topic changes
    if (question.topic && question.topic !== currentTopic) {
      currentTopic = question.topic;
      questionNumberInTopic = 0;
      
      // Add extra spacing before new topic (except for first topic)
      if (index > 0) {
        yPosition += lineHeight * 2;
        
        // Horizontal separator before new topic
        doc.setLineWidth(0.3);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += lineHeight * 1.5;
      }
      
      // Topic title
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(currentTopic, margin, yPosition);
      yPosition += lineHeight * 2;
      
      // Reset to normal font
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
    }

    questionNumberInTopic++;

    // Add AO1/AO2 section labels
    if (question.topic && questionNumberInTopic === 1) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("AO1 Questions:", margin, yPosition);
      yPosition += lineHeight * 1.5;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
    } else if (question.topic && questionNumberInTopic === 6) {
      yPosition += lineHeight * 2;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("AO2 Questions:", margin, yPosition);
      yPosition += lineHeight * 1.5;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
    }

    yPosition = drawRetrievalLines(doc, lines, margin, yPosition, margin) + 4;
  });

  return doc;
}
