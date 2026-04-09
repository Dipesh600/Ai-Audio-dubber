import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import './db'; // Initialize DB on startup
import { initWebSocket } from './websocket';

// Routes
import jobRoutes from './routes/jobs';
import mediaRoutes from './routes/media';
import uploadRoutes from './routes/upload';
import libraryRoutes from './routes/library';

// Middleware
import { errorHandler } from './middleware/errorHandler';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ── WebSocket ──
initWebSocket(httpServer, ALLOWED_ORIGIN);

// ── Global Middleware ──
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// ── Routes ──
app.use('/api', jobRoutes);
app.use('/api', mediaRoutes);
app.use('/api', uploadRoutes);
app.use('/api', libraryRoutes);

// ── Health Check ──
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ws: true }));

// ── Error Handler ──
app.use(errorHandler);

// ── Start ──
httpServer.listen(PORT, () => {
  console.log(`\n[SETU-DUB] Backend running on :${PORT} (HTTP + WebSocket)\n`);
});
