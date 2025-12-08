import jsPDF from 'jspdf';
import { GeneratedQuestion } from './types';

export function generatePDF(questions: GeneratedQuestion[], title: string = "Generated Quiz"): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, yPosition);
  yPosition += lineHeight * 2;

  // Instructions
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Answer all questions in the spaces provided.", margin, yPosition);
  yPosition += lineHeight * 2;

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
      
      // Add spacing before new topic (except for first topic)
      if (index > 0) {
        yPosition += lineHeight;
      }
      
      // Topic title
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(currentTopic, margin, yPosition);
      yPosition += lineHeight * 1.5;
      
      // Reset to normal font
      doc.setFontSize(11);
    }

    questionNumberInTopic++;

    // Add AO1/AO2 label for retrieval quizzes (questions 1-5 are AO1, 6-10 are AO2)
    if (question.topic && questionNumberInTopic === 1) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text("AO1 Questions (Recall)", margin, yPosition);
      yPosition += lineHeight;
      doc.setFontSize(11);
    } else if (question.topic && questionNumberInTopic === 6) {
      yPosition += lineHeight * 0.5;
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text("AO2 Questions (Application)", margin, yPosition);
      yPosition += lineHeight;
      doc.setFontSize(11);
    }

    // Question number and text
    doc.setFont("helvetica", "bold");
    const questionNumber = `${index + 1}. `;
    doc.text(questionNumber, margin, yPosition);
    
    doc.setFont("helvetica", "normal");
    const questionText = doc.splitTextToSize(question.text, pageWidth - margin * 2 - 10);
    doc.text(questionText, margin + 8, yPosition);
    yPosition += questionText.length * lineHeight;

    // Options for MCQ
    if (question.type === "MULTIPLE_CHOICE" && question.options) {
      yPosition += 3;
      question.options.forEach((option, optIndex) => {
        const optionLabel = String.fromCharCode(97 + optIndex); // a, b, c, d (lowercase)
        const optionText = doc.splitTextToSize(`${optionLabel}) ${option}`, pageWidth - margin * 2 - 15);
        doc.text(optionText, margin + 5, yPosition);
        yPosition += optionText.length * lineHeight;
      });
    }

    // Answer space
    if (question.type === "SHORT_ANSWER" || question.type === "LONG_ANSWER") {
      yPosition += 5;
      const lines = question.type === "LONG_ANSWER" ? 5 : 2;
      for (let i = 0; i < lines; i++) {
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += lineHeight;
      }
    }

    yPosition += lineHeight;
  });

  return doc;
}

export function generateAnswerKey(questions: GeneratedQuestion[]): jsPDF {
  const doc = new jsPDF();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Answer Key", margin, yPosition);
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
      
      // Add spacing before new topic (except for first topic)
      if (index > 0) {
        yPosition += lineHeight * 1.5;
      }
      
      // Topic title
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(currentTopic, margin, yPosition);
      yPosition += lineHeight * 1.5;
      
      // Reset to normal font
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
    }

    questionNumberInTopic++;

    // Add AO1/AO2 section labels
    if (question.topic && questionNumberInTopic === 1) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text("AO1 Questions:", margin, yPosition);
      yPosition += lineHeight;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
    } else if (question.topic && questionNumberInTopic === 6) {
      yPosition += lineHeight * 0.5;
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text("AO2 Questions:", margin, yPosition);
      yPosition += lineHeight;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
    }

    let answerText = `${index + 1}. `;
    
    if (question.type === "MULTIPLE_CHOICE" && question.correctAnswer !== undefined && question.options) {
      const letter = String.fromCharCode(97 + question.correctAnswer); // lowercase a, b, c, d
      answerText += `${letter}) ${question.options[question.correctAnswer]}`;
    } else if (question.type === "TRUE_FALSE" && question.correctAnswer !== undefined) {
      answerText += question.correctAnswer === 1 ? "True" : "False";
    } else {
      answerText += "[Open-ended answer]";
    }

    const splitText = doc.splitTextToSize(answerText, 170);
    doc.text(splitText, margin, yPosition);
    yPosition += splitText.length * lineHeight + 2;
  });

  return doc;
}