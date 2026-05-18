import { Router } from 'express';
import { getAllScreens } from '../services/screens.js';

const router = Router();

// GET /api/graph — returns screens + derived edges
router.get('/', (req, res) => {
  const screens = getAllScreens();

  // Derive edges from buttons
  const edges = [];
  const screenIds = new Set(screens.map((s) => s.id));

  for (const screen of screens) {
    for (const button of screen.buttons) {
      if (button.target && screenIds.has(button.target)) {
        edges.push({
          source: screen.id,
          target: button.target,
          buttonId: button.id,
          label: button.label,
        });
      }
    }
  }

  res.json({ screens, edges });
});

export default router;
