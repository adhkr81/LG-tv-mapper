import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { startUSBWatcher } from './services/usb-watcher.js';
import { migrateLegacyProjectLayout, getProjectsDir } from './services/projects.js';
import { requireProject } from './middleware/requireProject.js';

import projectRoutes from './routes/projects.js';
import serialRoutes from './routes/serial.js';
import rmusRoutes from './routes/rmus.js';
import captureRoutes from './routes/capture.js';
import screenRoutes from './routes/screens.js';
import buttonRoutes from './routes/buttons.js';
import graphRoutes from './routes/graph.js';
import sectionRoutes from './routes/sections.js';
import configRoutes from './routes/config.js';
import stateRoutes from './routes/state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One-time: move legacy flat data/ files into projects/default/
migrateLegacyProjectLayout();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve project screenshots at /screenshots/:projectId/*
app.get('/screenshots/:projectId/:filename', (req, res, next) => {
  const { projectId, filename } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(
    getProjectsDir(),
    projectId,
    'screenshots',
    filename
  );
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/serial', serialRoutes);
app.use('/api/rmus', rmusRoutes);

const projectApi = express.Router({ mergeParams: true });
projectApi.use(requireProject);
projectApi.use('/capture', captureRoutes);
projectApi.use('/screens', screenRoutes);
projectApi.use('/screens/:id/buttons', buttonRoutes);
projectApi.use('/graph', graphRoutes);
projectApi.use('/sections', sectionRoutes);
projectApi.use('/config', configRoutes);
projectApi.use('/state', stateRoutes);

app.use('/api/projects/:projectId', projectApi);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  console.log(`[Server] Running on http://localhost:${config.port}`);
});

// Start USB watcher if configured
startUSBWatcher();
