import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'screens.json');

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
  fs.writeFileSync(tmp, JSON.stringify({ sections, screens }, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

export function getAllSections() {
  return readData().sections;
}

export function getSection(id) {
  return readData().sections.find((s) => s.id === id) || null;
}

export function createSection({ id, name, rootScreenId = null }) {
  const data = readData();
  if (data.sections.find((s) => s.id === id)) {
    throw new Error(`Section "${id}" already exists`);
  }
  const section = {
    id,
    name: name || id,
    rootScreenId,
  };
  data.sections.push(section);
  writeData(data);
  return section;
}

export function updateSection(id, updates) {
  const data = readData();
  const idx = data.sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Section "${id}" not found`);

  if (updates.id && updates.id !== id) {
    if (data.sections.find((s) => s.id === updates.id)) {
      throw new Error(`Section "${updates.id}" already exists`);
    }
    const newId = updates.id;
    data.sections[idx].id = newId;
    data.screens = data.screens.map((screen) =>
      screen.sectionId === id ? { ...screen, sectionId: newId } : screen
    );
    id = newId;
  }

  if (updates.name !== undefined) data.sections[idx].name = updates.name;
  if (updates.rootScreenId !== undefined) {
    data.sections[idx].rootScreenId = updates.rootScreenId || null;
  }

  writeData(data);
  return data.sections[idx];
}

export function deleteSection(id) {
  const data = readData();
  const idx = data.sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Section "${id}" not found`);

  data.sections.splice(idx, 1);
  data.screens = data.screens.map((screen) =>
    screen.sectionId === id ? { ...screen, sectionId: null } : screen
  );
  writeData(data);
}

export function getScreensInSection(sectionId) {
  return readData().screens.filter((s) => s.sectionId === sectionId);
}
