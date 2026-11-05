import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize R2 client with proper configuration
export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

/**
 * Upload a file to R2 and return the key
 */
export async function uploadToR2(
  buffer: Buffer,
  filename: string,
  contentType: string,
  objectKey?: string,
): Promise<string> {
  const key = objectKey ?? `temp/${Date.now()}-${Math.random().toString(36).substring(2)}-${filename}`;
  
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  
  return key;
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Generate a signed URL for temporary public access (expires in 1 hour)
 */
export async function getSignedR2Url(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  
  // Generate signed URL that expires in 1 hour
  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  return signedUrl;
}

/**
 * Generate R2 URL for internal use (not public) - DEPRECATED
 */
export function getR2Url(key: string): string {
  return `https://${R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}
