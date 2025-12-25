import jsPDF from 'jspdf';
import { GeneratedQuestion } from './types';

/**
 * Enhanced text rendering with superscripts, subscripts, and symbols
 */
function renderFormattedText(
  doc: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  maxWidth: number,
  fontSize: number = 11
): { height: number; lines: number } {
  const originalFontSize = fontSize;
  const superSubSize = fontSize * 0.7; // 70% of original size
  const lineHeight = fontSize * 0.8;
  
  // Split text into manageable chunks for line wrapping
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  // Simple line wrapping (we'll enhance this for formatted text)
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = doc.getTextWidth(testLine);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // Render each line with formatting
  let currentY = y;
  
  lines.forEach(line => {
    renderLineWithFormatting(doc, line, x, currentY, originalFontSize, superSubSize);
    currentY += lineHeight;
  });
  
  return {
    height: lines.length * lineHeight,
    lines: lines.length
  };
}

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

/**
 * Render text with italic formatting support
 * Detects text between asterisks (*text*) and renders it in italics
 * Handles line wrapping while preserving italic formatting
 */
function renderTextWithItalics(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number = 11
): { height: number; lines: number } {
  const lineHeight = fontSize * 0.8;
  doc.setFontSize(fontSize);
  
  // Parse the text into segments with formatting info
  const segments = parseTextSegments(text);
  
  // Wrap text while preserving formatting
  const wrappedLines = wrapTextWithFormatting(doc, segments, maxWidth);
  
  // Render each line
  let currentY = y;
  wrappedLines.forEach(line => {
    renderFormattedLine(doc, line, x, currentY, fontSize);
    currentY += lineHeight;
  });
  
  return {
    height: wrappedLines.length * lineHeight,
    lines: wrappedLines.length
  };
}

/**
 * Parse text into segments with formatting information
 * Automatically adds bold "Explanation:" label before italic text
 */
function parseTextSegments(text: string): Array<{ text: string; isItalic: boolean; isBold: boolean }> {
  const segments: Array<{ text: string; isItalic: boolean; isBold: boolean }> = [];
  const parts = text.split(/(\*[^*]*\*)/);
  
  parts.forEach(part => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      // This is italic text - remove asterisks and add bold "Explanation:" label
      const italicText = part.slice(1, -1);
      
      // Check if it already starts with "Explanation:" to avoid duplication
      if (!italicText.toLowerCase().startsWith('explanation:')) {
        // Add bold "Explanation:" label followed by italic explanation text
        segments.push({ text: 'Explanation:', isItalic: false, isBold: true });
        segments.push({ text: ' ' + italicText, isItalic: true, isBold: false });
      } else {
        // If it already has "Explanation:", make just that part bold
        if (italicText.toLowerCase().startsWith('explanation:')) {
          segments.push({ text: 'Explanation:', isItalic: false, isBold: true });
          segments.push({ text: italicText.substring(12), isItalic: true, isBold: false }); // Remove "Explanation:" and add rest as italic
        } else {
          segments.push({ text: italicText, isItalic: true, isBold: false });
        }
      }
    } else if (part) {
      // This is normal text
      segments.push({ text: part, isItalic: false, isBold: false });
    }
  });
  
  return segments;
}

/**
 * Wrap text segments while preserving formatting
 */
function wrapTextWithFormatting(
  doc: jsPDF,
  segments: Array<{ text: string; isItalic: boolean; isBold: boolean }>,
  maxWidth: number
): Array<Array<{ text: string; isItalic: boolean; isBold: boolean }>> {
  const lines: Array<Array<{ text: string; isItalic: boolean; isBold: boolean }>> = [];
  let currentLine: Array<{ text: string; isItalic: boolean; isBold: boolean }> = [];
  let currentLineWidth = 0;
  
  segments.forEach(segment => {
    const words = segment.text.split(' ');
    
    words.forEach((word, wordIndex) => {
      if (wordIndex > 0) word = ' ' + word; // Add space back except for first word
      
      // Set font style to measure width correctly
      const fontStyle = segment.isBold ? "bold" : (segment.isItalic ? "italic" : "normal");
      doc.setFont("helvetica", fontStyle);
      const wordWidth = doc.getTextWidth(word);
      
      // Check if adding this word would exceed line width
      if (currentLineWidth + wordWidth > maxWidth && currentLine.length > 0) {
        // Start new line
        lines.push([...currentLine]);
        currentLine = [{ text: word.trim(), isItalic: segment.isItalic, isBold: segment.isBold }];
        currentLineWidth = doc.getTextWidth(word.trim());
      } else {
        // Add to current line
        if (currentLine.length > 0 && 
            currentLine[currentLine.length - 1].isItalic === segment.isItalic &&
            currentLine[currentLine.length - 1].isBold === segment.isBold) {
          // Merge with previous segment if same formatting
          currentLine[currentLine.length - 1].text += word;
        } else {
          // Add as new segment
          currentLine.push({ text: word.trim(), isItalic: segment.isItalic, isBold: segment.isBold });
        }
        currentLineWidth += wordWidth;
      }
    });
  });
  
  // Add the last line if it has content
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Render a line with mixed formatting (bold, italic, normal)
 */
function renderFormattedLine(
  doc: jsPDF,
  segments: Array<{ text: string; isItalic: boolean; isBold: boolean }>,
  x: number,
  y: number,
  fontSize: number
) {
  let currentX = x;
  doc.setFontSize(fontSize);
  
  segments.forEach((segment, index) => {
    // Add space before segment (except first)
    if (index > 0) {
      currentX += doc.getTextWidth(' ');
    }
    
    // Set appropriate font style
    const fontStyle = segment.isBold ? "bold" : (segment.isItalic ? "italic" : "normal");
    doc.setFont("helvetica", fontStyle);
    
    // Render the text
    doc.text(segment.text, currentX, y);
    
    // Update position
    currentX += doc.getTextWidth(segment.text);
  });
  
  // Reset to normal font
  doc.setFont("helvetica", "normal");
}

export function generatePDF(questions: GeneratedQuestion[], title: string = "Generated Quiz"): jsPDF {
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
    const topicName = questions[0]?.topic || "Mini Quiz";
    
    // Determine education level and question counts from the questions array
    const totalQuestions = questions.length;
    let ao1Count: number, ao2Count: number, ao3Count: number;
    let isGCSE = false;
    
    // Determine if this is GCSE or A-Level based on total questions
    if (totalQuestions === 19) {
      // GCSE
      isGCSE = true;
      ao1Count = 10;
      ao2Count = 6;
      ao3Count = 3;
    } else {
      // A-Level (24 questions)
      isGCSE = false;
      ao1Count = 8;
      ao2Count = 10;
      ao3Count = 6;
    }
    
    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`${topicName} – Mini Quiz`, margin, yPosition);
    yPosition += lineHeight * 2;

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

      const questionText = `${index + 1}. ${preprocessScientificText(question.text)}`;
      const questionResult = renderFormattedText(
        doc, 
        questionText, 
        margin, 
        yPosition, 
        pageWidth - margin * 2,
        11
      );
      yPosition += questionResult.height + 5;
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

      const questionText = `${index + ao1Count + 1}. ${preprocessScientificText(question.text)}`;
      const questionResult = renderFormattedText(
        doc, 
        questionText, 
        margin, 
        yPosition, 
        pageWidth - margin * 2,
        11
      );
      yPosition += questionResult.height + 5;
    });

    yPosition += lineHeight;

    // AO3 Section
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = margin;
    }
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`AO3 – Evaluate & Create (${ao3Count} questions)`, margin, yPosition);
    yPosition += lineHeight * 1.5;

    // AO3 Questions
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    questions.slice(ao1Count + ao2Count, ao1Count + ao2Count + ao3Count).forEach((question, index) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      const questionText = `${index + ao1Count + ao2Count + 1}. ${preprocessScientificText(question.text)}`;
      const questionResult = renderFormattedText(
        doc, 
        questionText, 
        margin, 
        yPosition, 
        pageWidth - margin * 2,
        11
      );
      yPosition += questionResult.height + 5;
    });

    yPosition += lineHeight;

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
      // AO1 Mark Scheme
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("AO1 – Remember & Understand", margin, yPosition);
      yPosition += lineHeight * 1.5;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      
      if (markScheme.ao1 && Array.isArray(markScheme.ao1)) {
        markScheme.ao1.forEach((item: any) => {
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = margin;
          }
          
          doc.setFont("helvetica", "bold");
          doc.text(`Q${item.questionNumber}`, margin, yPosition);
          doc.setFont("helvetica", "normal");
          
          if (item.markPoints && Array.isArray(item.markPoints)) {
            item.markPoints.forEach((point: string) => {
              const pointText = `• ${point}`;
              // Use simple text rendering for mark scheme to avoid character encoding issues
              const textWidth = doc.getTextWidth(pointText);
              const maxWidth = pageWidth - margin * 2 - 15;
              
              if (textWidth > maxWidth) {
                // Simple line wrapping for long text
                const words = pointText.split(' ');
                let currentLine = '';
                
                words.forEach(word => {
                  const testLine = currentLine + (currentLine ? ' ' : '') + word;
                  if (doc.getTextWidth(testLine) > maxWidth && currentLine) {
                    doc.text(currentLine, margin + 10, yPosition);
                    yPosition += 6;
                    currentLine = word;
                  } else {
                    currentLine = testLine;
                  }
                });
                
                if (currentLine) {
                  doc.text(currentLine, margin + 10, yPosition);
                  yPosition += 6;
                }
              } else {
                doc.text(pointText, margin + 10, yPosition);
                yPosition += 6;
              }
            });
          }
          yPosition += 3;
        });
      }

      yPosition += lineHeight;

      // AO2 Mark Scheme
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("AO2 – Apply & Analyse", margin, yPosition);
      yPosition += lineHeight * 1.5;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      
      if (markScheme.ao2 && Array.isArray(markScheme.ao2)) {
        markScheme.ao2.forEach((item: any) => {
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = margin;
          }
          
          doc.setFont("helvetica", "bold");
          doc.text(`Q${item.questionNumber}`, margin, yPosition);
          doc.setFont("helvetica", "normal");
          
          if (item.markPoints && Array.isArray(item.markPoints)) {
            item.markPoints.forEach((point: string) => {
              const pointText = `• ${point}`;
              // Use italic-aware text rendering for AO2 mark scheme
              const textResult = renderTextWithItalics(
                doc,
                pointText,
                margin + 10,
                yPosition,
                pageWidth - margin * 2 - 15,
                11
              );
              yPosition += textResult.height + 2;
            });
          }
          yPosition += 3;
        });
      }

      yPosition += lineHeight;

      // AO3 Mark Scheme
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("AO3 – Evaluate & Create", margin, yPosition);
      yPosition += lineHeight * 1.5;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      
      if (markScheme.ao3 && Array.isArray(markScheme.ao3)) {
        markScheme.ao3.forEach((item: any) => {
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = margin;
          }
          
          doc.setFont("helvetica", "bold");
          doc.text(`Q${item.questionNumber}`, margin, yPosition);
          doc.setFont("helvetica", "normal");
          
          if (item.markPoints && Array.isArray(item.markPoints)) {
            item.markPoints.forEach((point: string) => {
              const pointText = `• ${point}`;
              // Use italic-aware text rendering for AO3 mark scheme
              const textResult = renderTextWithItalics(
                doc,
                pointText,
                margin + 10,
                yPosition,
                pageWidth - margin * 2 - 15,
                11
              );
              yPosition += textResult.height + 2;
            });
          }
          yPosition += 3;
        });
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
    // Check if we need a new page
    if (yPosition > pageHeight - 60) {
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
    const processedQuestionText = preprocessScientificText(question.text);
    const questionResult = renderFormattedText(
      doc, 
      processedQuestionText, 
      margin + 8, 
      yPosition, 
      pageWidth - margin * 2 - 10,
      11
    );
    yPosition += questionResult.height;

    // Options for MCQ
    if (question.type === "MULTIPLE_CHOICE" && question.options) {
      yPosition += 5;
      question.options.forEach((option, optIndex) => {
        const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, D (uppercase)
        const processedOption = preprocessScientificText(option);
        const optionResult = renderFormattedText(
          doc,
          `  ${optionLabel}) ${processedOption}`,
          margin + 5,
          yPosition,
          pageWidth - margin * 2 - 15,
          11
        );
        yPosition += optionResult.height + 2;
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
    if (yPosition > 270) {
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

    const answerResult = renderFormattedText(
      doc,
      answerText,
      margin,
      yPosition,
      170,
      11
    );
    yPosition += answerResult.height + 4;
  });

  return doc;
}