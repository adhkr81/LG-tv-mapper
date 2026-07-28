import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  captureFromTV,
  captureFromTVStream,
  registerScreenshotImport,
} from '../services/capture.js';
import { createScreen, getScreen, updateScreen } from '../services/screens.js';
import { ensureConnected, getStatus as getSerialStatus } from '../services/serial.js';
import {
  ensureReady as ensureRmusReady,
  captureScreenshot as captureFromRmus,
  getStatus as getRmusStatus,
} from '../services/rmus.js';
import { getActiveProjectId } from '../services/data-store.js';
import { getProject } from '../services/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadTmpDir = path.join(__dirname, '..', 'data', '.upload-tmp');
fs.mkdirSync(uploadTmpDir, { recursive: true });
const upload = multer({ dest: uploadTmpDir });

const router = Router();

function writeNdjson(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
  if (typeof res.flush === 'function') res.flush();
}

// POST /api/capture — capture via serial (LG) or RMUS (Samsung)
router.post('/', async (req, res) => {
  const streamProgress = req.query.stream === '1' || req.query.stream === 'true';

  try {
    const { screenId, sectionId } = req.body;
    const saveToLaptop = req.body.saveToLaptop === 'true' || req.body.saveToLaptop === true;
    if (!screenId) {
      return res.status(400).json({ error: 'screenId is required' });
    }

    const activeId = getActiveProjectId();
    const project = activeId ? getProject(activeId) : null;
    const requestedSource = String(req.body.source || '').toLowerCase();
    const source =
      requestedSource === 'rmus' || requestedSource === 'serial'
        ? requestedSource
        : project?.platform === 'samsung'
          ? 'rmus'
          : 'serial';

    const onProgress = streamProgress
      ? (progress) => writeNdjson(res, { type: 'progress', ...progress })
      : undefined;

    if (streamProgress) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    let filename;
    let connectionStatus;

    if (source === 'rmus') {
      await ensureRmusReady();
      filename = await captureFromRmus(screenId, onProgress);
      connectionStatus = getRmusStatus().status;
    } else {
      await ensureConnected();
      if (saveToLaptop) {
        filename = await captureFromTVStream(screenId, onProgress);
      } else {
        filename = await captureFromTV(screenId, onProgress);
      }
      connectionStatus = getSerialStatus().status;
    }

    onProgress?.({
      phase: 'finishing',
      percent: 98,
      label: 'Registering screen…',
    });

    const existing = getScreen(screenId);
    const screen = existing
      ? updateScreen(screenId, { image: filename })
      : createScreen({ id: screenId, image: filename, sectionId: sectionId || null });
    const result = {
      ...screen,
      source,
      serialStatus: source === 'serial' ? connectionStatus : undefined,
      rmusStatus: source === 'rmus' ? connectionStatus : undefined,
    };

    if (streamProgress) {
      writeNdjson(res, { type: 'done', ...result });
      return res.end();
    }

    res.json(result);
  } catch (err) {
    const activeId = getActiveProjectId();
    const project = activeId ? getProject(activeId) : null;
    const isRmus = project?.platform === 'samsung' || req.body?.source === 'rmus';
    const statusPayload = isRmus
      ? { rmusStatus: getRmusStatus().status }
      : { serialStatus: getSerialStatus().status };

    if (streamProgress && !res.headersSent) {
      res.setHeader('Content-Type', 'application/x-ndjson');
    }
    if (streamProgress && res.headersSent) {
      writeNdjson(res, { type: 'error', error: err.message, ...statusPayload });
      return res.end();
    }
    res.status(500).json({ error: err.message, ...statusPayload });
  }
});

// POST /api/capture/import — manual file upload
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const { screenId, sectionId } = req.body;
    const kind = req.body.kind === 'scroll' ? 'scroll' : 'base';
    if (!screenId || !req.file) {
      return res.status(400).json({ error: 'screenId and file are required' });
    }

    const screen = registerScreenshotImport(screenId, req.file.path, {
      sectionId: sectionId || null,
      kind,
    });
    res.json(screen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
