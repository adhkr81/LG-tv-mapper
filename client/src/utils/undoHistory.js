const MAX_HISTORY = 50;
const COALESCE_MS = 800;

/** @type {{ screens: unknown[], sections: unknown[] }[]} */
let past = [];
let coalesceKey = null;
let coalesceUntil = 0;

export function cloneMapperState(screens, sections) {
  return structuredClone({ screens, sections });
}

/** Remember current mapper data before a user edit (coalesces rapid drags). */
export function recordUndo(screens, sections, key = null) {
  const now = Date.now();
  if (key && key === coalesceKey && now < coalesceUntil) {
    return;
  }
  past.push(cloneMapperState(screens, sections));
  if (past.length > MAX_HISTORY) past.shift();
  coalesceKey = key;
  coalesceUntil = key ? now + COALESCE_MS : 0;
}

export function canUndo() {
  return past.length > 0;
}

export function popUndoSnapshot() {
  const snapshot = past.pop() ?? null;
  if (!past.length) {
    coalesceKey = null;
    coalesceUntil = 0;
  }
  return snapshot;
}

export function clearUndoHistory() {
  past = [];
  coalesceKey = null;
  coalesceUntil = 0;
}
