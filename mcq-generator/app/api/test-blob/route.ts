import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

export async function GET() {
  try {
    console.log("🧪 Testing Blob configuration...");
    
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!blobToken) {
      return NextResponse.json({
        success: false,
        error: 'No BLOB_READ_WRITE_TOKEN found',
        hasToken: false
      });
    }

    console.log("✅ Token found:", blobToken.substring(0, 20) + '...');

    // Test with a small text file
    const testContent = `Test file created at ${new Date().toISOString()}`;
    const testBuffer = Buffer.from(testContent, 'utf-8');

    try {
      const blob = await put('test.txt', testBuffer, {
        access: 'public',
        token: blobToken,
        contentType: 'text/plain',
      });

      console.log("✅ Test upload successful:", blob.url);

      return NextResponse.json({
        success: true,
        message: 'Blob storage is working correctly',
        testUrl: blob.url,
        hasToken: true,
        tokenPrefix: blobToken.substring(0, 20) + '...'
      });

    } catch (blobError) {
      console.error("❌ Blob upload failed:", blobError);
      
      return NextResponse.json({
        success: false,
        error: 'Blob upload failed',
        details: blobError instanceof Error ? blobError.message : 'Unknown error',
        hasToken: true,
        tokenPrefix: blobToken.substring(0, 20) + '...'
      });
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
    
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}