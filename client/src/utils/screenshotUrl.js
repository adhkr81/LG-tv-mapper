import { getCurrentProjectId } from '../api/client.js';

/** Screenshot URL with optional cache-bust query (same filename, new file on disk). */
export function screenshotUrl(filename, cacheKey) {
  if (!filename?.trim()) return '';
  const projectId = getCurrentProjectId();
  const base = projectId
    ? `/screenshots/${projectId}/${filename}`
    : `/screenshots/${filename}`;
  if (cacheKey == null || cacheKey === 0) return base;
  return `${base}?v=${cacheKey}`;
}
