const API = '';

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

async function request(url, options = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(`${API}${url}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      return request(url, options, attempt + 1);
    }
    throw new Error(
      'Could not reach the API server. If you were dragging hotspots, wait a moment and try again.'
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (attempt < 2 && RETRYABLE_STATUSES.has(res.status)) {
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      return request(url, options, attempt + 1);
    }
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Serial
export const getSerialStatus = () => request('/api/serial/status');
export const connectSerial = () => request('/api/serial/connect', { method: 'POST' });
export const disconnectSerial = () => request('/api/serial/disconnect', { method: 'POST' });

// Capture
export const captureScreen = (screenId, saveToLaptop = false, sectionId = null) =>
  request('/api/capture', {
    method: 'POST',
    body: JSON.stringify({ screenId, saveToLaptop, sectionId }),
  });

/** Capture with NDJSON progress events from the server (USB save polling, etc.). */
export async function captureScreenWithProgress(
  screenId,
  saveToLaptop = false,
  sectionId = null,
  onProgress
) {
  const res = await fetch(`${API}/api/capture?stream=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenId, saveToLaptop, sectionId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Capture failed: ${res.status}`);
  }

  if (!res.body) {
    throw new Error('Capture stream not available');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (evt.type === 'progress') {
        onProgress?.({
          phase: evt.phase,
          percent: evt.percent,
          label: evt.label,
        });
      } else if (evt.type === 'done') {
        result = evt;
      } else if (evt.type === 'error') {
        throw new Error(evt.error || 'Capture failed');
      }
    }
  }

  if (!result) {
    throw new Error('Capture ended without a result');
  }
  return result;
}

export const importScreen = async (screenId, file, sectionId = null) => {
  const formData = new FormData();
  formData.append('screenId', screenId);
  formData.append('file', file);
  if (sectionId) formData.append('sectionId', sectionId);
  const res = await fetch(`${API}/api/capture/import`, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Import failed');
  }
  return res.json();
};

// Screens
export const getScreens = () => request('/api/screens');
export const getScreen = (id) => request(`/api/screens/${id}`);
export const createScreen = (data) =>
  request('/api/screens', { method: 'POST', body: JSON.stringify(data) });
export const updateScreen = (id, data) =>
  request(`/api/screens/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteScreen = (id, { removeParentButtons = false } = {}) => {
  const q = removeParentButtons ? '?removeParentButtons=1' : '';
  return request(`/api/screens/${id}${q}`, { method: 'DELETE' });
};

// Buttons
export const getButtons = (screenId) =>
  request(`/api/screens/${screenId}/buttons`);
export const addButton = (screenId, data) =>
  request(`/api/screens/${screenId}/buttons`, { method: 'POST', body: JSON.stringify(data) });
export const importButtons = (screenId, fromScreenId, options = {}) => {
  const { includeTargets = true, buttonIds = null } = options;
  return request(`/api/screens/${screenId}/buttons/import`, {
    method: 'POST',
    body: JSON.stringify({ fromScreenId, includeTargets, buttonIds }),
  });
};
export const updateButton = (screenId, buttonId, data) =>
  request(`/api/screens/${screenId}/buttons/${buttonId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteButtonApi = (screenId, buttonId) =>
  request(`/api/screens/${screenId}/buttons/${buttonId}`, { method: 'DELETE' });

// Graph
export const getGraph = () => request('/api/graph');

// Full mapper state (undo restore)
export const restoreMapperState = (screens, sections) =>
  request('/api/state', {
    method: 'PUT',
    body: JSON.stringify({ screens, sections }),
  });

// Config
export const getConfig = () => request('/api/config');
export const updateConfig = (imageSize) =>
  request('/api/config', { method: 'PUT', body: JSON.stringify({ imageSize }) });

// Sections
export const getSections = () => request('/api/sections');
export const createSection = (data) =>
  request('/api/sections', { method: 'POST', body: JSON.stringify(data) });
export const updateSection = (id, data) =>
  request(`/api/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSection = (id) =>
  request(`/api/sections/${id}`, { method: 'DELETE' });
