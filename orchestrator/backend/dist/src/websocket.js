"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
exports.emitJobUpdate = emitJobUpdate;
exports.emitJobLog = emitJobLog;
const socket_io_1 = require("socket.io");
let io = null;
function initWebSocket(httpServer, allowedOrigin) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: allowedOrigin || '*',
            methods: ['GET', 'POST'],
        },
    });
    io.on('connection', (socket) => {
        console.log(`[WS] Client connected: ${socket.id}`);
        socket.on('subscribe', (jobId) => {
            socket.join(`job:${jobId}`);
            console.log(`[WS] ${socket.id} subscribed to job:${jobId}`);
        });
        socket.on('unsubscribe', (jobId) => {
            socket.leave(`job:${jobId}`);
        });
        socket.on('disconnect', () => {
            console.log(`[WS] Client disconnected: ${socket.id}`);
        });
    });
    return io;
}
/**
 * Emit a job status update to all clients subscribed to this job.
 * Call this whenever job state changes in the pipeline.
 */
function emitJobUpdate(jobId, data) {
    if (!io)
        return;
    io.to(`job:${jobId}`).emit('job:status', Object.assign({ jobId }, data));
}
/**
 * Emit a progress log line for a job (e.g., agent output).
 */
function emitJobLog(jobId, message) {
    if (!io)
        return;
    io.to(`job:${jobId}`).emit('job:log', { jobId, message, timestamp: Date.now() });
}
