import { Router } from 'express';
import { getImageConfig, updateImageConfig } from '../services/data-store.js';

const router = Router();

router.get('/', (req, res) => {
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
