import { Router } from 'express';
import * as buttonService from '../services/buttons.js';

const router = Router({ mergeParams: true });

// GET /api/screens/:id/buttons
router.get('/', (req, res) => {
  const buttons = buttonService.getButtons(req.params.id);
  res.json(buttons);
});

// POST /api/screens/:id/buttons/import
router.post('/import', async (req, res) => {
  try {
    const buttons = await buttonService.importButtonsFromScreen(
      req.params.id,
      req.body.fromScreenId,
      {
        includeTargets: req.body.includeTargets !== false,
        buttonIds: Array.isArray(req.body.buttonIds) ? req.body.buttonIds : null,
        layer: req.body.layer === 'scroll' ? 'scroll' : 'base',
      }
    );
    res.status(201).json(buttons);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/screens/:id/buttons
router.post('/', async (req, res) => {
  try {
    const button = await buttonService.addButton(req.params.id, req.body);
    res.status(201).json(button);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/screens/:id/buttons/:buttonId
router.put('/:buttonId', async (req, res) => {
  try {
    const button = await buttonService.updateButton(
      req.params.id,
      req.params.buttonId,
      req.body
    );
    res.json(button);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/screens/:id/buttons/:buttonId
router.delete('/:buttonId', async (req, res) => {
  try {
    await buttonService.deleteButton(req.params.id, req.params.buttonId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
