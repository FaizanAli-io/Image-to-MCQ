import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Add CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  console.log("📤 [STEP 1] API Route Hit - Starting image upload...");
  console.log("🌐 Request URL:", request.url);
  console.log("📦 Content-Type:", request.headers.get('content-type'));
  console.log("📏 Content-Length:", request.headers.get('content-length'));
  console.log("🔑 Origin:", request.headers.get('origin'));
  
  // Check content length first
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const sizeMB = parseInt(contentLength) / 1024 / 1024;
    console.log(`📊 Request size: ${sizeMB.toFixed(2)}MB`);
    
    // Vercel has a 4.5MB limit for serverless functions
    if (sizeMB > 4.5) {
      console.error(`❌ Request too large: ${sizeMB.toFixed(2)}MB > 4.5MB limit`);
      return NextResponse.json(
        { 
          error: 'Request too large for Vercel serverless functions',
          details: `${sizeMB.toFixed(2)}MB exceeds 4.5MB limit. Use smaller images or enable Vercel Blob storage.`,
          sizeMB: sizeMB
        },
        { status: 413, headers: corsHeaders }
      );
    }
  }
  
  try {
    let formData;
    try {
      console.log("📥 [STEP 2] Attempting to read FormData...");
      formData = await request.formData();
      console.log("✅ [STEP 2] FormData read successfully");
    } catch (formError) {
      console.error("❌ [STEP 2] Failed to read FormData:", formError);
      return NextResponse.json(
        { 
          error: 'Failed to read form data - likely request too large',
          details: formError instanceof Error ? formError.message : 'Unknown error',
          suggestion: 'Try smaller images or check Vercel Blob configuration'
        },
        { status: 400, headers: corsHeaders }
      );
    }
    
    console.log("📋 [STEP 3] Extracting files from FormData...");
    const files = formData.getAll('images') as File[];
    console.log(`📁 [STEP 3] Found ${files.length} file(s)`);
    
    if (!files || files.length === 0) {
      console.error("❌ [STEP 3] No files found");
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (files.length !== 3) {
      console.error(`❌ [STEP 3] Wrong file count: ${files.length}`);
      return NextResponse.json(
        { error: `Expected 3 images, got ${files.length}` },
        { status: 400, headers: corsHeaders }
      );
    }

    files.forEach((file, i) => {
      console.log(`📄 File ${i + 1}: ${file.name} (${(file.size/1024/1024).toFixed(2)}MB)`);
    });

    console.log("🔑 [STEP 4] Checking Blob token...");
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    console.log("Token present:", !!blobToken);
    console.log("Token prefix:", blobToken ? blobToken.substring(0, 20) + '...' : 'none');
    
    if (!blobToken) {
      console.log("⚠️ [FALLBACK] No token - using base64");
      
      const base64Promises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:${file.type};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: 'Using base64 fallback',
        developmentMode: true
      }, { headers: corsHeaders });
    }

    console.log(`☁️ [STEP 5] Uploading to Vercel Blob...`);

    try {
      const uploadPromises = files.map(async (file, i) => {
        const filename = `quiz/${Date.now()}-${i}.${file.name.split('.').pop()}`;
        
        console.log(`⬆️ [${i+1}] Uploading ${filename}...`);
        
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const blob = await put(filename, buffer, {
          access: 'public',
          token: blobToken,
          contentType: file.type,
        });
        
        console.log(`✅ [${i+1}] Success: ${blob.url}`);
        return blob.url;
      });

      const blobUrls = await Promise.all(uploadPromises);
      
      console.log("🎉 All uploads complete!");

      return NextResponse.json({
        success: true,
        imageUrls: blobUrls,
        message: `Uploaded ${blobUrls.length} images`
      }, { headers: corsHeaders });
      
    } catch (blobError) {
      console.error("❌ Blob upload failed:", blobError);
      
      console.log("🔄 Falling back to base64...");
      
      const base64Promises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:${file.type};base64,${base64}`;
      });

      const base64Urls = await Promise.all(base64Promises);
      
      return NextResponse.json({
        success: true,
        imageUrls: base64Urls,
        message: 'Blob failed - using base64',
        fallbackUsed: true
      }, { headers: corsHeaders });
    }

  } catch (error) {
    console.error("❌ Fatal error:", error);
    
    return NextResponse.json(
      { 
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}