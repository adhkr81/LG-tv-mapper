import { Router } from 'express';
import * as rmus from '../services/rmus.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json(rmus.getStatus());
});

router.post('/connect', async (req, res) => {
  try {
    const fresh = req.body?.fresh === true || req.query?.fresh === '1';
    const result = await rmus.connect({ fresh });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, ...rmus.getStatus() });
  }
});

router.post('/confirm-pin', async (_req, res) => {
  try {
    const result = await rmus.confirmPin();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, ...rmus.getStatus() });
  }
});

router.post('/disconnect', async (_req, res) => {
  try {
    const result = await rmus.disconnect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
