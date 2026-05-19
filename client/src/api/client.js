const API = '';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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
export const deleteScreen = (id) =>
  request(`/api/screens/${id}`, { method: 'DELETE' });

// Buttons
export const getButtons = (screenId) =>
  request(`/api/screens/${screenId}/buttons`);
export const addButton = (screenId, data) =>
  request(`/api/screens/${screenId}/buttons`, { method: 'POST', body: JSON.stringify(data) });
export const updateButton = (screenId, buttonId, data) =>
  request(`/api/screens/${screenId}/buttons/${buttonId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteButtonApi = (screenId, buttonId) =>
  request(`/api/screens/${screenId}/buttons/${buttonId}`, { method: 'DELETE' });

// Graph
export const getGraph = () => request('/api/graph');

// Sections
export const getSections = () => request('/api/sections');
export const createSection = (data) =>
  request('/api/sections', { method: 'POST', body: JSON.stringify(data) });
export const updateSection = (id, data) =>
  request(`/api/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSection = (id) =>
  request(`/api/sections/${id}`, { method: 'DELETE' });
