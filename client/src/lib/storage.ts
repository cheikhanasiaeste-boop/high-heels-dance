/**
 * Frontend storage utilities for S3 file uploads
 * Note: This is a client-side wrapper. For server-side operations, use server/storage.ts
 */

/**
 * Upload a file to S3 from the frontend
 * Returns the public URL and key for the uploaded file
 * 
 * Note: This function must be called from within a React component that has access to tRPC
 * Pass the trpc.upload.mutateAsync function as a parameter
 */
export async function storagePut(
  key: string,
  data: Uint8Array | string,
  contentType?: string
): Promise<{ url: string; key: string }> {
  // Convert data to base64 for transmission
  let base64Data: string;
  
  if (typeof data === 'string') {
    base64Data = btoa(data);
  } else {
    // Convert Uint8Array to base64
    const binary = Array.from(data).map(b => String.fromCharCode(b)).join('');
    base64Data = btoa(binary);
  }

  // Call tRPC upload endpoint
  const response = await fetch('/api/trpc/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key,
      data: base64Data,
      contentType,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to upload file');
  }

  const result = await response.json();
  return result.result.data;
}
