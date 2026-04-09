/**
 * Azure Blob Storage service for Setu Dubber.
 * 
 * Handles uploading/downloading video and audio files to Azure Blob Storage
 * so they persist across Railway container redeploys.
 * 
 * Required env vars:
 *   AZURE_STORAGE_CONNECTION_STRING  — from Azure Portal → Storage Account → Access Keys
 *   AZURE_STORAGE_CONTAINER          — container name (default: "setu-dubber")
 */

import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import fs from 'fs';
import path from 'path';

// ── Configuration ──
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'setu-dubber';

let containerClient: ContainerClient | null = null;

/**
 * Initialize the Azure Blob container client.
 * Creates the container if it doesn't exist.
 */
async function getContainer(): Promise<ContainerClient | null> {
  if (containerClient) return containerClient;
  if (!connectionString) {
    console.warn('[AZURE] No AZURE_STORAGE_CONNECTION_STRING set — cloud storage disabled. Files stored locally only.');
    return null;
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create container if it doesn't exist (public read access for blobs)
    await containerClient.createIfNotExists({ access: 'blob' });
    console.log(`[AZURE] Connected to container: "${containerName}"`);
    return containerClient;
  } catch (err: any) {
    console.error(`[AZURE] Failed to connect: ${err.message}`);
    return null;
  }
}

/**
 * Upload a local file to Azure Blob Storage.
 * 
 * @param localPath  — absolute path to the file on disk
 * @param blobName   — name/path in the container (e.g., "jobs/abc123/dubbed_nepali.mp4")
 * @returns The public URL of the uploaded blob, or null on failure
 */
export async function uploadToAzure(localPath: string, blobName: string): Promise<string | null> {
  const container = await getContainer();
  if (!container) return null;
  if (!fs.existsSync(localPath)) {
    console.warn(`[AZURE] File not found for upload: ${localPath}`);
    return null;
  }

  try {
    const blockBlobClient = container.getBlockBlobClient(blobName);
    const fileSize = fs.statSync(localPath).size;
    const ext = path.extname(localPath).toLowerCase();
    
    // Set content type based on extension
    const contentType = ext === '.mp4' ? 'video/mp4'
      : ext === '.mp3' ? 'audio/mpeg'
      : ext === '.wav' ? 'audio/wav'
      : ext === '.json' ? 'application/json'
      : 'application/octet-stream';

    console.log(`[AZURE] Uploading ${blobName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

    await blockBlobClient.uploadFile(localPath, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    const url = blockBlobClient.url;
    console.log(`[AZURE] ✓ Uploaded: ${url}`);
    return url;
  } catch (err: any) {
    console.error(`[AZURE] Upload failed for ${blobName}: ${err.message}`);
    return null;
  }
}

/**
 * Upload all job artifacts (original video, audio, dubbed videos) to Azure.
 * Called after alignment or approval to persist results.
 * 
 * @param jobId     — the job identifier
 * @param files     — map of label → local file path
 * @returns map of label → Azure URL
 */
export async function uploadJobArtifacts(
  jobId: string,
  files: Record<string, string>
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  
  for (const [label, localPath] of Object.entries(files)) {
    if (!localPath || !fs.existsSync(localPath)) continue;
    const ext = path.extname(localPath);
    const blobName = `jobs/${jobId}/${label}${ext}`;
    const url = await uploadToAzure(localPath, blobName);
    if (url) urls[label] = url;
  }

  return urls;
}

/**
 * Delete all blobs for a job (cleanup).
 */
export async function deleteJobBlobs(jobId: string): Promise<void> {
  const container = await getContainer();
  if (!container) return;

  try {
    const prefix = `jobs/${jobId}/`;
    for await (const blob of container.listBlobsFlat({ prefix })) {
      await container.deleteBlob(blob.name);
    }
    console.log(`[AZURE] Deleted all blobs for job ${jobId}`);
  } catch (err: any) {
    console.error(`[AZURE] Cleanup failed for job ${jobId}: ${err.message}`);
  }
}

/**
 * Check if Azure storage is configured and available.
 */
export async function isAzureAvailable(): Promise<boolean> {
  const container = await getContainer();
  return container !== null;
}
