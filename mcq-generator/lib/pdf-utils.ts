import { drawScientificLine, takeScientificLine } from './scientific-pdf';
import { miniQuizTitle, type MiniQuizPDFOptions } from './mini-quiz-export';
import jsPDF from 'jspdf';
import { GeneratedQuestion } from './types';
import { layoutStimulus } from './stimulus-layout';
import { drawStimulusPanel } from './stimulus-pdf';

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
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  // Check if this is a Mini Quiz (has aoLevel property)
  const isMiniQuiz = questions.some(q => q.aoLevel);
  
  if (isMiniQuiz) {
    // Mini Quiz Format

    
    // Read the generated section labels, including existing saved quizzes.
    const ao1Count = questions.filter(q => q.aoLevel === 'AO1').length;
    const ao2Count = questions.filter(q => q.aoLevel === 'AO2').length;
    const ao3Count = questions.filter(q => q.aoLevel === 'AO3').length;

    const contentWidth = pageWidth - margin * 2;
    let floatingImage: { page: number; bottom: number; left: number } | undefined;
    const ensureRoom = (height: number) => {
      if (yPosition + height > pageHeight - margin) { doc.addPage(); yPosition = margin; }
    };
    const writeAO3Text = (text: string, bold = false, indent = 0, size = 11) => {
      let rest = text;
      do {
        ensureRoom(size * 0.55);
        const besideImage = floatingImage && floatingImage.page === doc.getNumberOfPages() && yPosition - 4 < floatingImage.bottom;
        const width = besideImage ? floatingImage!.left - margin - indent - 7 : contentWidth - indent;
        const [line, remaining] = takeScientificLine(doc, rest, width, size, bold);
        drawScientificLine(doc, line, margin + indent, yPosition, size, bold);
        yPosition += size * 0.55;
        rest = remaining;
      } while (rest);
    };
    const pdfTitle = miniQuizTitle(questions, options.educationLevel);
    doc.setProperties({ title: pdfTitle });
    writeAO3Text(pdfTitle, true, 0, 16);
    yPosition += 6;
    if (questions.some(q => q.reviewStatus === 'recommended' || q.reviewStatus === 'unavailable')) {
      doc.setFontSize(10);
      doc.text('DRAFT - Review AO3 questions and answers before use.', margin, yPosition);
      yPosition += lineHeight * 2;
    }

    // AO1 Section
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`AO1 – Remember & Understand (${ao1Count} questions)`, margin, yPosition);
    yPosition += lineHeight * 1.5;

    // AO1 Questions
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    questions.slice(0, ao1Count).forEach((question, index) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      const questionText = `${index + 1}. ${question.text} [${question.maxMarks} marks]`;
      writeAO3Text(questionText);
      yPosition += 5;
    });

    yPosition += lineHeight;

    // AO2 Section
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = margin;
    }
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`AO2 – Apply & Analyse (${ao2Count} questions)`, margin, yPosition);
    yPosition += lineHeight * 1.5;

    // AO2 Questions
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    questions.slice(ao1Count, ao1Count + ao2Count).forEach((question, index) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      const questionText = `${index + ao1Count + 1}. ${question.text} [${question.maxMarks} marks]`;
      writeAO3Text(questionText);
      yPosition += 5;
    });

    yPosition += lineHeight;

    // Draw shared evidence once in the document, then reference its actual pages.
    const stimulusPages = new Map<string, { first: number; last: number; figure: number }>();
    questions.slice(ao1Count + ao2Count, ao1Count + ao2Count + ao3Count).forEach((question, index) => {
      const number = question.questionNumber || index + ao1Count + ao2Count + 1;
      doc.setFontSize(11);
      const questionText = `${number}. ${question.text} [${question.maxMarks} marks]`;
      const questionHeight = doc.splitTextToSize(questionText, contentWidth).length * 6 + 8;
      const evidence = (question.stimuli || []).map(stimulus => ({ stimulus, panels: layoutStimulus(stimulus) }));
      const evidenceHeight = evidence.reduce((sum, e) => stimulusPages.has(e.stimulus.id)
        ? sum + 12
        : sum + e.panels.reduce((h, p) => h + p.height * contentWidth / p.width + 16, 0), 0);
      if (index === 0) {
        const firstPanel = evidence[0]?.panels[0];
        const firstBlock = firstPanel ? firstPanel.height * contentWidth / firstPanel.width + 18 + Math.min(questionHeight, 30) : questionHeight;
        const group = evidenceHeight + questionHeight;
        ensureRoom((group < pageHeight - margin * 2 - 20 ? group : firstBlock) + 20);
        writeAO3Text(`AO3 – Analyse, Interpret & Evaluate (${ao3Count} questions)`, true, 0, 12);
        yPosition += 4;
      }
      // Keep ordinary-sized stimulus/question groups together.
      if (evidenceHeight + questionHeight < pageHeight - margin * 2) ensureRoom(evidenceHeight + questionHeight);
      else ensureRoom(Math.min(questionHeight + 20, 60));
      for (const { stimulus, panels } of evidence) {
        const previous = stimulusPages.get(stimulus.id);
        if (previous) {
          const pages = previous.first === previous.last ? `page ${previous.first}` : `pages ${previous.first}-${previous.last}`;
          writeAO3Text(`Use Stimulus ${previous.figure}: ${stimulus.title} (${pages}).`);
          continue;
        }
        const figure = stimulusPages.size + 1;
        let lastPanelPage: number | undefined;
        panels.forEach((panel, panelIndex) => {
          const height = panel.height * contentWidth / panel.width;
          const reserve = panelIndex === panels.length - 1 ? Math.min(questionHeight, 30) : 0;
          ensureRoom(height + 18 + reserve);
          if (lastPanelPage !== doc.getNumberOfPages()) {
            writeAO3Text(`Stimulus ${figure}: ${stimulus.title}${panelIndex ? ' (continued)' : ''}`, true);
            yPosition += 2;
          }
          yPosition += drawStimulusPanel(doc, panel, margin, yPosition, contentWidth) + 8;
          lastPanelPage = doc.getNumberOfPages();
          stimulusPages.set(stimulus.id, { first: stimulusPages.get(stimulus.id)?.first ?? doc.getNumberOfPages(), last: doc.getNumberOfPages(), figure });
        });
      }
      writeAO3Text(questionText);
      yPosition += 8;
    });

    // Add Student-Friendly Mark Scheme
    yPosition += lineHeight * 2;
    
    // Always start mark scheme on a new page for better visibility
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Student-Friendly Mark Scheme", margin, yPosition);
    yPosition += lineHeight * 2;

    // Get mark scheme from first question (they all have the same mark scheme)
    const markScheme = questions[0]?.markScheme;
    
    if (markScheme) {
      const sections = [
        ['ao1', 'AO1 – Remember & Understand'],
        ['ao2', 'AO2 – Apply & Analyse'],
        ['ao3', 'AO3 – Analyse, Interpret & Evaluate'],
      ] as const;
      for (const [key, heading] of sections) {
        const image = options.images?.[key];
        if (image) {
          const properties = doc.getImageProperties(image);
          const width = 55, height = width * properties.height / properties.width;
          ensureRoom(height + 8);
          const top = yPosition - 4, left = pageWidth - margin - width;
          doc.addImage(image, 'PNG', left, top, width, height, key, 'FAST');
          floatingImage = { page: doc.getNumberOfPages(), bottom: top + height, left };
        } else { ensureRoom(35); }
        writeAO3Text(heading, true, 0, 12);
        yPosition += 4;
        const entries: { questionNumber: number; markPoints: string[]; reasoningToLearn?: string }[] = markScheme[key] || [];
        for (const item of entries) {
          ensureRoom(25);
          const question = questions.find(q => q.questionNumber === item.questionNumber);
          writeAO3Text(`Q${item.questionNumber}${question ? ` (${question.maxMarks} marks)` : ''}`, true);
          yPosition += 1;
          // Paginate every point in all three sections, so long answers cannot disappear off-page.
          item.markPoints?.forEach(point => writeAO3Text(`- ${point}`, false, 5));
          if (item.reasoningToLearn) {
            yPosition += 2;
            writeAO3Text(`Reasoning to learn: ${item.reasoningToLearn}`, false, 5);
          }
          yPosition += 6;
        }
        if (floatingImage?.page === doc.getNumberOfPages()) yPosition = Math.max(yPosition, floatingImage.bottom + 6);
        floatingImage = undefined;
        yPosition += lineHeight;
      }
    }

    return doc;
  }

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
  const doc = new jsPDF();
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
