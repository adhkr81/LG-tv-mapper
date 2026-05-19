import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { startUSBWatcher } from './services/usb-watcher.js';

import serialRoutes from './routes/serial.js';
import captureRoutes from './routes/capture.js';
import screenRoutes from './routes/screens.js';
import buttonRoutes from './routes/buttons.js';
import graphRoutes from './routes/graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve screenshots as static files
app.use('/screenshots', express.static(path.join(__dirname, 'data', 'screenshots')));

// API Routes
app.use('/api/serial', serialRoutes);
app.use('/api/capture', captureRoutes);
app.use('/api/screens', screenRoutes);
app.use('/api/screens/:id/buttons', buttonRoutes);
app.use('/api/graph', graphRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  console.log(`[Server] Running on http://localhost:${config.port}`);
});

// Start USB watcher if configured
startUSBWatcher();
