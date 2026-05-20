import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';
import {
  buttonFromEmulator,
  buttonToEmulator,
  parsePx,
  screenFromEmulator,
  screenToEmulator,
  stripImageExtension,
} from './emulator-format.js';
import {
  DEFAULT_IMAGE_CONFIG,
  normalizeImageConfig,
  screenLikelySourceSpace,
  toIntrinsicRect,
} from './coords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const LEGACY_FILE = path.join(DATA_DIR, 'screens.json');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

const DEFAULT_BUTTON_SIZE = { width: 120, height: 60 };

/** @typedef {{ id: string, name: string, rootScreenId: string | null, bandX?: number | null, bandY?: number | null }} Section */
/** @typedef {{ graphX?: number, graphY?: number, sectionId?: string | null, buttonIds?: string[] }} ScreenMeta */
/**
 * @typedef {Object} MapperButton
 * @property {string} id
 * @property {string} screenId
 * @property {string} label
 * @property {string} target
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 * @property {Object} [popover]
 * @property {string} [type]
 */
/**
 * @typedef {Object} MapperScreen
 * @property {string} id
 * @property {string} image
 * @property {string} img_filename
 * @property {number} preset
 * @property {MapperButton[]} buttons
 * @property {number} graphX
 * @property {number} graphY
 * @property {string | null} sectionId
 */

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function readEmulatorMap() {
  ensureDataDir();
  if (!fs.existsSync(config.emulatorDataPath)) {
    return null;
  }
  const parsed = readJson(config.emulatorDataPath, null);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    return {};
  }
  return parsed;
}

function readMetaFile() {
  ensureDataDir();
  if (!fs.existsSync(config.mapperMetaPath)) {
    return {
      sections: [],
      screens: {},
      config: { imageSize: { ...DEFAULT_IMAGE_CONFIG } },
    };
  }
  const parsed = readJson(config.mapperMetaPath, { sections: [], screens: {} });
  return {
    sections: parsed.sections || [],
    screens: parsed.screens || {},
    config: {
      imageSize: normalizeImageConfig(parsed.config?.imageSize),
    },
  };
}

function writeEmulatorAndMeta(emulatorMap, meta) {
  ensureDataDir();
  atomicWrite(config.emulatorDataPath, emulatorMap);
  atomicWrite(config.mapperMetaPath, meta);
}

function resolveImageFilename(screenId, imgFilename) {
  const base = imgFilename || screenId;
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const name = base.includes('.') ? base : base + ext;
    if (fs.existsSync(path.join(SCREENSHOTS_DIR, name))) {
      return name;
    }
  }
  return base.includes('.') ? base : `${base}.jpg`;
}

function emulatorAndMetaToScreens(emulatorMap, meta) {
  return Object.entries(emulatorMap).map(([screenId, entry]) => {
    const screenMeta = meta.screens[screenId];
    const imgFilename =
      typeof entry.img_filename === 'string' ? entry.img_filename : screenId;
    const image = resolveImageFilename(screenId, imgFilename);
    const screen = screenFromEmulator(screenId, entry, screenMeta, image);
    screen.buttons = screen.buttons.map((b) => ({
      ...b,
      id: b.id || uuidv4(),
    }));
    screen.sourceWidth = screenMeta?.sourceWidth ?? null;
    screen.sourceHeight = screenMeta?.sourceHeight ?? null;
    return screen;
  });
}

function screensToEmulatorAndMeta(screens, sections, metaFile) {
  const emulatorMap = {};
  const metaScreens = {};

  for (const screen of screens) {
    emulatorMap[screen.id] = screenToEmulator(screen);
    metaScreens[screen.id] = {
      graphX: screen.graphX ?? 0,
      graphY: screen.graphY ?? 0,
      sectionId: screen.sectionId ?? null,
      buttonIds: screen.buttons.map((b) => b.id),
      ...(screen.sourceWidth ? { sourceWidth: screen.sourceWidth } : {}),
      ...(screen.sourceHeight ? { sourceHeight: screen.sourceHeight } : {}),
    };
  }

  return {
    emulatorMap,
    meta: {
      sections,
      screens: metaScreens,
      config: metaFile.config,
    },
  };
}

function persist(screens, sections) {
  const metaFile = readMetaFile();
  const { emulatorMap, meta } = screensToEmulatorAndMeta(screens, sections, metaFile);
  writeEmulatorAndMeta(emulatorMap, meta);
}

function maybeConvertScreenButtonsToIntrinsic(screen, imageConfig) {
  if (!screenLikelySourceSpace(screen, imageConfig)) return false;
  screen.buttons = screen.buttons.map((btn) => {
    const next = toIntrinsicRect(btn, screen, imageConfig);
    return { ...btn, ...next };
  });
  return true;
}

function loadLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return null;
  const parsed = readJson(LEGACY_FILE, null);
  if (!parsed) return null;

  const sections = parsed.sections || [];
  const screens = (parsed.screens || []).map((s) => ({
    ...s,
    img_filename: stripImageExtension(s.image) || s.id,
    preset: s.preset ?? 0,
    graphX: s.graphX ?? 0,
    graphY: s.graphY ?? 0,
    sectionId: s.sectionId ?? null,
    buttons: (s.buttons || []).map((b) => normalizeMapperButton(s.id, b)),
  }));

  return { sections, screens };
}

function migrateLegacyIfNeeded() {
  const existing = readEmulatorMap();
  if (existing !== null && Object.keys(existing).length > 0) return;

  const legacy = loadLegacy();
  if (!legacy || legacy.screens.length === 0) return;

  persist(legacy.screens, legacy.sections);
  const backup = LEGACY_FILE + '.bak';
  if (!fs.existsSync(backup)) {
    fs.renameSync(LEGACY_FILE, backup);
  }
  console.log(
    `[DataStore] Migrated ${legacy.screens.length} screen(s) from screens.json → emulator.json`
  );
}

function readAll() {
  migrateLegacyIfNeeded();

  const emulatorMap = readEmulatorMap();
  if (emulatorMap === null) {
    const meta = readMetaFile();
    return { sections: [], screens: [], imageConfig: meta.config.imageSize };
  }

  const meta = readMetaFile();
  const screens = emulatorAndMetaToScreens(emulatorMap, meta);
  return { sections: meta.sections, screens, imageConfig: meta.config.imageSize };
}

function writeAll(screens, sections) {
  persist(screens, sections);
}

/** Serialize read–modify–write so rapid hotspot drags do not clobber each other. */
let storeLock = Promise.resolve();

function runSerialized(fn) {
  const result = storeLock.then(() => fn());
  storeLock = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function finitePx(value, fallback = 0) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeButtonUpdates(updates) {
  const out = { ...updates };
  if (out.left !== undefined) out.left = finitePx(out.left, 0);
  if (out.top !== undefined) out.top = finitePx(out.top, 0);
  if (out.width !== undefined) out.width = Math.max(1, finitePx(out.width, 1));
  if (out.height !== undefined) out.height = Math.max(1, finitePx(out.height, 1));
  return out;
}

function normalizeMapperButton(screenId, btn) {
  if (
    btn.left != null &&
    btn.top != null &&
    btn.width != null &&
    btn.height != null
  ) {
    return {
      id: btn.id || uuidv4(),
      screenId,
      label: btn.label || btn.popover?.title || '',
      target: btn.target || '',
      left: parsePx(btn.left),
      top: parsePx(btn.top),
      width: parsePx(btn.width),
      height: parsePx(btn.height),
      ...(btn.popover ? { popover: btn.popover } : {}),
      ...(btn.type ? { type: btn.type } : {}),
    };
  }

  const width = btn.width ?? DEFAULT_BUTTON_SIZE.width;
  const height = btn.height ?? DEFAULT_BUTTON_SIZE.height;
  const x = btn.x ?? 0;
  const y = btn.y ?? 0;

  return normalizeMapperButton(screenId, {
    ...btn,
    left: Math.round(x - width / 2),
    top: Math.round(y - height / 2),
    width,
    height,
  });
}

const LAYOUT_NODE_W = 200;
const LAYOUT_NODE_H = 185;
const LAYOUT_COL_STEP = 220;
const LAYOUT_ROW_STEP = 185;

function positionsOverlapLayout(a, b) {
  return (
    Math.abs(a.x - b.x) < LAYOUT_NODE_W &&
    Math.abs(a.y - b.y) < LAYOUT_NODE_H
  );
}

function layoutForSection(screens, sectionId) {
  const inSection = screens.filter((s) => s.sectionId === sectionId);
  const occupied = inSection.map((s) => ({
    x: s.graphX ?? 0,
    y: s.graphY ?? 0,
  }));

  for (let n = 0; n < 200; n += 1) {
    const col = n % 4;
    const row = Math.floor(n / 4);
    const candidate = { graphX: col * LAYOUT_COL_STEP, graphY: row * LAYOUT_ROW_STEP };
    const overlaps = occupied.some((p) =>
      positionsOverlapLayout(
        { x: candidate.graphX, y: candidate.graphY },
        p
      )
    );
    if (!overlaps) return candidate;
  }

  const maxX = occupied.length
    ? Math.max(...occupied.map((p) => p.x))
    : 0;
  return {
    graphX: maxX + 280,
    graphY: inSection.length * LAYOUT_ROW_STEP,
  };
}

function renameScreenIdInTargets(screens, oldId, newId) {
  for (const screen of screens) {
    for (const btn of screen.buttons) {
      if (btn.target === oldId) btn.target = newId;
    }
  }
}

// ---- Public API (used by screens, buttons, sections) ----

export function getScreenshotsDir() {
  ensureDataDir();
  return SCREENSHOTS_DIR;
}

export function getScreenshotPath(filename) {
  return path.join(getScreenshotsDir(), filename);
}

export function getAllScreens() {
  return readAll().screens;
}

export function getScreen(id) {
  return readAll().screens.find((s) => s.id === id) || null;
}

export function createScreen({ id, image, sectionId = null }) {
  const { sections, screens } = readAll();
  if (screens.find((s) => s.id === id)) {
    throw new Error(`Screen "${id}" already exists`);
  }

  const i = screens.length;
  const layout = sectionId
    ? layoutForSection(screens, sectionId)
    : { graphX: (i % 4) * 220, graphY: Math.floor(i / 4) * 185 };

  const img_filename = stripImageExtension(image) || id;
  const screen = {
    id,
    image,
    img_filename,
    preset: 0,
    buttons: [],
    sectionId: sectionId || null,
    sourceWidth: null,
    sourceHeight: null,
    ...layout,
  };

  screens.push(screen);
  writeAll(screens, sections);
  return screen;
}

export function updateScreen(id, updates) {
  const { sections, screens } = readAll();
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  if (updates.id && updates.id !== id) {
    const newId = updates.id;
    if (screens.find((s) => s.id === newId)) {
      throw new Error(`Screen "${newId}" already exists`);
    }

    renameScreenIdInTargets(screens, id, newId);
    screens[idx].id = newId;
    screens[idx].img_filename = newId;
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
  if (updates.preset !== undefined) screens[idx].preset = updates.preset;
  if (updates.image !== undefined) {
    screens[idx].image = updates.image;
    screens[idx].img_filename =
      stripImageExtension(updates.image) || screens[idx].id;
  }

  const imageConfig = readMetaFile().config.imageSize;
  let sourceChanged = false;
  if (updates.sourceWidth !== undefined) {
    screens[idx].sourceWidth = updates.sourceWidth || null;
    sourceChanged = true;
  }
  if (updates.sourceHeight !== undefined) {
    screens[idx].sourceHeight = updates.sourceHeight || null;
    sourceChanged = true;
  }
  if (sourceChanged && maybeConvertScreenButtonsToIntrinsic(screens[idx], imageConfig)) {
    console.log(
      `[DataStore] Converted hotspots on "${screens[idx].id}" to product size (${imageConfig.intrinsicWidth}×${imageConfig.intrinsicHeight})`
    );
  }

  writeAll(screens, sections);
  return screens[idx];
}

export function deleteScreen(id) {
  const { sections, screens } = readAll();
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  const screen = screens[idx];
  const imgPath = getScreenshotPath(screen.image);
  if (fs.existsSync(imgPath)) {
    fs.unlinkSync(imgPath);
  }

  sections.forEach((sec) => {
    if (sec.rootScreenId === id) sec.rootScreenId = null;
  });

  screens.splice(idx, 1);
  writeAll(screens, sections);
}

export function getButtons(screenId) {
  const screen = getScreen(screenId);
  return screen ? screen.buttons : [];
}

export function addButton(screenId, data) {
  return runSerialized(() => {
    const { sections, screens } = readAll();
    const screen = screens.find((s) => s.id === screenId);
    if (!screen) throw new Error(`Screen "${screenId}" not found`);

    const normalized = normalizeMapperButton(screenId, data);
    const button = {
      id: uuidv4(),
      screenId,
      label: normalized.label,
      target: normalized.target,
      left: normalized.left,
      top: normalized.top,
      width: normalized.width,
      height: normalized.height,
      ...(normalized.popover ? { popover: normalized.popover } : {}),
      ...(normalized.type ? { type: normalized.type } : {}),
    };

    screen.buttons.push(button);
    writeAll(screens, sections);
    return button;
  });
}

export function updateButton(screenId, buttonId, updates) {
  return runSerialized(() => {
    const patch = sanitizeButtonUpdates(updates);
    const { sections, screens } = readAll();
    const screen = screens.find((s) => s.id === screenId);
    if (!screen) throw new Error(`Screen "${screenId}" not found`);

    const btn = screen.buttons.find((b) => b.id === buttonId);
    if (!btn) throw new Error(`Button "${buttonId}" not found`);

    if (patch.label !== undefined) {
      btn.label = patch.label;
    }
    if (patch.target !== undefined) btn.target = patch.target;
    if (patch.left !== undefined) btn.left = patch.left;
    if (patch.top !== undefined) btn.top = patch.top;
    if (patch.width !== undefined) btn.width = patch.width;
    if (patch.height !== undefined) btn.height = patch.height;
    if (patch.popover !== undefined) btn.popover = patch.popover;
    if (patch.type !== undefined) btn.type = patch.type || undefined;

    if (patch.x !== undefined || patch.y !== undefined) {
      const merged = normalizeMapperButton(screenId, {
        ...btn,
        x: patch.x ?? btn.x,
        y: patch.y ?? btn.y,
      });
      btn.left = merged.left;
      btn.top = merged.top;
      btn.width = merged.width;
      btn.height = merged.height;
    }

    writeAll(screens, sections);
    return normalizeMapperButton(screenId, btn);
  });
}

export function deleteButton(screenId, buttonId) {
  return runSerialized(() => {
    const { sections, screens } = readAll();
    const screen = screens.find((s) => s.id === screenId);
    if (!screen) throw new Error(`Screen "${screenId}" not found`);

    const idx = screen.buttons.findIndex((b) => b.id === buttonId);
    if (idx === -1) throw new Error(`Button "${buttonId}" not found`);

    screen.buttons.splice(idx, 1);
    writeAll(screens, sections);
  });
}

export function importButtonsFromScreen(
  targetScreenId,
  sourceScreenId,
  { includeTargets = true, buttonIds = null } = {}
) {
  return runSerialized(() => {
    if (targetScreenId === sourceScreenId) {
      throw new Error('Cannot import buttons from the same screen');
    }
    const { sections, screens } = readAll();
    const target = screens.find((s) => s.id === targetScreenId);
    const source = screens.find((s) => s.id === sourceScreenId);
    if (!target) throw new Error(`Screen "${targetScreenId}" not found`);
    if (!source) throw new Error(`Screen "${sourceScreenId}" not found`);
    if (source.buttons.length === 0) {
      throw new Error(`Screen "${sourceScreenId}" has no buttons to import`);
    }

    const idSet = buttonIds?.length ? new Set(buttonIds) : null;
    const templates = idSet
      ? source.buttons.filter((b) => idSet.has(b.id))
      : source.buttons;
    if (templates.length === 0) {
      throw new Error('No matching buttons to import');
    }

    const imported = templates.map((template) => {
      const normalized = normalizeMapperButton(targetScreenId, template);
      const button = {
        id: uuidv4(),
        screenId: targetScreenId,
        label: normalized.label,
        target: includeTargets ? normalized.target : '',
        left: normalized.left,
        top: normalized.top,
        width: normalized.width,
        height: normalized.height,
        ...(normalized.popover ? { popover: normalized.popover } : {}),
        ...(normalized.type ? { type: normalized.type } : {}),
      };
      target.buttons.push(button);
      return button;
    });

    writeAll(screens, sections);
    return imported;
  });
}

export function getAllSections() {
  return readAll().sections;
}

export function getSection(id) {
  return readAll().sections.find((s) => s.id === id) || null;
}

export function createSection({ id, name, rootScreenId = null }) {
  const { sections, screens } = readAll();
  if (sections.find((s) => s.id === id)) {
    throw new Error(`Section "${id}" already exists`);
  }
  const section = { id, name: name || id, rootScreenId };
  sections.push(section);
  writeAll(screens, sections);
  return section;
}

export function updateSection(id, updates) {
  const { sections, screens } = readAll();
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Section "${id}" not found`);

  if (updates.id && updates.id !== id) {
    const newId = updates.id;
    if (sections.find((s) => s.id === newId)) {
      throw new Error(`Section "${newId}" already exists`);
    }
    screens.forEach((screen) => {
      if (screen.sectionId === id) screen.sectionId = newId;
    });
    sections[idx].id = newId;
    id = newId;
  }

  if (updates.name !== undefined) sections[idx].name = updates.name;
  if (updates.rootScreenId !== undefined) {
    sections[idx].rootScreenId = updates.rootScreenId || null;
  }
  if (updates.bandX !== undefined) {
    sections[idx].bandX =
      updates.bandX === null ? null : Math.round(Number(updates.bandX));
  }
  if (updates.bandY !== undefined) {
    sections[idx].bandY =
      updates.bandY === null ? null : Math.round(Number(updates.bandY));
  }

  writeAll(screens, sections);
  return sections[idx];
}

export function deleteSection(id) {
  const { sections, screens } = readAll();
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Section "${id}" not found`);

  sections.splice(idx, 1);
  screens.forEach((screen) => {
    if (screen.sectionId === id) screen.sectionId = null;
  });

  writeAll(screens, sections);
}

export function getScreensInSection(sectionId) {
  return readAll().screens.filter((s) => s.sectionId === sectionId);
}

export function getImageConfig() {
  return readMetaFile().config.imageSize;
}

export function updateImageConfig(updates) {
  const metaFile = readMetaFile();
  metaFile.config.imageSize = normalizeImageConfig({
    ...metaFile.config.imageSize,
    ...updates,
  });
  const { sections, screens } = readAll();
  const { emulatorMap, meta } = screensToEmulatorAndMeta(screens, sections, metaFile);
  writeEmulatorAndMeta(emulatorMap, meta);
  return metaFile.config.imageSize;
}
