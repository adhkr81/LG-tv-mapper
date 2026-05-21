import { Router } from 'express';
import * as dataStore from '../services/data-store.js';

const router = Router();

/** PUT /api/state — replace full mapper screens + sections (used for undo). */
router.put('/', (req, res) => {
  try {
    const { screens, sections } = req.body ?? {};
    const result = dataStore.replaceMapperState(screens, sections);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
