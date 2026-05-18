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

/**
 * Get all buttons for a screen.
 * @param {string} screenId
 * @returns {Array}
 */
export function getButtons(screenId) {
  const screen = readData().find((s) => s.id === screenId);
  return screen ? screen.buttons : [];
}

/**
 * Add a button to a screen.
 * @param {string} screenId
 * @param {{ label: string, target: string, x: number, y: number }} data
 */
export function addButton(screenId, { label, target, x, y }) {
  const screens = readData();
  const screen = screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Screen "${screenId}" not found`);

  const button = {
    id: uuidv4(),
    screenId,
    label,
    target: target || '',
    x,
    y,
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
  if (updates.x !== undefined) btn.x = updates.x;
  if (updates.y !== undefined) btn.y = updates.y;

  writeData(screens);
  return btn;
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
