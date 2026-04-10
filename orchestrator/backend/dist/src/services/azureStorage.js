"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToAzure = uploadToAzure;
exports.uploadJobArtifacts = uploadJobArtifacts;
exports.deleteJobBlobs = deleteJobBlobs;
exports.isAzureAvailable = isAzureAvailable;
const storage_blob_1 = require("@azure/storage-blob");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ── Configuration ──
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'setu-dubber';
let containerClient = null;
let sharedKeyCredential = null;
// Extract account name and key from connection string for SAS token generation
function getCredential() {
    var _a, _b;
    if (sharedKeyCredential)
        return sharedKeyCredential;
    if (!connectionString)
        return null;
    try {
        const accountName = ((_a = connectionString.match(/AccountName=([^;]+)/)) === null || _a === void 0 ? void 0 : _a[1]) || '';
        const accountKey = ((_b = connectionString.match(/AccountKey=([^;]+)/)) === null || _b === void 0 ? void 0 : _b[1]) || '';
        if (accountName && accountKey) {
            sharedKeyCredential = new storage_blob_1.StorageSharedKeyCredential(accountName, accountKey);
            return sharedKeyCredential;
        }
    }
    catch (_c) { }
    return null;
}
/**
 * Generate a SAS token URL for a blob (valid for 30 days).
 * This allows reading the blob without public container access.
 */
function generateSasUrl(blobName) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = yield getContainer();
        const credential = getCredential();
        if (!container || !credential)
            return null;
        const blobClient = container.getBlobClient(blobName);
        const expiresOn = new Date();
        expiresOn.setDate(expiresOn.getDate() + 30); // 30 days
        const sasToken = (0, storage_blob_1.generateBlobSASQueryParameters)({
            containerName,
            blobName,
            permissions: storage_blob_1.BlobSASPermissions.parse('r'), // read-only
            expiresOn,
        }, credential).toString();
        return `${blobClient.url}?${sasToken}`;
    });
}
/**
 * Initialize the Azure Blob container client.
 * Creates the container if it doesn't exist.
 */
function getContainer() {
    return __awaiter(this, void 0, void 0, function* () {
        if (containerClient)
            return containerClient;
        if (!connectionString) {
            console.warn('[AZURE] No AZURE_STORAGE_CONNECTION_STRING set — cloud storage disabled. Files stored locally only.');
            return null;
        }
        try {
            const blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
            containerClient = blobServiceClient.getContainerClient(containerName);
            // Create PRIVATE container (no public access required)
            yield containerClient.createIfNotExists();
            console.log(`[AZURE] Connected to container: "${containerName}" (private)`);
            return containerClient;
        }
        catch (err) {
            console.error(`[AZURE] Failed to connect: ${err.message}`);
            return null;
        }
    });
}
/**
 * Upload a local file to Azure Blob Storage.
 *
 * @param localPath  — absolute path to the file on disk
 * @param blobName   — name/path in the container (e.g., "jobs/abc123/dubbed_nepali.mp4")
 * @returns The public URL of the uploaded blob, or null on failure
 */
function uploadToAzure(localPath, blobName) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = yield getContainer();
        if (!container)
            return null;
        if (!fs_1.default.existsSync(localPath)) {
            console.warn(`[AZURE] File not found for upload: ${localPath}`);
            return null;
        }
        try {
            const blockBlobClient = container.getBlockBlobClient(blobName);
            const fileSize = fs_1.default.statSync(localPath).size;
            const ext = path_1.default.extname(localPath).toLowerCase();
            // Set content type based on extension
            const contentType = ext === '.mp4' ? 'video/mp4'
                : ext === '.mp3' ? 'audio/mpeg'
                    : ext === '.wav' ? 'audio/wav'
                        : ext === '.json' ? 'application/json'
                            : 'application/octet-stream';
            console.log(`[AZURE] Uploading ${blobName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
            yield blockBlobClient.uploadFile(localPath, {
                blobHTTPHeaders: { blobContentType: contentType },
            });
            // Generate SAS token URL (valid for 7 days) — no public access needed
            const url = yield generateSasUrl(blobName);
            console.log(`[AZURE] ✓ Uploaded with SAS URL`);
            return url;
        }
        catch (err) {
            console.error(`[AZURE] Upload failed for ${blobName}: ${err.message}`);
            return null;
        }
    });
}
/**
 * Upload all job artifacts (original video, audio, dubbed videos) to Azure.
 * Called after alignment or approval to persist results.
 *
 * @param jobId     — the job identifier
 * @param files     — map of label → local file path
 * @returns map of label → Azure URL
 */
function uploadJobArtifacts(jobId, files) {
    return __awaiter(this, void 0, void 0, function* () {
        const urls = {};
        for (const [label, localPath] of Object.entries(files)) {
            if (!localPath || !fs_1.default.existsSync(localPath))
                continue;
            const ext = path_1.default.extname(localPath);
            const blobName = `jobs/${jobId}/${label}${ext}`;
            const url = yield uploadToAzure(localPath, blobName);
            if (url)
                urls[label] = url;
        }
        return urls;
    });
}
/**
 * Delete all blobs for a job (cleanup).
 */
function deleteJobBlobs(jobId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        const container = yield getContainer();
        if (!container)
            return;
        try {
            const prefix = `jobs/${jobId}/`;
            try {
                for (var _d = true, _e = __asyncValues(container.listBlobsFlat({ prefix })), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const blob = _c;
                    yield container.deleteBlob(blob.name);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_1) throw e_1.error; }
            }
            console.log(`[AZURE] Deleted all blobs for job ${jobId}`);
        }
        catch (err) {
            console.error(`[AZURE] Cleanup failed for job ${jobId}: ${err.message}`);
        }
    });
}
/**
 * Check if Azure storage is configured and available.
 */
function isAzureAvailable() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = yield getContainer();
        return container !== null;
    });
}
