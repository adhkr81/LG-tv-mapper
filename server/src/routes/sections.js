import { Router } from 'express';
import * as sectionService from '../services/sections.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(sectionService.getAllSections());
});

router.get('/:id', (req, res) => {
  const section = sectionService.getSection(req.params.id);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
});

router.post('/', (req, res) => {
  try {
    const section = sectionService.createSection(req.body);
    res.status(201).json(section);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const section = sectionService.updateSection(req.params.id, req.body);
    res.json(section);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    sectionService.deleteSection(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
