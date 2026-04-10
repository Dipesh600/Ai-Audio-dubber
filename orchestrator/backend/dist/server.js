"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env from project root (must be before any other imports that use env vars)
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
require("./db"); // Initialize DB on startup
const websocket_1 = require("./websocket");
// Routes
const jobs_1 = __importDefault(require("./routes/jobs"));
const media_1 = __importDefault(require("./routes/media"));
const upload_1 = __importDefault(require("./routes/upload"));
const library_1 = __importDefault(require("./routes/library"));
// Middleware
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 5001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
// ── WebSocket ──
(0, websocket_1.initWebSocket)(httpServer, ALLOWED_ORIGIN);
// ── Global Middleware ──
app.use((0, cors_1.default)({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
}));
app.use(express_1.default.json());
// ── Routes ──
app.use('/api', jobs_1.default);
app.use('/api', media_1.default);
app.use('/api', upload_1.default);
app.use('/api', library_1.default);
// ── Health Check ──
app.get('/api/health', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let azureOk = false;
    try {
        const { isAzureAvailable } = yield Promise.resolve().then(() => __importStar(require('./services/azureStorage')));
        azureOk = yield isAzureAvailable();
    }
    catch (_a) { }
    res.json({ status: 'ok', ws: true, azure: azureOk });
}));
// ── Error Handler ──
app.use(errorHandler_1.errorHandler);
// ── Start ──
httpServer.listen(PORT, () => {
    console.log(`\n[SETU-DUB] Backend running on :${PORT} (HTTP + WebSocket)\n`);
});
