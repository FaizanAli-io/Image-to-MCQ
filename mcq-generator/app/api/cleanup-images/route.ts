import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    console.log("🧹 Starting image cleanup...");
    
    const { imageUrls } = await request.json();
    
    if (!imageUrls || !Array.isArray(imageUrls)) {
      return NextResponse.json(
        { error: 'No image URLs provided for cleanup' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Cleaning up ${imageUrls.length} images from Vercel Blob...`);

    // Delete all images from Vercel Blob concurrently
    const deletePromises = imageUrls.map(async (url: string) => {
      try {
        await del(url);
        console.log(`✅ Deleted: ${url}`);
        return { url, success: true };
      } catch (error) {
        console.error(`❌ Failed to delete ${url}:`, error);
        return { url, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    const results = await Promise.all(deletePromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`🎉 Cleanup completed: ${successful} deleted, ${failed} failed`);

    return NextResponse.json({
      success: true,
      deleted: successful,
      failed: failed,
      results: results,
      message: `Successfully cleaned up ${successful} of ${imageUrls.length} images`
    });

  } catch (error) {
    console.error("❌ Image cleanup failed:", error);
    return NextResponse.json(
      { 
        error: 'Failed to cleanup images from Vercel Blob',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}