import { Router } from 'express';
import * as screenService from '../services/screens.js';

const router = Router();

// GET /api/screens
router.get('/', (req, res) => {
  res.json(screenService.getAllScreens());
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
