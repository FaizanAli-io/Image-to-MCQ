# 🎓 AI-Powered MCQ Generator

Transform your study materials into professional quizzes in seconds using AI vision technology.

## 📋 Overview

The MCQ Generator is a modern web application that uses AI to automatically generate high-quality multiple-choice questions, assignments, and various quiz types from uploaded images of textbook pages, revision guides, or study materials. Built specifically for GCSE and A-Level education standards.

## ✨ Key Features

### 🤖 AI-Powered Question Generation
- **Vision AI Integration**: Analyzes images of study materials using OpenRouter's vision models
- **Multiple Quiz Types**: 6 different quiz formats tailored for educational needs
- **Smart Answer Randomization**: Fisher-Yates algorithm prevents LLM bias in answer positioning
- **Flexible Question Types**: MCQ, True/False, Short Answer, Long Answer

### 📚 Six Quiz Types

1. **Retrieval Quiz** (30 questions)
   - 3 topics with 10 questions each
   - Spaced repetition structure (last week, 2-3 weeks ago, 4+ weeks ago)
   - Mix of AO1 (recall) and AO2 (application) questions

2. **Mini Quiz** (19-24 questions)
   - Structured around Assessment Objectives (AO1, AO2, AO3)
   - Bloom's Taxonomy progression
   - Includes self-reflection and mark schemes

3. **Assignment** (40 marks)
   - 4 exam-style questions (10 marks each)
   - Proper AO distribution
   - Difficulty progression
   - Detailed mark schemes

4. **Application Practice** (12 questions)
   - 3-tier difficulty structure
   - Novel contexts for knowledge transfer
   - Worked examples included

5. **Marks Per Point** (12 questions)
   - Explanation and description questions only
   - 2-4 marks per question
   - Clear mark schemes

6. **Specific Technique** (12 questions)
   - Focused exam technique practice
   - Variety of topics, same technique

### 🎨 Professional UI/UX
- Modern, clean interface with professional color scheme
- Responsive design (mobile, tablet, desktop)
- Drag-and-drop image upload
- Real-time progress indicators
- Smooth animations and transitions

### 📥 Export Options
- **Quiz PDF**: Clean question paper without answers
- **Answer Key PDF**: Separate document with correct answers
- Professional formatting ready for printing

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **AI Integration**: OpenAI API (GPT-4o with vision)
- **PDF Generation**: jsPDF
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- OpenAI API key (get one at [platform.openai.com](https://platform.openai.com/api-keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd mcq-generator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the `mcq-generator` directory:
   ```env
   OPENAI_API_KEY=your-openai-api-key-here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 How to Use

1. **Select Education Level**: Choose between GCSE or A-Level
2. **Choose Quiz Type**: Select from 6 different quiz formats
3. **Upload Images**: 
   - Single image for most quiz types
   - 3 images for Retrieval Quiz (one per topic)
4. **Generate**: Click the generate button and wait 10-15 seconds
5. **Download**: Get your quiz PDF and answer key

## 🎯 Educational Standards

### Assessment Objectives (AO)
- **AO1**: Knowledge and understanding
- **AO2**: Application of knowledge
- **AO3**: Analysis and evaluation

### Supported Exam Boards
- **GCSE**: AQA Science standards
- **A-Level**: OCR Biology standards

## 🔧 Configuration

### AI Model

The application uses OpenAI's **GPT-4o** (GPT-4 Omni) model, which includes:
- Advanced vision capabilities for analyzing study materials
- High-quality text generation for educational content
- Excellent OCR for reading textbook images
- JSON mode for structured output

### Customizing Quiz Types

Quiz type prompts can be customized in `mcq-generator/app/api/generate-questions/route.ts`

## 🏗️ Project Structure

```
mcq-generator/
├── app/
│   ├── api/
│   │   └── generate-questions/
│   │       └── route.ts          # API endpoint for question generation
│   ├── globals.css               # Global styles and Tailwind imports
│   ├── layout.tsx                # Root layout with metadata
│   └── page.tsx                  # Main application page
├── components/
│   ├── ImageUploader.tsx         # Drag-and-drop image upload
│   ├── QuestionTypeSelector.tsx  # Quiz configuration panel
│   ├── QuestionDisplay.tsx       # Question preview cards
│   ├── LoadingSpinner.tsx        # Loading state component
│   └── PDFGenerator.tsx          # PDF export functionality
├── lib/
│   ├── openai.ts                 # AI integration and answer randomization
│   ├── pdf-utils.ts              # PDF generation utilities
│   ├── types.ts                  # TypeScript type definitions
│   └── utils.ts                  # Utility functions
└── .env.local                    # Environment variables (not in git)
```

## 🔐 Security & Privacy

- API keys are stored in environment variables (never committed to git)
- All processing happens server-side
- Images are not stored permanently
- No user data is collected or tracked
