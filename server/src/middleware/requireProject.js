import { activateProject } from '../services/data-store.js';
import { projectExists } from '../services/projects.js';

/**
 * Ensures the URL :projectId exists and is loaded into the data-store
 * before project-scoped route handlers run.
 */
export function requireProject(req, res, next) {
  const projectId = req.params.projectId;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  try {
    activateProject(projectId);
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
