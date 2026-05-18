import { Router } from 'express';
import * as serialService from '../services/serial.js';

const router = Router();

// GET /api/serial/status
router.get('/status', (req, res) => {
  res.json(serialService.getStatus());
});

// POST /api/serial/connect
router.post('/connect', async (req, res) => {
  try {
    const result = await serialService.connect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/serial/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    const result = await serialService.disconnect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
