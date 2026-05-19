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
    const parsed = JSON.parse(raw);
    return {
      sections: parsed.sections || [],
      screens: parsed.screens || [],
    };
  } catch {
    return { sections: [], screens: [] };
  }
}

function writeData({ sections, screens }) {
  const tmp = DATA_FILE + '.tmp';
  const data = readData();
  fs.writeFileSync(
    tmp,
    JSON.stringify(
      {
        sections: sections ?? data.sections,
        screens: screens ?? data.screens,
      },
      null,
      2
    ),
    'utf-8'
  );
  fs.renameSync(tmp, DATA_FILE);
}

function readScreens() {
  return readData().screens;
}

/**
 * Get all screens.
 */
export function getAllScreens() {
  return readScreens();
}

/**
 * Get a screen by id.
 * @param {string} id
 */
export function getScreen(id) {
  return readScreens().find((s) => s.id === id) || null;
}

/**
 * Create a new screen.
 * @param {{ id: string, image: string }} data
 */
function layoutForSection(screens, sectionId) {
  const inSection = screens.filter((s) => s.sectionId === sectionId);
  const i = inSection.length;
  const col = i % 4;
  const row = Math.floor(i / 4);
  return {
    graphX: col * 220,
    graphY: row * 185,
  };
}

export function createScreen({ id, image, sectionId = null }) {
  const data = readData();
  const { screens } = data;
  if (screens.find((s) => s.id === id)) {
    throw new Error(`Screen "${id}" already exists`);
  }
  const i = screens.length;
  const layout = sectionId
    ? layoutForSection(screens, sectionId)
    : { graphX: (i % 4) * 220, graphY: Math.floor(i / 4) * 185 };

  const screen = {
    id,
    image,
    buttons: [],
    sectionId: sectionId || null,
    ...layout,
  };
  screens.push(screen);
  writeData({ ...data, screens });
  return screen;
}

/**
 * Update a screen (name only — not buttons).
 * @param {string} id
 * @param {{ id?: string }} updates
 */
export function updateScreen(id, updates) {
  const data = readData();
  const { screens, sections } = data;
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  if (updates.id && updates.id !== id) {
    if (screens.find((s) => s.id === updates.id)) {
      throw new Error(`Screen "${updates.id}" already exists`);
    }
    const newId = updates.id;
    screens[idx].id = newId;
    screens[idx].buttons = screens[idx].buttons.map((b) => ({
      ...b,
      screenId: newId,
    }));
    sections.forEach((sec) => {
      if (sec.rootScreenId === id) sec.rootScreenId = newId;
    });
    id = newId;
  }

  if (updates.graphX !== undefined) screens[idx].graphX = updates.graphX;
  if (updates.graphY !== undefined) screens[idx].graphY = updates.graphY;
  if (updates.sectionId !== undefined) {
    screens[idx].sectionId = updates.sectionId || null;
  }

  writeData({ sections, screens });
  return screens[idx];
}

/**
 * Delete a screen and its screenshot file.
 * @param {string} id
 */
export function deleteScreen(id) {
  const data = readData();
  const { screens, sections } = data;
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  const screen = screens[idx];

  const imgPath = path.join(__dirname, '..', 'data', 'screenshots', screen.image);
  if (fs.existsSync(imgPath)) {
    fs.unlinkSync(imgPath);
  }

  sections.forEach((sec) => {
    if (sec.rootScreenId === id) sec.rootScreenId = null;
  });

  screens.splice(idx, 1);
  writeData({ sections, screens });
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
