import { Router } from 'express';
import * as screenService from '../services/screens.js';
import { getStateVersion } from '../services/data-store.js';

const router = Router();

function stateEtag() {
  return `W/"v${getStateVersion()}"`;
}

// GET /api/screens
router.get('/', (req, res) => {
  const etag = stateEtag();
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.json(screenService.getAllScreens());
});

// POST /api/screens/duplicate
router.post('/duplicate', (req, res) => {
  try {
    const screens = screenService.duplicateScreens(req.body || {});
    res.status(201).json(screens);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/screens/:id
router.get('/:id', (req, res) => {
  const screen = screenService.getScreen(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Screen not found' });
  res.json(screen);
});

// POST /api/screens
router.post('/', (req, res) => {
  try {
    const screen = screenService.createScreen(req.body);
    res.status(201).json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/screens/:id
router.put('/:id', (req, res) => {
  try {
    const screen = screenService.updateScreen(req.params.id, req.body);
    res.json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/screens/:id?removeParentButtons=1
router.delete('/:id', (req, res) => {
  try {
    const removeParentButtons =
      req.query.removeParentButtons === '1' ||
      req.query.removeParentButtons === 'true';
    screenService.deleteScreen(req.params.id, { removeParentButtons });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
