import { Router } from 'express';
import {
  getImageConfig,
  getSamsungScrollPresets,
  getStateVersion,
  updateImageConfig,
  updateSamsungScrollPresets,
} from '../services/data-store.js';

const router = Router();

router.get('/', (req, res) => {
  const etag = `W/"v${getStateVersion()}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.json({
    imageSize: getImageConfig(),
    samsungScrollPresets: getSamsungScrollPresets(),
  });
});

router.put('/', (req, res) => {
  try {
    const body = req.body || {};
    let imageSize = getImageConfig();
    let samsungScrollPresets = getSamsungScrollPresets();

    if (body.imageSize !== undefined || (body.intrinsicWidth != null || body.intrinsicHeight != null)) {
      imageSize = updateImageConfig(body.imageSize || body);
    }
    if (body.samsungScrollPresets !== undefined) {
      samsungScrollPresets = updateSamsungScrollPresets(body.samsungScrollPresets);
    }

    res.json({ imageSize, samsungScrollPresets });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
