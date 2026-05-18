import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { captureFromTV, importScreenshot } from '../services/capture.js';
import { createScreen, getScreenshotsDir } from '../services/screens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ dest: path.join(__dirname, '..', 'data', 'screenshots', '.tmp') });

const router = Router();

// POST /api/capture — capture via serial
router.post('/', async (req, res) => {
  try {
    const { screenId } = req.body;
    if (!screenId) {
      return res.status(400).json({ error: 'screenId is required' });
    }

    const filename = await captureFromTV(screenId);
    const screen = createScreen({ id: screenId, image: filename });
    res.json(screen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/capture/import — manual file upload
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const { screenId } = req.body;
    if (!screenId || !req.file) {
      return res.status(400).json({ error: 'screenId and file are required' });
    }

    const filename = importScreenshot(screenId, req.file.path);
    const screen = createScreen({ id: screenId, image: filename });
    res.json(screen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
