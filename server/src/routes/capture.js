import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { captureFromTV, captureFromTVStream, importScreenshot } from '../services/capture.js';
import { createScreen, getScreenshotsDir } from '../services/screens.js';
import { ensureConnected, getStatus } from '../services/serial.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ dest: path.join(__dirname, '..', 'data', 'screenshots', '.tmp') });

const router = Router();

function writeNdjson(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
  if (typeof res.flush === 'function') res.flush();
}

// POST /api/capture — capture via serial (?stream=1 for progress NDJSON)
router.post('/', async (req, res) => {
  const streamProgress = req.query.stream === '1' || req.query.stream === 'true';

  try {
    const { screenId, sectionId } = req.body;
    const saveToLaptop = req.body.saveToLaptop === 'true' || req.body.saveToLaptop === true;
    if (!screenId) {
      return res.status(400).json({ error: 'screenId is required' });
    }

    await ensureConnected();

    const onProgress = streamProgress
      ? (progress) => writeNdjson(res, { type: 'progress', ...progress })
      : undefined;

    if (streamProgress) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    let filename;
    if (saveToLaptop) {
      filename = await captureFromTVStream(screenId, onProgress);
    } else {
      filename = await captureFromTV(screenId, onProgress);
    }

    onProgress?.({
      phase: 'finishing',
      percent: 98,
      label: 'Registering screen…',
    });

    const screen = createScreen({ id: screenId, image: filename, sectionId: sectionId || null });
    const result = { ...screen, serialStatus: getStatus().status };

    if (streamProgress) {
      writeNdjson(res, { type: 'done', ...result });
      return res.end();
    }

    res.json(result);
  } catch (err) {
    if (streamProgress && !res.headersSent) {
      res.setHeader('Content-Type', 'application/x-ndjson');
    }
    if (streamProgress && res.headersSent) {
      writeNdjson(res, { type: 'error', error: err.message, serialStatus: getStatus().status });
      return res.end();
    }
    res.status(500).json({ error: err.message, serialStatus: getStatus().status });
  }
});

// POST /api/capture/import — manual file upload
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const { screenId, sectionId } = req.body;
    if (!screenId || !req.file) {
      return res.status(400).json({ error: 'screenId and file are required' });
    }

    const filename = importScreenshot(screenId, req.file.path);
    const screen = createScreen({ id: screenId, image: filename, sectionId: sectionId || null });
    res.json(screen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
