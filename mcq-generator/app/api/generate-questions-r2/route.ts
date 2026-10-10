import { NextRequest, NextResponse } from 'next/server';
import { generateAndShuffleRetrievalQuiz } from '@/lib/openai';
import { RetrievalQuizValidationError } from '@/lib/retrieval-quiz-errors';
import { uploadToR2, deleteFromR2, getSignedR2Url } from '@/lib/r2-client';

export const runtime = 'nodejs';
// Three generation calls run concurrently, each with a 45-second timeout.
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const uploadedKeys: string[] = [];
  
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🎯 R2 WORKFLOW: /api/generate-questions-r2");
    console.log("=".repeat(80));

    const formData = await request.formData();
    const files = formData.getAll('images') as File[];
    const educationLevel = formData.get('educationLevel') as "GCSE" | "A-LEVEL" || "GCSE";
    
    // Validate inputs
    if (!files || files.length !== 3) {
      return NextResponse.json(
        { error: 'Exactly 3 images are required for retrieval quiz' },
        { status: 400 }
      );
    }

    if (educationLevel !== 'GCSE' && educationLevel !== 'A-LEVEL') {
      return NextResponse.json({ error: 'Invalid education level' }, { status: 400 });
    }
    if (files.some(file => !(file instanceof File) || !file.type.startsWith('image/') || file.size === 0 || file.size > 10 * 1024 * 1024)) {
      return NextResponse.json({ error: 'Each source must be a non-empty image up to 10MB' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("❌ API key not configured!");
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log("✅ API key found");
    console.log(`📚 Education level: ${educationLevel}`);
    console.log(`📁 Processing ${files.length} images...`);

    // Step 1: Upload images to R2 (as-is, no compression)
    console.log("🚀 Step 1: Uploading images to R2...");
    
    const uploadPromises = files.map(async (file, index) => {
      if (!file.type.startsWith('image/')) {
        throw new Error(`File ${index + 1} is not an image`);
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error(`File ${index + 1} is too large (>10MB)`);
      }
      
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = await uploadToR2(buffer, file.name, file.type);
      uploadedKeys.push(key);
      
      console.log(`✅ Uploaded image ${index + 1}: ${key} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      
      // Generate signed URL for OpenAI access
      const signedUrl = await getSignedR2Url(key);
      console.log(`🔗 Generated signed URL for image ${index + 1}`);
      
      return signedUrl;
    });
    
    // Finish all uploads before error cleanup, including those still in flight.
    const uploads = await Promise.allSettled(uploadPromises);
    const imageUrls = uploads.map(result => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    console.log(`🎉 Successfully uploaded ${imageUrls.length} images to R2`);

    // Step 2: Generate quiz using R2 URLs
    console.log("🤖 Step 2: Generating quiz with AI...");
    
    const result = await generateAndShuffleRetrievalQuiz(
      apiKey,
      imageUrls as [string, string, string],
      educationLevel
    );

    console.log("✅ Successfully generated and shuffled retrieval quiz");
    console.log(`📊 Total: ${result.questions.length} questions`);
    console.log(`🎲 Original answer key: ${result.originalAnswerKey.join('')}`);
    console.log(`🎲 Shuffled answer key: ${result.shuffledAnswerKey.join('')}`);

    // Step 3: Clean up - Delete images from R2 immediately
    console.log("🧹 Step 3: Cleaning up temporary images...");
    
    const deletePromises = uploadedKeys.map(async (key, index) => {
      try {
        await deleteFromR2(key);
        console.log(`🗑️ Deleted image ${index + 1}: ${key}`);
      } catch (error) {
        console.error(`❌ Failed to delete ${key}:`, error);
      }
    });
    
    await Promise.allSettled(deletePromises);
    console.log("✅ Cleanup completed");

    console.log("=".repeat(80) + "\n");

    return NextResponse.json({ 
      success: true,
      questions: result.questions,
      originalAnswerKey: result.originalAnswerKey,
      shuffledAnswerKey: result.shuffledAnswerKey,
      message: `Successfully generated ${result.questions.length} questions and cleaned up temporary files`
    });

  } catch (error) {
    console.error("❌ R2 workflow failed:", error);
    
    // Emergency cleanup - Delete any uploaded files on error
    if (uploadedKeys.length > 0) {
      console.log("🚨 Emergency cleanup: Deleting uploaded files...");
      await Promise.allSettled(
        uploadedKeys.map(key => deleteFromR2(key).catch(console.error))
      );
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate quiz',
        success: false,
        ...(error instanceof RetrievalQuizValidationError ? { code: 'RETRIEVAL_VALIDATION_FAILED' } : {})
      },
      { status: error instanceof RetrievalQuizValidationError ? 422 : 500 }
    );
  }
}
