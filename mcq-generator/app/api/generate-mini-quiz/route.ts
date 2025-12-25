import { NextRequest, NextResponse } from 'next/server';
import { generateMiniQuiz } from '@/lib/openai';
import { uploadToR2, deleteFromR2, getSignedR2Url } from '@/lib/r2-client';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let uploadedKey: string | null = null;
  
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🎯 MINI QUIZ WORKFLOW: /api/generate-mini-quiz");
    console.log("=".repeat(80));

    const formData = await request.formData();
    const file = formData.get('image') as File;
    const educationLevel = formData.get('educationLevel') as "GCSE" | "A-LEVEL" || "GCSE";
    
    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: 'Exactly 1 image is required for mini quiz' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json(
        { error: 'Image is too large (>10MB)' },
        { status: 400 }
      );
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
    console.log(`📁 Processing image: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    // Step 1: Upload image to R2 (as-is, no compression)
    console.log("🚀 Step 1: Uploading image to R2...");
    
    const buffer = Buffer.from(await file.arrayBuffer());
    uploadedKey = await uploadToR2(buffer, file.name, file.type);
    
    console.log(`✅ Uploaded image: ${uploadedKey}`);
    
    // Generate signed URL for OpenAI access
    const signedUrl = await getSignedR2Url(uploadedKey);
    console.log(`🔗 Generated signed URL for image`);

    // Step 2: Generate mini quiz using R2 URL
    console.log("🤖 Step 2: Generating mini quiz with AI...");
    console.log(`🔗 Using signed URL: ${signedUrl.substring(0, 100)}...`);
    
    const questions = await generateMiniQuiz(
      apiKey,
      signedUrl,
      educationLevel
    );

    console.log("✅ Successfully generated mini quiz");
    console.log(`📊 Total: ${questions.length} questions`);

    // Step 3: Clean up - Delete image from R2 immediately
    console.log("🧹 Step 3: Cleaning up temporary image...");
    
    try {
      await deleteFromR2(uploadedKey);
      console.log(`🗑️ Deleted image: ${uploadedKey}`);
    } catch (error) {
      console.error(`❌ Failed to delete ${uploadedKey}:`, error);
    }
    
    console.log("✅ Cleanup completed");
    console.log("=".repeat(80) + "\n");

    return NextResponse.json({ 
      success: true,
      questions,
      message: `Successfully generated ${questions.length} questions and cleaned up temporary file`
    });

  } catch (error) {
    console.error("❌ Mini quiz workflow failed:", error);
    
    // Emergency cleanup - Delete uploaded file on error
    if (uploadedKey) {
      console.log("🚨 Emergency cleanup: Deleting uploaded file...");
      try {
        await deleteFromR2(uploadedKey);
        console.log(`🧹 Emergency cleanup completed: ${uploadedKey}`);
      } catch (cleanupError) {
        console.error("❌ Emergency cleanup failed:", cleanupError);
      }
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate mini quiz',
        success: false 
      },
      { status: 500 }
    );
  }
}