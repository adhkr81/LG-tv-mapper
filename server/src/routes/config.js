import { Router } from 'express';
import {
  getImageConfig,
  getStateVersion,
  updateImageConfig,
} from '../services/data-store.js';

const router = Router();

router.get('/', (req, res) => {
  const etag = `W/"v${getStateVersion()}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.json({ imageSize: getImageConfig() });
});

router.put('/', (req, res) => {
  try {
    const imageSize = updateImageConfig(req.body?.imageSize || req.body);
    res.json({ imageSize });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
