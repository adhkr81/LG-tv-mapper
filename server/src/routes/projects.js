import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  renameProject,
  deleteProject,
} from '../services/projects.js';
import {
  activateProject,
  clearActiveProject,
  getActiveProjectId,
} from '../services/data-store.js';

const router = Router();

// GET /api/projects
router.get('/', (_req, res) => {
  try {
    res.json({ projects: listProjects() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
router.post('/', (req, res) => {
  try {
    const project = createProject({
      name: req.body?.name,
      platform: req.body?.platform,
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:projectId
router.get('/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// PUT /api/projects/:projectId — rename
router.put('/:projectId', (req, res) => {
  try {
    const project = renameProject(req.params.projectId, req.body?.name);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    if (getActiveProjectId() === projectId) {
      clearActiveProject();
    }
    const ok = deleteProject(projectId);
    if (!ok) return res.status(404).json({ error: 'Project not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/open — load into data-store
router.post('/:projectId/open', (req, res) => {
  try {
    activateProject(req.params.projectId);
    const project = getProject(req.params.projectId);
    res.json(project);
  } catch (err) {
    const status = String(err.message || '').includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
