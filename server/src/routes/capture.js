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

// POST /api/capture — capture via serial
router.post('/', async (req, res) => {
  try {
    const { screenId, sectionId } = req.body;
    const saveToLaptop = req.body.saveToLaptop === 'true' || req.body.saveToLaptop === true;
    if (!screenId) {
      return res.status(400).json({ error: 'screenId is required' });
    }

    await ensureConnected();

    let filename;
    if (saveToLaptop) {
      filename = await captureFromTVStream(screenId);
    } else {
      filename = await captureFromTV(screenId);
    }
    const screen = createScreen({ id: screenId, image: filename, sectionId: sectionId || null });
    res.json({ ...screen, serialStatus: getStatus().status });
  } catch (err) {
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
