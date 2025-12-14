import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for uploads

export async function POST(request: NextRequest) {
  try {
    console.log("📤 Starting image upload...");
    
    const formData = await request.formData();
    const files = formData.getAll('images') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    if (files.length !== 3) {
      return NextResponse.json(
        { error: 'Exactly 3 images are required for retrieval quiz' },
        { status: 400 }
      );
    }

    // Check if Blob token exists
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    console.log("🔑 Blob token present:", !!blobToken);
    console.log("🔑 Token preview:", blobToken ? `${blobToken.substring(0, 20)}...` : 'MISSING');
    
    if (!blobToken) {
      console.log("⚠️ No BLOB_READ_WRITE_TOKEN found - using fallback base64 mode");
      
      // Fallback: Convert to base64
      const base64Promises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = file.type;
        return `data:${mimeType};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      console.log("✅ Converted to base64 for fallback");
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: `No Blob token found - using base64 fallback`,
        developmentMode: true
      });
    }

    console.log(`📁 Uploading ${files.length} images to Vercel Blob...`);

    try {
      // Upload all images to Vercel Blob concurrently
      const uploadPromises = files.map(async (file, index) => {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const extension = file.name.split('.').pop() || 'jpg';
        const filename = `quiz-images/${timestamp}-${randomSuffix}-topic-${index + 1}.${extension}`;
        
        console.log(`⬆️ Uploading ${filename} (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);
        
        // Convert File to Buffer (required for proper upload)
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Upload with explicit token
        const blob = await put(filename, buffer, {
          access: 'public',
          token: blobToken,
          contentType: file.type,
        });
        
        console.log(`✅ Uploaded successfully: ${blob.url}`);
        return blob.url;
      });

      const blobUrls = await Promise.all(uploadPromises);
      
      console.log("🎉 All images uploaded successfully to Vercel Blob");
      console.log("🔗 Blob URLs:", blobUrls);

      return NextResponse.json({
        success: true,
        imageUrls: blobUrls,
        message: `Successfully uploaded ${blobUrls.length} images to Vercel Blob`
      });
      
    } catch (blobError) {
      console.error("❌ Vercel Blob upload failed:");
      console.error("Error type:", blobError instanceof Error ? blobError.constructor.name : typeof blobError);
      console.error("Error message:", blobError instanceof Error ? blobError.message : String(blobError));
      
      if (blobError instanceof Error) {
        console.error("Error stack:", blobError.stack);
      }
      
      // Check if it's an auth error
      const errorMessage = blobError instanceof Error ? blobError.message : String(blobError);
      if (errorMessage.toLowerCase().includes('forbidden') || errorMessage.toLowerCase().includes('403')) {
        console.error("🚫 AUTHENTICATION ERROR: Blob token is invalid or missing permissions");
        console.error("Token info:", {
          exists: !!blobToken,
          length: blobToken?.length,
          preview: blobToken?.substring(0, 30) + '...'
        });
      }
      
      // Fallback to base64 if Blob upload fails
      console.log("🔄 Falling back to base64 after Blob error...");
      
      const base64Promises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = file.type;
        return `data:${mimeType};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      console.log("✅ Fallback: Converted to base64 after Blob failure");
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: `Blob upload failed (${errorMessage}), using base64 fallback`,
        error: errorMessage,
        developmentMode: true,
        fallbackUsed: true
      });
    }

  } catch (error) {
    console.error("❌ Image upload completely failed:", error);
    return NextResponse.json(
      { 
        error: 'Failed to upload images',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}