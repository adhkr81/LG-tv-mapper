import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_IMAGE_CONFIG } from './coords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_PROJECT_NAME = 'Default Project';

/** @typedef {'lg' | 'samsung'} ProjectPlatform */
export const PROJECT_PLATFORMS = /** @type {const} */ (['lg', 'samsung']);

export function normalizePlatform(value) {
  const v = String(value || '').toLowerCase().trim();
  return PROJECT_PLATFORMS.includes(v) ? v : 'lg';
}

export function getProjectsDir() {
  return PROJECTS_DIR;
}

export function getProjectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

export function getProjectPaths(projectId) {
  const dir = getProjectDir(projectId);
  return {
    dir,
    projectJson: path.join(dir, 'project.json'),
    emulatorJson: path.join(dir, 'emulator.json'),
    mapperMeta: path.join(dir, 'mapper-meta.json'),
    screenshots: path.join(dir, 'screenshots'),
  };
}

function atomicWrite(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function isSafeProjectId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 64;
}

function emptyMeta() {
  return {
    version: 2,
    sections: [],
    screens: {},
    config: { imageSize: { ...DEFAULT_IMAGE_CONFIG } },
  };
}

function writeProjectJson(projectId, fields) {
  const now = new Date().toISOString();
  atomicWrite(getProjectPaths(projectId).projectJson, {
    id: projectId,
    name: fields.name || 'Untitled Project',
    platform: normalizePlatform(fields.platform),
    createdAt: fields.createdAt || now,
    updatedAt: fields.updatedAt || now,
  });
}

function ensureProjectFiles(
  projectId,
  { name, platform, createdAt, updatedAt } = {}
) {
  const paths = getProjectPaths(projectId);
  fs.mkdirSync(paths.screenshots, { recursive: true });

  if (!fs.existsSync(paths.projectJson)) {
    const now = new Date().toISOString();
    writeProjectJson(projectId, {
      name: name || 'Untitled Project',
      platform: platform || 'lg',
      createdAt: createdAt || now,
      updatedAt: updatedAt || now,
    });
  } else {
    // Heal older project.json files that predate the platform field.
    const existing = readJson(paths.projectJson, null);
    if (existing && existing.platform == null) {
      writeProjectJson(projectId, {
        name: existing.name || name || 'Untitled Project',
        platform:
          projectId === DEFAULT_PROJECT_ID ? 'lg' : existing.platform || 'lg',
        createdAt: existing.createdAt || createdAt,
        updatedAt: existing.updatedAt || updatedAt,
      });
    }
  }
  if (!fs.existsSync(paths.emulatorJson)) {
    atomicWrite(paths.emulatorJson, {});
  }
  if (!fs.existsSync(paths.mapperMeta)) {
    atomicWrite(paths.mapperMeta, emptyMeta());
  }
}

/**
 * Move legacy flat data/ layout into projects/default/ once.
 * Safe to call on every boot — no-ops when already migrated.
 */
export function migrateLegacyProjectLayout() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });

  const legacyEmu = path.join(DATA_DIR, 'emulator.json');
  const legacyMeta = path.join(DATA_DIR, 'mapper-meta.json');
  const legacyShots = path.join(DATA_DIR, 'screenshots');
  const defaultPaths = getProjectPaths(DEFAULT_PROJECT_ID);

  const alreadyMigrated =
    fs.existsSync(defaultPaths.projectJson) ||
    fs.existsSync(defaultPaths.emulatorJson);

  if (alreadyMigrated) return false;

  const hasLegacy =
    fs.existsSync(legacyEmu) ||
    fs.existsSync(legacyMeta) ||
    (fs.existsSync(legacyShots) &&
      fs.readdirSync(legacyShots).some((n) => !n.startsWith('.')));

  if (!hasLegacy) return false;

  fs.mkdirSync(defaultPaths.dir, { recursive: true });

  if (fs.existsSync(legacyEmu)) {
    fs.renameSync(legacyEmu, defaultPaths.emulatorJson);
  } else {
    atomicWrite(defaultPaths.emulatorJson, {});
  }

  if (fs.existsSync(legacyMeta)) {
    fs.renameSync(legacyMeta, defaultPaths.mapperMeta);
  } else {
    atomicWrite(defaultPaths.mapperMeta, emptyMeta());
  }

  if (fs.existsSync(legacyShots)) {
    fs.renameSync(legacyShots, defaultPaths.screenshots);
  } else {
    fs.mkdirSync(defaultPaths.screenshots, { recursive: true });
  }

  const now = new Date().toISOString();
  writeProjectJson(DEFAULT_PROJECT_ID, {
    name: DEFAULT_PROJECT_NAME,
    platform: 'lg',
    createdAt: now,
    updatedAt: now,
  });

  console.log(
    `[Projects] Migrated legacy data → projects/${DEFAULT_PROJECT_ID}/`
  );
  return true;
}

function countScreens(projectId) {
  const { emulatorJson } = getProjectPaths(projectId);
  const map = readJson(emulatorJson, {});
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 0;
  return Object.keys(map).length;
}

function readProjectMeta(projectId) {
  const { projectJson } = getProjectPaths(projectId);
  const meta = readJson(projectJson, null);
  if (!meta || meta.id !== projectId) {
    return {
      id: projectId,
      name: projectId === DEFAULT_PROJECT_ID ? DEFAULT_PROJECT_NAME : projectId,
      platform: 'lg',
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: meta.id,
    name: meta.name || projectId,
    platform: normalizePlatform(meta.platform),
    createdAt: meta.createdAt || null,
    updatedAt: meta.updatedAt || null,
  };
}

export function listProjects() {
  migrateLegacyProjectLayout();
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });

  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isSafeProjectId(entry.name)) continue;
    const paths = getProjectPaths(entry.name);
    if (!fs.existsSync(paths.projectJson) && !fs.existsSync(paths.emulatorJson)) {
      continue;
    }
    // Heal missing project.json for hand-copied folders
    ensureProjectFiles(entry.name);
    const meta = readProjectMeta(entry.name);
    projects.push({
      ...meta,
      screenCount: countScreens(entry.name),
    });
  }

  projects.sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || '';
    const bTime = b.updatedAt || b.createdAt || '';
    return bTime.localeCompare(aTime);
  });

  return projects;
}

export function getProject(projectId) {
  if (!isSafeProjectId(projectId)) return null;
  const paths = getProjectPaths(projectId);
  if (!fs.existsSync(paths.dir)) return null;
  if (!fs.existsSync(paths.projectJson) && !fs.existsSync(paths.emulatorJson)) {
    return null;
  }
  ensureProjectFiles(projectId);
  return {
    ...readProjectMeta(projectId),
    screenCount: countScreens(projectId),
  };
}

export function projectExists(projectId) {
  return getProject(projectId) != null;
}

export function createProject({ name, platform } = {}) {
  migrateLegacyProjectLayout();
  const trimmed = String(name || '').trim() || 'Untitled Project';
  const normalizedPlatform = normalizePlatform(platform);
  const id = uuidv4().replace(/-/g, '').slice(0, 12);
  const now = new Date().toISOString();
  ensureProjectFiles(id, {
    name: trimmed,
    platform: normalizedPlatform,
    createdAt: now,
    updatedAt: now,
  });
  writeProjectJson(id, {
    name: trimmed,
    platform: normalizedPlatform,
    createdAt: now,
    updatedAt: now,
  });
  return getProject(id);
}

export function renameProject(projectId, name) {
  const project = getProject(projectId);
  if (!project) return null;
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('name is required');
  const now = new Date().toISOString();
  writeProjectJson(projectId, {
    name: trimmed,
    platform: project.platform,
    createdAt: project.createdAt || now,
    updatedAt: now,
  });
  return getProject(projectId);
}

export function touchProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  writeProjectJson(projectId, {
    name: project.name,
    platform: project.platform,
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function rmRecursive(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function deleteProject(projectId) {
  if (!isSafeProjectId(projectId)) return false;
  const paths = getProjectPaths(projectId);
  if (!fs.existsSync(paths.dir)) return false;
  rmRecursive(paths.dir);
  return true;
}
