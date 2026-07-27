import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  buttonToEmulator,
  parsePx,
  screenFromEmulator,
  screenToEmulator,
  stripImageExtension,
} from './emulator-format.js';
import { DEFAULT_IMAGE_CONFIG, normalizeImageConfig } from './coords.js';
import {
  getProjectPaths,
  migrateLegacyProjectLayout,
  projectExists,
  touchProject,
} from './projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const LEGACY_FILE = path.join(DATA_DIR, 'screens.json');

/** Active project paths — set by activateProject(). */
let activeProjectId = null;
let emulatorDataPath = null;
let mapperMetaPath = null;
let screenshotsDir = null;

const DEFAULT_BUTTON_SIZE = { width: 120, height: 60 };

/** Time (ms) the in-memory state stays "dirty" before we write it to disk. */
const FLUSH_DEBOUNCE_MS = 250;
/** Hard ceiling so a sustained drag still flushes occasionally. */
const FLUSH_MAX_DELAY_MS = 2000;

/**
 * mapper-meta schema version.
 *  - v2: ungrouped screens (sectionId == null) store absolute display coords.
 *        Older files had coords that were rendered through a phantom
 *        band offset, so on load we one-time shift them so the visual
 *        position is preserved.
 */
const META_VERSION = 2;

/** @typedef {{ id: string, name: string, rootScreenId: string | null, bandX?: number | null, bandY?: number | null, collapsed?: boolean }} Section */

/* -------------------------------------------------------------------------- */
/* In-memory state                                                            */
/* -------------------------------------------------------------------------- */

const state = {
  screens: /** @type {object[]} */ ([]),
  sections: /** @type {Section[]} */ ([]),
  imageConfig: { ...DEFAULT_IMAGE_CONFIG },
  /** Monotonic counter, bumped on every mutation; powers ETag/304 responses. */
  version: 0,
  loaded: false,
};

/** True when state has unsaved mutations. */
let dirty = false;
let flushTimer = null;
let flushDeadlineTimer = null;
let shutdownRegistered = false;

/* -------------------------------------------------------------------------- */
/* Disk I/O helpers                                                           */
/* -------------------------------------------------------------------------- */

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — rare retries when OneDrive locks the file */
  }
}

function isRetriableFsError(err) {
  return err && ['EPERM', 'EBUSY', 'EACCES'].includes(err.code);
}

function atomicWrite(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  let lastErr;
  for (let attempt = 0; attempt < 10; attempt++) {
    const tmp = `${filePath}.${process.pid}.${attempt}.tmp`;
    try {
      fs.writeFileSync(tmp, content, 'utf-8');
      fs.renameSync(tmp, filePath);
      return;
    } catch (err) {
      lastErr = err;
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (isRetriableFsError(err) && attempt < 9) {
        sleepMs(40 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function ensureActiveProject() {
  if (!activeProjectId || !emulatorDataPath || !mapperMetaPath || !screenshotsDir) {
    throw new Error('No project is active. Open a project first.');
  }
}

function ensureDataDir() {
  ensureActiveProject();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function readEmulatorMapFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(emulatorDataPath)) return null;
  const parsed = readJson(emulatorDataPath, null);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};
  return parsed;
}

function readMetaFileFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(mapperMetaPath)) {
    return {
      version: META_VERSION,
      sections: [],
      screens: {},
      config: { imageSize: { ...DEFAULT_IMAGE_CONFIG } },
    };
  }
  const parsed = readJson(mapperMetaPath, { sections: [], screens: {} });
  return {
    version: Number.isInteger(parsed.version) ? parsed.version : 1,
    sections: parsed.sections || [],
    screens: parsed.screens || {},
    config: {
      imageSize: normalizeImageConfig(parsed.config?.imageSize),
    },
  };
}

/**
 * Pre-v2 mapper-meta stored ungrouped screens (sectionId == null) at their
 * "section-relative" graph coords, which were then shifted on render by
 * `viewOffset = (-minX, -minY)` so the cluster's top-left landed near (0,0).
 * That offset was recomputed on every layout from the current min, so moving
 * any single ungrouped screen quietly drifted the others by a few pixels on
 * the next persist. v2 treats ungrouped screens as absolute display coords,
 * so we one-time bake the old offset into the stored values to preserve the
 * visual position the user is used to.
 */
function shiftUngroupedToOrigin(screens) {
  const ungrouped = screens.filter((s) => s && s.sectionId == null);
  if (ungrouped.length === 0) return false;

  const minX = Math.min(...ungrouped.map((s) => s.graphX ?? 0));
  const minY = Math.min(...ungrouped.map((s) => s.graphY ?? 0));
  if (minX === 0 && minY === 0) return false;

  for (const screen of ungrouped) {
    screen.graphX = (screen.graphX ?? 0) - minX;
    screen.graphY = (screen.graphY ?? 0) - minY;
  }
  return true;
}

/** Apply any pending meta-file migrations. Returns true if anything changed. */
function applyMetaMigrations(meta) {
  let migrated = false;
  if (meta.version < 2) {
    shiftUngroupedToOrigin(Object.values(meta.screens));
    meta.version = 2;
    migrated = true;
  }
  return migrated;
}

/* -------------------------------------------------------------------------- */
/* Image filename resolution (cached per screen)                              */
/* -------------------------------------------------------------------------- */

/** Resolve `img_filename` → an existing screenshot file (probe extensions). */
function resolveImageFilenameOnDisk(screenId, imgFilename) {
  if (imgFilename === '') return '';
  const base = imgFilename || screenId;
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const name = base.includes('.') ? base : base + ext;
    if (fs.existsSync(path.join(screenshotsDir, name))) {
      return name;
    }
  }
  return base.includes('.') ? base : `${base}.jpg`;
}

/** Set the resolved `image` filename on an in-memory screen. */
function applyResolvedImage(screen) {
  screen.image = resolveImageFilenameOnDisk(screen.id, screen.img_filename);
}

/* -------------------------------------------------------------------------- */
/* Conversion: emulator/meta JSON  <->  in-memory screen shape                */
/* -------------------------------------------------------------------------- */

function alignScreenButtonIds(screen, screenMeta) {
  const storedIds = screenMeta?.buttonIds || [];
  let dirtyAlign = false;
  const buttons = screen.buttons.map((btn, i) => {
    const stableId = storedIds[i] || btn.id;
    if (stableId && stableId === btn.id) return btn;
    dirtyAlign = true;
    return { ...btn, id: stableId || uuidv4() };
  });
  if (storedIds.length !== buttons.length) dirtyAlign = true;
  return { screen: { ...screen, buttons }, dirty: dirtyAlign };
}

function emulatorAndMetaToScreens(emulatorMap, meta) {
  let needsRepersist = false;
  const screens = Object.entries(emulatorMap).map(([screenId, entry]) => {
    const screenMeta = meta.screens[screenId];
    const imgFilename =
      typeof entry.img_filename === 'string' ? entry.img_filename : screenId;
    const image = resolveImageFilenameOnDisk(screenId, imgFilename);
    const screen = screenFromEmulator(screenId, entry, screenMeta, image);
    const { screen: aligned, dirty: alignDirty } = alignScreenButtonIds(
      screen,
      screenMeta
    );
    aligned.sourceWidth = screenMeta?.sourceWidth ?? null;
    aligned.sourceHeight = screenMeta?.sourceHeight ?? null;
    if (alignDirty) needsRepersist = true;
    return aligned;
  });
  return { screens, needsRepersist };
}

function screensToEmulatorAndMeta(screens, sections, imageConfig) {
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
      version: META_VERSION,
      sections,
      screens: metaScreens,
      config: { imageSize: imageConfig },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Legacy migration                                                           */
/* -------------------------------------------------------------------------- */

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

function migrateLegacyIntoState() {
  const existing = readEmulatorMapFromDisk();
  if (existing !== null && Object.keys(existing).length > 0) return false;

  const legacy = loadLegacy();
  if (!legacy || legacy.screens.length === 0) return false;

  state.screens = legacy.screens;
  state.sections = legacy.sections;
  // Same v2 coords normalization the meta-file migration applies, so a fresh
  // legacy import doesn't visually jump after the viewOffset removal.
  shiftUngroupedToOrigin(state.screens);
  markDirty();
  flushSync(); // write the migrated state now so the legacy file is safe to rename
  const backup = LEGACY_FILE + '.bak';
  if (!fs.existsSync(backup)) {
    fs.renameSync(LEGACY_FILE, backup);
  }
  console.log(
    `[DataStore] Migrated ${legacy.screens.length} screen(s) from screens.json → emulator.json`
  );
  return true;
}

/* -------------------------------------------------------------------------- */
/* Load + flush                                                               */
/* -------------------------------------------------------------------------- */

function loadStateFromDisk() {
  const migrated = migrateLegacyIntoState();
  if (migrated) {
    state.loaded = true;
    return;
  }

  const emulatorMap = readEmulatorMapFromDisk();
  const meta = readMetaFileFromDisk();

  const metaMigrated = applyMetaMigrations(meta);

  state.imageConfig = meta.config.imageSize;
  state.sections = meta.sections;

  if (emulatorMap === null) {
    state.screens = [];
    if (metaMigrated) markDirty();
  } else {
    const { screens, needsRepersist } = emulatorAndMetaToScreens(emulatorMap, meta);
    state.screens = screens;
    if (needsRepersist || metaMigrated) markDirty();
  }

  state.loaded = true;
}

function ensureLoaded() {
  if (!state.loaded) loadStateFromDisk();
  if (!shutdownRegistered) registerShutdownHooks();
}

function persistToDisk() {
  ensureDataDir();
  const { emulatorMap, meta } = screensToEmulatorAndMeta(
    state.screens,
    state.sections,
    state.imageConfig
  );
  atomicWrite(emulatorDataPath, emulatorMap);
  atomicWrite(mapperMetaPath, meta);
  if (activeProjectId) {
    try {
      touchProject(activeProjectId);
    } catch {
      /* ignore touch failures */
    }
  }
}

/** Schedule a debounced flush. Coalesces bursts of mutations into one write. */
function markDirty() {
  state.version += 1;
  dirty = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(runFlush, FLUSH_DEBOUNCE_MS);
  if (!flushDeadlineTimer) {
    flushDeadlineTimer = setTimeout(runFlush, FLUSH_MAX_DELAY_MS);
  }
}

function runFlush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (flushDeadlineTimer) {
    clearTimeout(flushDeadlineTimer);
    flushDeadlineTimer = null;
  }
  if (!dirty) return;
  dirty = false;
  try {
    persistToDisk();
  } catch (err) {
    console.error('[DataStore] Flush failed; will retry on next mutation:', err);
    dirty = true;
  }
}

/** Synchronous flush — used on shutdown and the rare cross-cutting op (undo). */
function flushSync() {
  runFlush();
}

function registerShutdownHooks() {
  shutdownRegistered = true;
  const onExit = () => {
    try {
      flushSync();
    } catch {
      /* ignore */
    }
  };
  process.on('beforeExit', onExit);
  process.on('exit', onExit);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      onExit();
      process.exit(0);
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Internal mutation helpers                                                  */
/* -------------------------------------------------------------------------- */

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
      positionsOverlapLayout({ x: candidate.graphX, y: candidate.graphY }, p)
    );
    if (!overlaps) return candidate;
  }

  const maxX = occupied.length ? Math.max(...occupied.map((p) => p.x)) : 0;
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

function removeButtonsTargetingScreens(screens, targetIds) {
  const idSet =
    targetIds instanceof Set
      ? targetIds
      : Array.isArray(targetIds)
        ? new Set(targetIds)
        : new Set([targetIds]);
  if (!idSet.size) return;

  for (const screen of screens) {
    if (idSet.has(screen.id)) continue;
    screen.buttons = screen.buttons.filter(
      (btn) => !btn.target || !idSet.has(btn.target)
    );
  }
}

function unlinkScreenshotFile(filename) {
  const name = String(filename || '').trim();
  if (!name) return;
  const filePath = getScreenshotPath(name);
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return;
  fs.unlinkSync(filePath);
}

function deleteScreenshotFiles(screen) {
  const names = new Set();
  if (screen.image?.trim()) names.add(screen.image.trim());
  const base = screen.img_filename || screen.id;
  if (base) {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      names.add(base.includes('.') ? base : `${base}${ext}`);
    }
  }
  for (const name of names) {
    unlinkScreenshotFile(name);
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function getActiveProjectId() {
  return activeProjectId;
}

/**
 * Switch the in-memory store to a project. Flushes the previous project first.
 * No-op if the same project is already active and loaded.
 */
export function activateProject(projectId) {
  migrateLegacyProjectLayout();
  if (!projectExists(projectId)) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (activeProjectId === projectId && state.loaded) {
    return activeProjectId;
  }

  if (state.loaded) {
    flushSync();
  }

  const paths = getProjectPaths(projectId);
  activeProjectId = projectId;
  emulatorDataPath = paths.emulatorJson;
  mapperMetaPath = paths.mapperMeta;
  screenshotsDir = paths.screenshots;

  state.screens = [];
  state.sections = [];
  state.imageConfig = { ...DEFAULT_IMAGE_CONFIG };
  state.version = 0;
  state.loaded = false;
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (flushDeadlineTimer) {
    clearTimeout(flushDeadlineTimer);
    flushDeadlineTimer = null;
  }

  ensureLoaded();
  return activeProjectId;
}

/** Drop the active project from memory (after delete). */
export function clearActiveProject() {
  if (state.loaded) {
    flushSync();
  }
  activeProjectId = null;
  emulatorDataPath = null;
  mapperMetaPath = null;
  screenshotsDir = null;
  state.screens = [];
  state.sections = [];
  state.imageConfig = { ...DEFAULT_IMAGE_CONFIG };
  state.version = 0;
  state.loaded = false;
  dirty = false;
}

export function getScreenshotsDir() {
  ensureDataDir();
  return screenshotsDir;
}

export function getScreenshotPath(filename) {
  return path.join(getScreenshotsDir(), filename);
}

/** Version counter — used by routes for cheap ETag generation. */
export function getStateVersion() {
  ensureLoaded();
  return state.version;
}

/** Force a synchronous flush. Used for cross-cutting ops (undo) and tests. */
export function flushDataStore() {
  ensureLoaded();
  flushSync();
}

export function replaceMapperState(screens, sections) {
  if (!Array.isArray(screens) || !Array.isArray(sections)) {
    throw new Error('screens and sections must be arrays');
  }
  ensureLoaded();
  // Round-trip through emulator format to normalize the incoming shape.
  const { emulatorMap, meta } = screensToEmulatorAndMeta(
    screens,
    sections,
    state.imageConfig
  );
  const { screens: normalized } = emulatorAndMetaToScreens(emulatorMap, meta);
  state.screens = normalized;
  state.sections = sections;
  markDirty();
  flushSync();
  return { screens: state.screens, sections: state.sections };
}

export function getAllScreens() {
  ensureLoaded();
  return state.screens;
}

export function getScreen(id) {
  ensureLoaded();
  return state.screens.find((s) => s.id === id) || null;
}

export function createScreen({
  id,
  image = '',
  sectionId = null,
  graphX,
  graphY,
}) {
  ensureLoaded();
  if (state.screens.find((s) => s.id === id)) {
    throw new Error(`Screen "${id}" already exists`);
  }

  const i = state.screens.length;
  let layout;
  if (graphX !== undefined && graphY !== undefined) {
    layout = { graphX, graphY };
  } else if (sectionId) {
    layout = layoutForSection(state.screens, sectionId);
  } else {
    layout = { graphX: (i % 4) * 220, graphY: Math.floor(i / 4) * 185 };
  }

  const img_filename = image?.trim() ? stripImageExtension(image) || id : '';
  const screen = {
    id,
    image: image || '',
    img_filename,
    preset: 0,
    buttons: [],
    sectionId: sectionId || null,
    sourceWidth: null,
    sourceHeight: null,
    ...layout,
  };

  applyResolvedImage(screen);
  state.screens.push(screen);
  markDirty();
  return screen;
}

export function updateScreen(id, updates) {
  ensureLoaded();
  const idx = state.screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  const screen = state.screens[idx];

  if (updates.id && updates.id !== id) {
    const newId = updates.id;
    if (state.screens.find((s) => s.id === newId)) {
      throw new Error(`Screen "${newId}" already exists`);
    }

    renameScreenIdInTargets(state.screens, id, newId);
    screen.id = newId;
    screen.img_filename = newId;
    screen.buttons = screen.buttons.map((b) => ({ ...b, screenId: newId }));

    state.sections.forEach((sec) => {
      if (sec.rootScreenId === id) sec.rootScreenId = newId;
    });

    id = newId;
    applyResolvedImage(screen);
  }

  if (updates.graphX !== undefined) screen.graphX = updates.graphX;
  if (updates.graphY !== undefined) screen.graphY = updates.graphY;
  if (updates.sectionId !== undefined) {
    screen.sectionId = updates.sectionId || null;
  }
  if (updates.preset !== undefined) screen.preset = updates.preset;
  if (updates.image !== undefined) {
    if (updates.image === null || updates.image === '') {
      deleteScreenshotFiles(screen);
      screen.image = '';
      screen.img_filename = '';
    } else {
      screen.image = updates.image;
      screen.img_filename =
        stripImageExtension(updates.image) || screen.id;
      applyResolvedImage(screen);
    }
  }
  if (updates.sourceWidth !== undefined) {
    screen.sourceWidth = updates.sourceWidth || null;
  }
  if (updates.sourceHeight !== undefined) {
    screen.sourceHeight = updates.sourceHeight || null;
  }

  markDirty();
  return screen;
}

export function deleteScreen(id, { removeParentButtons = false } = {}) {
  ensureLoaded();
  const idx = state.screens.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Screen "${id}" not found`);

  const screen = state.screens[idx];
  deleteScreenshotFiles(screen);

  state.sections.forEach((sec) => {
    if (sec.rootScreenId === id) sec.rootScreenId = null;
  });

  if (removeParentButtons) {
    removeButtonsTargetingScreens(state.screens, id);
  }
  state.screens.splice(idx, 1);
  markDirty();
}

export function getButtons(screenId) {
  ensureLoaded();
  const screen = state.screens.find((s) => s.id === screenId);
  return screen ? screen.buttons : [];
}

export function addButton(screenId, data) {
  ensureLoaded();
  const screen = state.screens.find((s) => s.id === screenId);
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
  markDirty();
  return button;
}

export function updateButton(screenId, buttonId, updates) {
  ensureLoaded();
  const patch = sanitizeButtonUpdates(updates);
  const screen = state.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Screen "${screenId}" not found`);

  const btn = screen.buttons.find((b) => b.id === buttonId);
  if (!btn) throw new Error(`Button "${buttonId}" not found`);

  if (patch.label !== undefined) btn.label = patch.label;
  if (patch.target !== undefined) btn.target = patch.target;
  if (patch.left !== undefined) btn.left = patch.left;
  if (patch.top !== undefined) btn.top = patch.top;
  if (patch.width !== undefined) btn.width = patch.width;
  if (patch.height !== undefined) btn.height = patch.height;
  if (patch.popover !== undefined) {
    if (patch.popover === null) {
      delete btn.popover;
    } else {
      btn.popover = patch.popover;
    }
  }
  if (patch.type !== undefined) {
    if (patch.type) btn.type = patch.type;
    else delete btn.type;
  }

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

  markDirty();
  return normalizeMapperButton(screenId, btn);
}

export function deleteButton(screenId, buttonId) {
  ensureLoaded();
  const screen = state.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Screen "${screenId}" not found`);

  const idx = screen.buttons.findIndex((b) => b.id === buttonId);
  if (idx === -1) throw new Error(`Button "${buttonId}" not found`);

  screen.buttons.splice(idx, 1);
  markDirty();
}

export function importButtonsFromScreen(
  targetScreenId,
  sourceScreenId,
  { includeTargets = true, buttonIds = null } = {}
) {
  ensureLoaded();
  if (targetScreenId === sourceScreenId) {
    throw new Error('Cannot import buttons from the same screen');
  }
  const target = state.screens.find((s) => s.id === targetScreenId);
  const source = state.screens.find((s) => s.id === sourceScreenId);
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

  markDirty();
  return imported;
}

export function getAllSections() {
  ensureLoaded();
  return state.sections;
}

export function getSection(id) {
  ensureLoaded();
  return state.sections.find((s) => s.id === id) || null;
}

export function createSection({ id, name, rootScreenId = null }) {
  ensureLoaded();
  if (state.sections.find((s) => s.id === id)) {
    throw new Error(`Section "${id}" already exists`);
  }
  const section = { id, name: name || id, rootScreenId };
  state.sections.push(section);
  markDirty();
  return section;
}

export function updateSection(id, updates) {
  ensureLoaded();
  const idx = state.sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Section "${id}" not found`);

  const section = state.sections[idx];

  if (updates.id && updates.id !== id) {
    const newId = updates.id;
    if (state.sections.find((s) => s.id === newId)) {
      throw new Error(`Section "${newId}" already exists`);
    }
    state.screens.forEach((screen) => {
      if (screen.sectionId === id) screen.sectionId = newId;
    });
    section.id = newId;
    id = newId;
  }

  if (updates.name !== undefined) section.name = updates.name;
  if (updates.rootScreenId !== undefined) {
    section.rootScreenId = updates.rootScreenId || null;
  }
  if (updates.bandX !== undefined) {
    section.bandX =
      updates.bandX === null ? null : Math.round(Number(updates.bandX));
  }
  if (updates.bandY !== undefined) {
    section.bandY =
      updates.bandY === null ? null : Math.round(Number(updates.bandY));
  }
  if (updates.collapsed !== undefined) {
    section.collapsed = Boolean(updates.collapsed);
  }

  markDirty();
  return section;
}

export function deleteSection(id) {
  ensureLoaded();
  const idx = state.sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Section "${id}" not found`);

  state.sections.splice(idx, 1);
  state.screens.forEach((screen) => {
    if (screen.sectionId === id) screen.sectionId = null;
  });
  markDirty();
}

export function getScreensInSection(sectionId) {
  ensureLoaded();
  return state.screens.filter((s) => s.sectionId === sectionId);
}

export function getImageConfig() {
  ensureLoaded();
  return state.imageConfig;
}

export function updateImageConfig(updates) {
  ensureLoaded();
  state.imageConfig = normalizeImageConfig({
    ...state.imageConfig,
    ...updates,
  });
  markDirty();
  return state.imageConfig;
}
