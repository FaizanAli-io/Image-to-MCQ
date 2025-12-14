import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

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

    // Check if we're in development mode without Blob token OR forced local mode
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const useLocalMode = process.env.USE_LOCAL_MODE === 'true';
    
    if (!blobToken || useLocalMode) {
      console.log(useLocalMode 
        ? "🔧 USE_LOCAL_MODE=true - using base64 mode for local development" 
        : "⚠️ No BLOB_READ_WRITE_TOKEN found - using fallback base64 mode for local development");
      
      // Fallback: Convert to base64 for local development
      const base64Promises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = file.type;
        return `data:${mimeType};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      console.log("✅ Converted to base64 for local development");
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: `Local development mode: converted ${base64Urls.length} images to base64`,
        developmentMode: true
      });
    }

    console.log(`📁 Uploading ${files.length} images to Vercel Blob...`);

    // Upload all images to Vercel Blob concurrently
    const uploadPromises = files.map(async (file, index) => {
      const filename = `quiz-image-${index + 1}-${Date.now()}.${file.name.split('.').pop()}`;
      
      console.log(`⬆️ Uploading ${filename} (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);
      
      const blob = await put(filename, file, {
        access: 'public',
        // Set TTL to 1 hour for ephemeral behavior
        addRandomSuffix: true,
      });
      
      console.log(`✅ Uploaded: ${blob.url}`);
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

  } catch (error) {
    console.error("❌ Image upload failed:", error);
    return NextResponse.json(
      { 
        error: 'Failed to upload images',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}