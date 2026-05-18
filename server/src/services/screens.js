import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'screens.json');

/**
 * Read all screens from the JSON file.
 * @returns {Array} screens
 */
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw).screens || [];
  } catch {
    return [];
  }
}

/**
 * Write screens array to the JSON file (atomic).
 * @param {Array} screens
 */
function writeData(screens) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ screens }, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

/**
 * Get all screens.
 */
export function getAllScreens() {
  return readData();
}

/**
 * Get a screen by id.
 * @param {string} id
 */
export function getScreen(id) {
  return readData().find((s) => s.id === id) || null;
}

/**
 * Create a new screen.
 * @param {{ id: string, image: string }} data
 */
export function createScreen({ id, image }) {
  const screens = readData();
  if (screens.find((s) => s.id === id)) {
    throw new Error(`Screen "${id}" already exists`);
  }
  const screen = { id, image, buttons: [] };
  screens.push(screen);
  writeData(screens);
  return screen;
}

/**
 * Update a screen (name only — not buttons).
 * @param {string} id
 * @param {{ id?: string }} updates
 */
export function updateScreen(id, updates) {
  const screens = readData();
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  if (updates.id && updates.id !== id) {
    // Rename: update id and also update all buttons' screenId
    if (screens.find((s) => s.id === updates.id)) {
      throw new Error(`Screen "${updates.id}" already exists`);
    }
    screens[idx].id = updates.id;
    screens[idx].buttons = screens[idx].buttons.map((b) => ({
      ...b,
      screenId: updates.id,
    }));
  }

  writeData(screens);
  return screens[idx];
}

/**
 * Delete a screen and its screenshot file.
 * @param {string} id
 */
export function deleteScreen(id) {
  const screens = readData();
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  const screen = screens[idx];

  // Delete screenshot file
  const imgPath = path.join(__dirname, '..', 'data', 'screenshots', screen.image);
  if (fs.existsSync(imgPath)) {
    fs.unlinkSync(imgPath);
  }

  screens.splice(idx, 1);
  writeData(screens);
}

/**
 * Get the absolute path to a screen's image.
 * @param {string} filename
 */
export function getScreenshotPath(filename) {
  return path.join(__dirname, '..', 'data', 'screenshots', filename);
}

/**
 * Get the screenshots directory path.
 */
export function getScreenshotsDir() {
  return path.join(__dirname, '..', 'data', 'screenshots');
}
