/**
 * Azure Blob Storage service for Setu Dubber.
 * 
 * Handles uploading/downloading video and audio files to Azure Blob Storage
 * so they persist across container redeploys (Render/Railway).
 * 
 * Uses PRIVATE containers with SAS token URLs — no public access needed.
 * 
 * Required env vars:
 *   AZURE_STORAGE_CONNECTION_STRING  — from Azure Portal → Storage Account → Access Keys
 *   AZURE_STORAGE_CONTAINER          — container name (default: "setu-dubber")
 */

import { BlobServiceClient, ContainerClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from '@azure/storage-blob';
import fs from 'fs';
import path from 'path';

// ── Configuration ──
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'setu-dubber';

let containerClient: ContainerClient | null = null;
let sharedKeyCredential: StorageSharedKeyCredential | null = null;

// Extract account name and key from connection string for SAS token generation
function getCredential(): StorageSharedKeyCredential | null {
  if (sharedKeyCredential) return sharedKeyCredential;
  if (!connectionString) return null;
  try {
    const accountName = connectionString.match(/AccountName=([^;]+)/)?.[1] || '';
    const accountKey = connectionString.match(/AccountKey=([^;]+)/)?.[1] || '';
    if (accountName && accountKey) {
      sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      return sharedKeyCredential;
    }
  } catch {}
  return null;
}

/**
 * Generate a SAS token URL for a blob (valid for 30 days).
 * This allows reading the blob without public container access.
 */
async function generateSasUrl(blobName: string): Promise<string | null> {
  const container = await getContainer();
  const credential = getCredential();
  if (!container || !credential) return null;

  const blobClient = container.getBlobClient(blobName);
  const expiresOn = new Date();
  expiresOn.setDate(expiresOn.getDate() + 30); // 30 days

  const sasToken = generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('r'), // read-only
    expiresOn,
  }, credential).toString();

  return `${blobClient.url}?${sasToken}`;
}

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
    
    // Create PRIVATE container (no public access required)
    await containerClient.createIfNotExists();
    console.log(`[AZURE] Connected to container: "${containerName}" (private)`);
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

    // Generate SAS token URL (valid for 7 days) — no public access needed
    const url = await generateSasUrl(blobName);
    console.log(`[AZURE] ✓ Uploaded with SAS URL`);
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
