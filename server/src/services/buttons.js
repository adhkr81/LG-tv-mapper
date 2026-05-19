import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'screens.json');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw).screens || [];
  } catch {
    return [];
  }
}

function writeData(screens) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ screens }, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

const DEFAULT_BUTTON_SIZE = { width: 120, height: 60 };

function normalizeButton(btn) {
  if (
    btn.left != null &&
    btn.top != null &&
    btn.width != null &&
    btn.height != null
  ) {
    return btn;
  }

  const width = btn.width ?? DEFAULT_BUTTON_SIZE.width;
  const height = btn.height ?? DEFAULT_BUTTON_SIZE.height;
  const x = btn.x ?? 0;
  const y = btn.y ?? 0;

  return {
    ...btn,
    left: Math.round(x - width / 2),
    top: Math.round(y - height / 2),
    width,
    height,
  };
}

/**
 * Get all buttons for a screen.
 * @param {string} screenId
 * @returns {Array}
 */
export function getButtons(screenId) {
  const screen = readData().find((s) => s.id === screenId);
  return screen ? screen.buttons.map(normalizeButton) : [];
}

/**
 * Add a button to a screen.
 * @param {string} screenId
 * @param {{ label: string, target: string, x: number, y: number }} data
 */
export function addButton(screenId, data) {
  const screens = readData();
  const screen = screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Screen "${screenId}" not found`);

  const { label, target, left, top, width, height, x, y } = data;
  const normalized = normalizeButton({
    label,
    target: target || '',
    left,
    top,
    width,
    height,
    x,
    y,
  });

  const button = {
    id: uuidv4(),
    screenId,
    label: normalized.label,
    target: normalized.target,
    left: normalized.left,
    top: normalized.top,
    width: normalized.width,
    height: normalized.height,
  };

  screen.buttons.push(button);
  writeData(screens);
  return button;
}

/**
 * Update a button.
 * @param {string} screenId
 * @param {string} buttonId
 * @param {Object} updates
 */
export function updateButton(screenId, buttonId, updates) {
  const screens = readData();
  const screen = screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Screen "${screenId}" not found`);

  const btn = screen.buttons.find((b) => b.id === buttonId);
  if (!btn) throw new Error(`Button "${buttonId}" not found`);

  if (updates.label !== undefined) btn.label = updates.label;
  if (updates.target !== undefined) btn.target = updates.target;
  if (updates.left !== undefined) btn.left = updates.left;
  if (updates.top !== undefined) btn.top = updates.top;
  if (updates.width !== undefined) btn.width = updates.width;
  if (updates.height !== undefined) btn.height = updates.height;

  if (updates.x !== undefined || updates.y !== undefined) {
    const merged = normalizeButton({ ...btn, x: updates.x ?? btn.x, y: updates.y ?? btn.y });
    btn.left = merged.left;
    btn.top = merged.top;
    btn.width = merged.width;
    btn.height = merged.height;
    delete btn.x;
    delete btn.y;
  }

  writeData(screens);
  return normalizeButton(btn);
}

/**
 * Delete a button.
 * @param {string} screenId
 * @param {string} buttonId
 */
export function deleteButton(screenId, buttonId) {
  const screens = readData();
  const screen = screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Screen "${screenId}" not found`);

  const idx = screen.buttons.findIndex((b) => b.id === buttonId);
  if (idx === -1) throw new Error(`Button "${buttonId}" not found`);

  screen.buttons.splice(idx, 1);
  writeData(screens);
}
