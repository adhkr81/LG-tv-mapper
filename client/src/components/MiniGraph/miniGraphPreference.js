const GRAPH_OPEN_STORAGE_KEY = 'lg-mapper-mini-graph-collapsed';

/** @returns {boolean} whether the screen graph panel is open */
export function loadGraphOpenPreference() {
  try {
    const v = localStorage.getItem(GRAPH_OPEN_STORAGE_KEY);
    if (v === null) return false;
    return v !== '1';
  } catch {
    return false;
  }
}

export function saveGraphOpenPreference(open) {
  try {
    localStorage.setItem(GRAPH_OPEN_STORAGE_KEY, open ? '0' : '1');
  } catch {
    /* ignore */
  }
}
