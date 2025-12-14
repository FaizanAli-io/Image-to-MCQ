import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

// CRITICAL: Set body size limit for large images
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log("📤 [STEP 1] Starting image upload...");
    console.log("📦 Content-Type:", request.headers.get('content-type'));
    console.log("📏 Content-Length:", request.headers.get('content-length'));
    
    let formData;
    try {
      console.log("📥 [STEP 2] Attempting to read FormData...");
      formData = await request.formData();
      console.log("✅ [STEP 2] FormData read successfully");
    } catch (formError) {
      console.error("❌ [STEP 2] Failed to read FormData:", formError);
      return NextResponse.json(
        { 
          error: 'Failed to read form data',
          details: formError instanceof Error ? formError.message : 'Unknown error',
          hint: 'The request body might be too large or malformed'
        },
        { status: 400 }
      );
    }
    
    console.log("📋 [STEP 3] Extracting files from FormData...");
    const files = formData.getAll('images') as File[];
    console.log(`📁 [STEP 3] Found ${files.length} file(s)`);
    
    if (!files || files.length === 0) {
      console.error("❌ [STEP 3] No files found in FormData");
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    if (files.length !== 3) {
      console.error(`❌ [STEP 3] Wrong number of files: ${files.length} (expected 3)`);
      return NextResponse.json(
        { error: `Exactly 3 images are required for retrieval quiz (received ${files.length})` },
        { status: 400 }
      );
    }

    // Log file details
    files.forEach((file, index) => {
      console.log(`📄 File ${index + 1}:`, {
        name: file.name,
        type: file.type,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`
      });
    });

    // Check if Blob token exists
    console.log("🔑 [STEP 4] Checking Blob token...");
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    console.log("🔑 Blob token present:", !!blobToken);
    
    if (blobToken) {
      console.log("🔑 Token length:", blobToken.length);
      console.log("🔑 Token preview:", blobToken.substring(0, 25) + '...');
    } else {
      console.log("⚠️ No BLOB_READ_WRITE_TOKEN found");
    }
    
    if (!blobToken) {
      console.log("⚠️ [FALLBACK] Using base64 mode (no Blob token)");
      
      // Fallback: Convert to base64
      const base64Promises = files.map(async (file, index) => {
        console.log(`🔄 Converting file ${index + 1} to base64...`);
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = file.type;
        console.log(`✅ File ${index + 1} converted (${(base64.length / 1024 / 1024).toFixed(2)}MB base64)`);
        return `data:${mimeType};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      console.log("✅ [FALLBACK] All files converted to base64");
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: `No Blob token - using base64 fallback (${base64Urls.length} images)`,
        developmentMode: true
      });
    }

    console.log(`☁️ [STEP 5] Uploading ${files.length} images to Vercel Blob...`);

    try {
      // Upload all images to Vercel Blob concurrently
      const uploadPromises = files.map(async (file, index) => {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const extension = file.name.split('.').pop() || 'jpg';
        const filename = `quiz/${timestamp}-${randomSuffix}-${index + 1}.${extension}`;
        
        console.log(`⬆️ [UPLOAD ${index + 1}] Starting: ${filename}`);
        console.log(`📏 [UPLOAD ${index + 1}] Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        
        try {
          // Convert File to Buffer
          console.log(`🔄 [UPLOAD ${index + 1}] Converting to buffer...`);
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          console.log(`✅ [UPLOAD ${index + 1}] Buffer created (${buffer.length} bytes)`);
          
          // Upload with explicit token
          console.log(`☁️ [UPLOAD ${index + 1}] Calling Vercel Blob API...`);
          const blob = await put(filename, buffer, {
            access: 'public',
            token: blobToken,
            contentType: file.type,
          });
          
          console.log(`✅ [UPLOAD ${index + 1}] Success: ${blob.url}`);
          return blob.url;
        } catch (uploadError) {
          console.error(`❌ [UPLOAD ${index + 1}] Failed:`, uploadError);
          throw uploadError;
        }
      });

      console.log("⏳ Waiting for all uploads to complete...");
      const blobUrls = await Promise.all(uploadPromises);
      
      console.log("🎉 [SUCCESS] All images uploaded to Vercel Blob");
      console.log("🔗 URLs:", blobUrls);

      return NextResponse.json({
        success: true,
        imageUrls: blobUrls,
        message: `Successfully uploaded ${blobUrls.length} images to Vercel Blob`
      });
      
    } catch (blobError) {
      console.error("❌ [BLOB ERROR] Upload failed:");
      console.error("Error type:", blobError instanceof Error ? blobError.constructor.name : typeof blobError);
      console.error("Error message:", blobError instanceof Error ? blobError.message : String(blobError));
      
      if (blobError instanceof Error) {
        console.error("Error stack:", blobError.stack);
      }
      
      // Check if it's an auth error
      const errorMessage = blobError instanceof Error ? blobError.message : String(blobError);
      if (errorMessage.toLowerCase().includes('forbidden') || errorMessage.toLowerCase().includes('403')) {
        console.error("🚫 AUTHENTICATION ERROR: Blob token is invalid or missing permissions");
      }
      
      // Fallback to base64
      console.log("🔄 [FALLBACK] Converting to base64 after Blob error...");
      
      const base64Promises = files.map(async (file, index) => {
        console.log(`🔄 Converting file ${index + 1} to base64...`);
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = file.type;
        return `data:${mimeType};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      console.log("✅ [FALLBACK] Converted to base64 successfully");
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: `Blob failed (${errorMessage}), using base64 fallback`,
        error: errorMessage,
        developmentMode: true,
        fallbackUsed: true
      });
    }

  } catch (error) {
    console.error("❌ [FATAL ERROR] Complete failure:", error);
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to upload images',
        details: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : typeof error
      },
      { status: 500 }
    );
  }
}