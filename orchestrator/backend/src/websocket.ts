import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function initWebSocket(httpServer: HttpServer, allowedOrigin: string) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigin || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on('subscribe', (jobId: string) => {
      socket.join(`job:${jobId}`);
      console.log(`[WS] ${socket.id} subscribed to job:${jobId}`);
    });

    socket.on('unsubscribe', (jobId: string) => {
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
export function emitJobUpdate(jobId: string, data: Record<string, any>) {
  if (!io) return;
  io.to(`job:${jobId}`).emit('job:status', { jobId, ...data });
}

/**
 * Emit a progress log line for a job (e.g., agent output).
 */
export function emitJobLog(jobId: string, message: string) {
  if (!io) return;
  io.to(`job:${jobId}`).emit('job:log', { jobId, message, timestamp: Date.now() });
}
