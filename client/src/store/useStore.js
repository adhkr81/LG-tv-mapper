import { create } from 'zustand';
import * as api from '../api/client.js';
import { DEFAULT_IMAGE_CONFIG, normalizeImageConfig } from '../utils/coords.js';
import {
  buildGraphPositionUpdates,
  buildSectionBandUpdates,
} from '../utils/graphFlow.js';
import {
  effectiveSectionId,
  isRealSectionView,
  LEGACY_ALL_SCREENS_COLLAPSED_ID,
  sectionIdFromName,
} from '../utils/sectionGraph.js';
import {
  canUndo as historyCanUndo,
  clearUndoHistory,
  cloneMapperState,
  popUndoSnapshot,
  recordUndo,
} from '../utils/undoHistory.js';
import { normalizeButton } from '../utils/buttonRect.js';

const SECTION_STORAGE_KEY_PREFIX = 'lg-mapper-active-section';
const BUTTON_RECT_CLIPBOARD_KEY = 'lg-mapper-button-rect-clipboard';

/** Scoped per open project so section selection doesn't leak across projects. */
let storageProjectId = null;

function sectionStorageKey() {
  return storageProjectId
    ? `${SECTION_STORAGE_KEY_PREFIX}:${storageProjectId}`
    : SECTION_STORAGE_KEY_PREFIX;
}

function loadActiveSectionId() {
  try {
    const stored = localStorage.getItem(sectionStorageKey());
    if (!stored || stored === LEGACY_ALL_SCREENS_COLLAPSED_ID) return null;
    return stored;
  } catch {
    return null;
  }
}

async function migrateLegacyCollapsedView(sections) {
  try {
    if (localStorage.getItem(sectionStorageKey()) !== LEGACY_ALL_SCREENS_COLLAPSED_ID) {
      return sections;
    }
    localStorage.removeItem(sectionStorageKey());
    if (!sections.length) return sections;
    await Promise.all(
      sections.map((s) => api.updateSection(s.id, { collapsed: true }))
    );
    return sections.map((s) => ({ ...s, collapsed: true }));
  } catch (err) {
    console.error('Legacy collapsed view migration failed:', err);
    return sections;
  }
}

function loadButtonRectClipboard() {
  try {
    const raw = localStorage.getItem(BUTTON_RECT_CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const nums = ['top', 'left', 'width', 'height'].every(
      (k) => typeof parsed[k] === 'number' && Number.isFinite(parsed[k])
    );
    if (!nums) return null;
    return {
      top: parsed.top,
      left: parsed.left,
      width: parsed.width,
      height: parsed.height,
    };
  } catch {
    return null;
  }
}

function persistButtonRectClipboard(clip) {
  try {
    if (clip) {
      localStorage.setItem(BUTTON_RECT_CLIPBOARD_KEY, JSON.stringify(clip));
    } else {
      localStorage.removeItem(BUTTON_RECT_CLIPBOARD_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** Build an O(1) lookup map for the current screens array. */
function indexById(screens) {
  const map = new Map();
  for (const s of screens) map.set(s.id, s);
  return map;
}

/** Debounced persistence per button — UI updates immediately, disk writes are batched. */
const BUTTON_SAVE_DEBOUNCE_MS = 400;
const buttonPendingPatches = new Map();
const buttonSaveEntries = new Map();

function patchScreenButtons(screen, buttonId, updates, layer) {
  if (layer === 'scroll') {
    const scrollArea = screen.scrollArea || {
      img_filename: '',
      image: '',
      buttons: [],
    };
    return {
      ...screen,
      scrollArea: {
        ...scrollArea,
        buttons: (scrollArea.buttons || []).map((b) =>
          b.id === buttonId ? { ...b, ...updates } : b
        ),
      },
    };
  }
  return {
    ...screen,
    buttons: screen.buttons.map((b) =>
      b.id === buttonId ? { ...b, ...updates } : b
    ),
  };
}

function findButtonLayer(screen, buttonId) {
  if (screen.buttons?.some((b) => b.id === buttonId)) return 'base';
  if (screen.scrollArea?.buttons?.some((b) => b.id === buttonId)) return 'scroll';
  return 'base';
}

function applyButtonPatch(set, get, screenId, buttonId, updates, layer) {
  set({
    screens: get().screens.map((s) => {
      if (s.id !== screenId) return s;
      const resolvedLayer = layer || findButtonLayer(s, buttonId);
      return patchScreenButtons(s, buttonId, updates, resolvedLayer);
    }),
  });
}

async function flushButtonSave(get, set, screenId, buttonId, chainKey) {
  const entry = buttonSaveEntries.get(chainKey);
  if (!entry) return;

  entry.timer = null;
  const patch = buttonPendingPatches.get(chainKey);
  buttonPendingPatches.delete(chainKey);
  const { resolve, reject } = entry;
  buttonSaveEntries.delete(chainKey);

  if (!patch || Object.keys(patch).length === 0) {
    resolve();
    return;
  }

  try {
    const updated = await api.updateButton(screenId, buttonId, patch);
    set({
      screens: get().screens.map((s) => {
        if (s.id !== screenId) return s;
        const layer = findButtonLayer(s, buttonId);
        return patchScreenButtons(s, buttonId, updated, layer);
      }),
    });
    resolve();
  } catch (err) {
    console.error('Update button failed:', err);
    try {
      await get().fetchScreens();
    } catch {
      /* ignore */
    }
    reject(err);
  }

  if (buttonPendingPatches.has(chainKey)) {
    scheduleButtonSave(get, set, screenId, buttonId);
  }
}

function cancelButtonSave(screenId, buttonId) {
  const chainKey = `${screenId}:${buttonId}`;
  const entry = buttonSaveEntries.get(chainKey);
  if (entry?.timer) clearTimeout(entry.timer);
  buttonSaveEntries.delete(chainKey);
  buttonPendingPatches.delete(chainKey);
}

function cancelAllButtonSaves() {
  for (const chainKey of buttonSaveEntries.keys()) {
    const entry = buttonSaveEntries.get(chainKey);
    if (entry?.timer) clearTimeout(entry.timer);
  }
  buttonSaveEntries.clear();
  buttonPendingPatches.clear();
}

function markUndoAvailable(set, get) {
  const { screens, sections } = get();
  recordUndo(screens, sections);
  set({ canUndo: historyCanUndo() });
}

function markUndoAvailableKeyed(set, get, key) {
  const { screens, sections } = get();
  recordUndo(screens, sections, key);
  set({ canUndo: historyCanUndo() });
}

/** Flush debounced edits immediately (e.g. before selecting another button). */
function flushButtonSaveNow(get, set, screenId, buttonId) {
  const chainKey = `${screenId}:${buttonId}`;
  const entry = buttonSaveEntries.get(chainKey);
  if (!entry) return Promise.resolve();
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  return flushButtonSave(get, set, screenId, buttonId, chainKey);
}

function scheduleButtonSave(get, set, screenId, buttonId) {
  const chainKey = `${screenId}:${buttonId}`;

  let entry = buttonSaveEntries.get(chainKey);
  if (!entry) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    entry = { promise, resolve, reject, timer: null };
    buttonSaveEntries.set(chainKey, entry);
  }

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    void flushButtonSave(get, set, screenId, buttonId, chainKey);
  }, BUTTON_SAVE_DEBOUNCE_MS);

  return entry.promise;
}

const useStore = create((rawSet, get) => {
  /**
   * Wrap set() so any patch that touches `screens` also refreshes the
   * `screensById` index. This lets callers keep using normal patches without
   * worrying about the lookup map drifting out of sync.
   */
  const set = (patch) => {
    if (typeof patch === 'function') {
      rawSet((state) => {
        const next = patch(state);
        if (
          next &&
          typeof next === 'object' &&
          Object.prototype.hasOwnProperty.call(next, 'screens')
        ) {
          return { ...next, screensById: indexById(next.screens) };
        }
        return next;
      });
      return;
    }
    if (
      patch &&
      typeof patch === 'object' &&
      Object.prototype.hasOwnProperty.call(patch, 'screens')
    ) {
      rawSet({ ...patch, screensById: indexById(patch.screens) });
      return;
    }
    rawSet(patch);
  };

  return {
    // Data
    screens: [],
    /** O(1) screen lookup; kept in sync with `screens` by the set() wrapper. */
    screensById: new Map(),
    sections: [],
    imageConfig: { ...DEFAULT_IMAGE_CONFIG },
    /** Project overrides for Samsung scroll presets (canvas-absolute EmulatorDisplay shape). */
    samsungScrollPresets: {},
    /** Per-screen cache-bust counter when screenshot file is replaced (same filename). */
    imageVersions: {},

    // UI state
    activeSectionId: loadActiveSectionId(),
    selectedScreenId: null,
    selectedScreenIds: [],
    selectedButtonId: null,
    importCompareScreenId: null,
    importSourceButtonIds: [],
    buttonRectClipboard: loadButtonRectClipboard(),
    isCapturing: false,
    capturingScreenId: null,
    captureProgress: null,
    isAddingHotspot: false,
    serialStatus: 'disconnected',
    rmusStatus: 'disconnected',
    projectPlatform: 'lg',
    /** Samsung Screen tab: edit base chrome or scroll strip ('base' | 'scroll'). */
    editLayer: 'base',
    canUndo: historyCanUndo(),
    /**
     * Bumped each time the user asks the graph to focus on a section.
     * `{ sectionId, token }`; the token forces a fresh effect even when the
     * same section is requested twice in a row.
     */
    locateSectionRequest: null,

    // ---- Actions ----

    resetForProject: (projectId) => {
      cancelAllButtonSaves();
      clearUndoHistory();
      storageProjectId = projectId || null;
      set({
        screens: [],
        screensById: new Map(),
        sections: [],
        imageConfig: { ...DEFAULT_IMAGE_CONFIG },
        samsungScrollPresets: {},
        imageVersions: {},
        activeSectionId: loadActiveSectionId(),
        selectedScreenId: null,
        selectedScreenIds: [],
        selectedButtonId: null,
        importCompareScreenId: null,
        importSourceButtonIds: [],
        isCapturing: false,
        capturingScreenId: null,
        captureProgress: null,
        isAddingHotspot: false,
        canUndo: false,
        locateSectionRequest: null,
        projectPlatform: 'lg',
        editLayer: 'base',
        rmusStatus: 'disconnected',
      });
    },

    undo: async () => {
      const snapshot = popUndoSnapshot();
      if (!snapshot) {
        set({ canUndo: historyCanUndo() });
        return false;
      }

      cancelAllButtonSaves();
      const rollback = cloneMapperState(get().screens, get().sections);
      set({
        screens: snapshot.screens,
        sections: snapshot.sections,
        canUndo: historyCanUndo(),
      });

      try {
        const restored = await api.restoreMapperState(
          snapshot.screens,
          snapshot.sections
        );
        set({
          screens: restored.screens,
          sections: restored.sections,
          canUndo: historyCanUndo(),
        });
        return true;
      } catch (err) {
        console.error('Undo failed:', err);
        set({
          screens: rollback.screens,
          sections: rollback.sections,
          canUndo: historyCanUndo(),
        });
        try {
          await get().fetchScreens({ clearUndo: true });
        } catch {
          /* ignore */
        }
        throw err;
      }
    },

    bumpImageVersions: (screenIds) => {
      const ids = (Array.isArray(screenIds) ? screenIds : [screenIds]).filter(Boolean);
      if (!ids.length) return;
      const imageVersions = { ...get().imageVersions };
      const stamp = Date.now();
      for (const id of ids) {
        imageVersions[id] = stamp;
      }
      set({ imageVersions });
    },

    fetchScreens: async ({ clearUndo = false } = {}) => {
      try {
        const [screens, sectionsRaw] = await Promise.all([
          api.getScreens(),
          api.getSections(),
        ]);
        const sections = await migrateLegacyCollapsedView(sectionsRaw);
        if (clearUndo) clearUndoHistory();
        set({
          screens,
          sections,
          activeSectionId: loadActiveSectionId(),
          canUndo: clearUndo ? false : historyCanUndo(),
        });
      } catch (err) {
        console.error('Failed to fetch screens:', err);
      }
    },

    fetchConfig: async () => {
      try {
        const data = await api.getConfig();
        set({
          imageConfig: normalizeImageConfig(data.imageSize),
          samsungScrollPresets: data.samsungScrollPresets || {},
        });
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    },

    updateImageConfig: async (imageSize) => {
      const data = await api.updateConfig({ imageSize });
      set({
        imageConfig: normalizeImageConfig(data.imageSize),
        samsungScrollPresets:
          data.samsungScrollPresets ?? get().samsungScrollPresets,
      });
      return data.imageSize;
    },

    updateSamsungScrollPreset: async (presetKey, defOrNull) => {
      markUndoAvailable(set, get);
      const data = await api.updateConfig({
        samsungScrollPresets: { [presetKey]: defOrNull },
      });
      set({
        samsungScrollPresets: data.samsungScrollPresets || {},
      });
      return data.samsungScrollPresets;
    },

    reportScreenSourceSize: async (screenId, sourceWidth, sourceHeight) => {
      const screen = get().screensById.get(screenId);
      if (
        screen?.sourceWidth === sourceWidth &&
        screen?.sourceHeight === sourceHeight
      ) {
        return;
      }
      const updated = await api.updateScreen(screenId, {
        sourceWidth,
        sourceHeight,
      });
      set({
        screens: get().screens.map((s) =>
          s.id === screenId ? { ...s, ...updated } : s
        ),
      });
    },

    locateSection: (sectionId) => {
      if (!sectionId) return;
      // Locating only makes sense from the All screens canvas. If the user is
      // currently viewing a single section, switch back so they can actually
      // see the section's band on the graph.
      if (isRealSectionView(get().activeSectionId)) {
        get().setActiveSection(null);
      }
      set({
        locateSectionRequest: {
          sectionId,
          token: (get().locateSectionRequest?.token ?? 0) + 1,
        },
      });
    },

    clearLocateSectionRequest: () => {
      if (get().locateSectionRequest) {
        set({ locateSectionRequest: null });
      }
    },

    setActiveSection: (sectionId) => {
      const id =
        sectionId && sectionId !== LEGACY_ALL_SCREENS_COLLAPSED_ID
          ? sectionId
          : null;
      try {
        const key = sectionStorageKey();
        if (id) localStorage.setItem(key, id);
        else localStorage.removeItem(key);
      } catch {
        // ignore
      }
      set({ activeSectionId: id });
    },

    toggleSectionCollapsed: async (id, collapsed) => {
      return get().updateSection(id, { collapsed });
    },

    collapseAllSections: async () => {
      const { sections } = get();
      const targets = sections.filter((s) => !s.collapsed);
      if (!targets.length) return;
      await Promise.all(
        targets.map((s) => api.updateSection(s.id, { collapsed: true }))
      );
      set({
        sections: get().sections.map((s) => ({ ...s, collapsed: true })),
      });
    },

    expandAllSections: async () => {
      const { sections } = get();
      const targets = sections.filter((s) => s.collapsed);
      if (!targets.length) return;
      await Promise.all(
        targets.map((s) => api.updateSection(s.id, { collapsed: false }))
      );
      set({
        sections: get().sections.map((s) => ({ ...s, collapsed: false })),
      });
    },

    createSection: async (data) => {
      const section = await api.createSection(data);
      set({ sections: [...get().sections, section] });
      return section;
    },

    createSectionFromScreens: async ({ name, screenIds, rootScreenId = null }) => {
      const ids = [...new Set(screenIds)].filter(Boolean);
      if (!ids.length) throw new Error('Select at least one screen on the graph');
      const nameTrim = String(name || '').trim();
      if (!nameTrim) throw new Error('Section name is required');

      const id = sectionIdFromName(nameTrim, get().sections);
      const section = await api.createSection({
        id,
        name: nameTrim,
        rootScreenId: rootScreenId || null,
      });

      const updated = [];
      for (const screenId of ids) {
        updated.push(await api.updateScreen(screenId, { sectionId: id }));
      }

      const patchById = new Map(updated.map((s) => [s.id, s]));
      set({
        sections: [...get().sections, section],
        screens: get().screens.map((s) =>
          patchById.has(s.id) ? { ...s, ...patchById.get(s.id) } : s
        ),
      });
      get().setActiveSection(id);
      return section;
    },

    deleteSection: async (id) => {
      await api.deleteSection(id);
      if (get().activeSectionId === id) {
        get().setActiveSection(null);
      }
      set({
        sections: get().sections.filter((s) => s.id !== id),
        screens: get().screens.map((s) =>
          s.sectionId === id ? { ...s, sectionId: null } : s
        ),
      });
    },

    updateSection: async (id, updates) => {
      const section = await api.updateSection(id, updates);
      const newId = section.id;
      const idChanged = newId !== id;

      const patch = {
        sections: get().sections.map((s) => (s.id === id ? section : s)),
      };
      if (idChanged) {
        patch.screens = get().screens.map((s) =>
          s.sectionId === id ? { ...s, sectionId: newId } : s
        );
      }
      set(patch);

      if (updates.id && get().activeSectionId === id) {
        get().setActiveSection(updates.id);
      }
      return section;
    },

    assignScreenToSection: async (screenId, sectionId) => {
      const updated = await api.updateScreen(screenId, {
        sectionId: sectionId || null,
      });
      set({
        screens: get().screens.map((s) =>
          s.id === screenId ? { ...s, ...updated } : s
        ),
      });
    },

    captureScreen: async (screenId) => {
      const sectionId = effectiveSectionId(get().activeSectionId);
      const source = get().projectPlatform === 'samsung' ? 'rmus' : 'serial';
      set({
        isCapturing: true,
        capturingScreenId: screenId,
        captureProgress: { phase: 'requesting', percent: 0, label: 'Starting capture…' },
      });
      try {
        const result = await api.captureScreenWithProgress(
          screenId,
          false,
          sectionId,
          (progress) => set({ captureProgress: progress }),
          source
        );
        if (result?.serialStatus) {
          set({ serialStatus: result.serialStatus });
        }
        if (result?.rmusStatus) {
          set({ rmusStatus: result.rmusStatus });
        }
        set({
          captureProgress: { phase: 'complete', percent: 100, label: 'Done' },
        });

        // result is `{ ...screen, serialStatus/rmusStatus }` — merge into local state.
        const {
          serialStatus: _s,
          rmusStatus: _r,
          source: _src,
          type: _t,
          ...screenFields
        } = result || {};
        if (screenFields?.id) {
          const screens = get().screens;
          const exists = screens.some((s) => s.id === screenFields.id);
          set({
            screens: exists
              ? screens.map((s) =>
                  s.id === screenFields.id ? { ...s, ...screenFields } : s
                )
              : [...screens, screenFields],
          });
        } else {
          // Fallback if the server response didn't include screen data.
          await get().fetchScreens();
        }
        get().bumpImageVersions(screenId);
      } catch (err) {
        console.error('Capture failed:', err);
        await get().fetchSerialStatus();
        throw err;
      } finally {
        set({ isCapturing: false, capturingScreenId: null, captureProgress: null });
      }
    },

    importScreen: async (screenId, file) => {
      return get().importScreens([{ screenId, file }]);
    },

    replaceScreenImage: async (screenId, file) => {
      await get().importScreen(screenId, file);
    },

    replaceScrollImage: async (screenId, file) => {
      markUndoAvailable(set, get);
      set({ isCapturing: true });
      try {
        const updated = await api.importScreen(screenId, file, null, 'scroll');
        set({
          screens: get().screens.map((s) =>
            s.id === screenId ? { ...s, ...updated } : s
          ),
        });
        get().bumpImageVersions(`${screenId}:scroll`);
        return updated;
      } catch (err) {
        console.error('Replace scroll image failed:', err);
        throw err;
      } finally {
        set({ isCapturing: false });
      }
    },

    clearScreenImage: async (screenId) => {
      try {
        const updated = await api.updateScreen(screenId, { image: null });
        set({
          screens: get().screens.map((s) =>
            s.id === screenId ? { ...s, ...updated } : s
          ),
        });
        get().bumpImageVersions(screenId);
      } catch (err) {
        console.error('Clear screen image failed:', err);
        throw err;
      }
    },

    clearScrollImage: async (screenId) => {
      markUndoAvailable(set, get);
      try {
        const updated = await api.updateScreen(screenId, { scrollImage: null });
        set({
          screens: get().screens.map((s) =>
            s.id === screenId ? { ...s, ...updated } : s
          ),
          editLayer:
            get().editLayer === 'scroll' && get().selectedScreenId === screenId
              ? 'base'
              : get().editLayer,
        });
        get().bumpImageVersions(`${screenId}:scroll`);
        return updated;
      } catch (err) {
        console.error('Clear scroll image failed:', err);
        throw err;
      }
    },

    updateScreenPreset: async (screenId, preset) => {
      markUndoAvailable(set, get);
      try {
        const updated = await api.updateScreen(screenId, { preset });
        set({
          screens: get().screens.map((s) =>
            s.id === screenId ? { ...s, ...updated } : s
          ),
          editLayer:
            get().selectedScreenId === screenId &&
            get().editLayer === 'scroll' &&
            !String(preset || '').match(/^preset[4-8]$/)
              ? 'base'
              : get().editLayer,
        });
        return updated;
      } catch (err) {
        console.error('Update preset failed:', err);
        throw err;
      }
    },

    setEditLayer: (layer) => {
      set({
        editLayer: layer === 'scroll' ? 'scroll' : 'base',
        selectedButtonId: null,
        isAddingHotspot: false,
      });
    },

    createScreenNode: async ({ id, sectionId = null, graphX, graphY }) => {
      markUndoAvailable(set, get);
      const screen = await api.createScreen({
        id,
        image: '',
        sectionId: sectionId ?? effectiveSectionId(get().activeSectionId) ?? null,
        graphX,
        graphY,
      });
      set({ screens: [...get().screens, screen] });
      get().selectScreen(id);
      return screen;
    },

    duplicateScreens: async ({ screenIds, suffix = '-copy' }) => {
      const ids = [...new Set((screenIds || []).filter(Boolean))];
      if (!ids.length) throw new Error('Select at least one screen to duplicate');
      markUndoAvailable(set, get);
      const created = await api.duplicateScreens({ screenIds: ids, suffix });
      set({ screens: [...get().screens, ...created] });
      const newIds = created.map((s) => s.id);
      get().bumpImageVersions(newIds);
      for (const s of created) {
        if (s.scrollArea?.image) get().bumpImageVersions(`${s.id}:scroll`);
      }
      get().setSelectedScreenIds(newIds);
      return created;
    },

    importScreens: async (entries) => {
      if (!entries?.length) return;
      const sectionId = effectiveSectionId(get().activeSectionId);
      set({ isCapturing: true });
      try {
        const results = [];
        for (const { screenId, file } of entries) {
          results.push(await api.importScreen(screenId, file, sectionId));
        }
        const patchById = new Map(results.map((s) => [s.id, s]));
        const existingIds = new Set(get().screens.map((s) => s.id));
        const merged = get().screens.map((s) =>
          patchById.has(s.id) ? { ...s, ...patchById.get(s.id) } : s
        );
        const added = results.filter((s) => !existingIds.has(s.id));
        set({ screens: [...merged, ...added] });
        get().bumpImageVersions(entries.map((e) => e.screenId));
      } catch (err) {
        console.error('Import failed:', err);
        throw err;
      } finally {
        set({ isCapturing: false });
      }
    },

    addButton: async (screenId, buttonData) => {
      markUndoAvailable(set, get);
      try {
        const layer =
          buttonData?.layer === 'scroll' || get().editLayer === 'scroll'
            ? 'scroll'
            : 'base';
        const { layer: _ignored, ...rest } = buttonData || {};
        const button = await api.addButton(screenId, { ...rest, layer });
        set({
          screens: get().screens.map((s) => {
            if (s.id !== screenId) return s;
            if (layer === 'scroll') {
              const scrollArea = s.scrollArea || {
                img_filename: '',
                image: '',
                buttons: [],
              };
              return {
                ...s,
                scrollArea: {
                  ...scrollArea,
                  buttons: [...(scrollArea.buttons || []), button],
                },
              };
            }
            return { ...s, buttons: [...s.buttons, button] };
          }),
        });
        return button;
      } catch (err) {
        console.error('Add button failed:', err);
        throw err;
      }
    },

    importButtonsFromScreen: async (targetScreenId, sourceScreenId, options = {}) => {
      markUndoAvailable(set, get);
      try {
        const layer =
          options.layer === 'scroll' || get().editLayer === 'scroll'
            ? 'scroll'
            : 'base';
        const buttons = await api.importButtons(targetScreenId, sourceScreenId, {
          ...options,
          layer,
        });
        set({
          screens: get().screens.map((s) => {
            if (s.id !== targetScreenId) return s;
            if (layer === 'scroll') {
              const scrollArea = s.scrollArea || {
                img_filename: '',
                image: '',
                buttons: [],
              };
              return {
                ...s,
                scrollArea: {
                  ...scrollArea,
                  buttons: [...(scrollArea.buttons || []), ...buttons],
                },
              };
            }
            return { ...s, buttons: [...s.buttons, ...buttons] };
          }),
        });
      } catch (err) {
        console.error('Import buttons failed:', err);
        throw err;
      }
    },

    updateButton: async (screenId, buttonId, updates) => {
      const chainKey = `${screenId}:${buttonId}`;
      markUndoAvailableKeyed(set, get, `btn:${screenId}:${buttonId}`);

      const screen = get().screensById.get(screenId);
      const layer = findButtonLayer(screen || {}, buttonId);
      applyButtonPatch(set, get, screenId, buttonId, updates, layer);

      if (updates && Object.keys(updates).length > 0) {
        const prev = buttonPendingPatches.get(chainKey) || {};
        buttonPendingPatches.set(chainKey, { ...prev, ...updates });
      }

      return scheduleButtonSave(get, set, screenId, buttonId);
    },

    deleteButton: async (screenId, buttonId) => {
      markUndoAvailable(set, get);
      cancelButtonSave(screenId, buttonId);
      set({
        screens: get().screens.map((s) => {
          if (s.id !== screenId) return s;
          if (s.scrollArea?.buttons?.some((b) => b.id === buttonId)) {
            return {
              ...s,
              scrollArea: {
                ...s.scrollArea,
                buttons: s.scrollArea.buttons.filter((b) => b.id !== buttonId),
              },
            };
          }
          return {
            ...s,
            buttons: s.buttons.filter((b) => b.id !== buttonId),
          };
        }),
        selectedButtonId:
          get().selectedButtonId === buttonId ? null : get().selectedButtonId,
      });
      try {
        await api.deleteButtonApi(screenId, buttonId);
      } catch (err) {
        console.error('Delete button failed:', err);
        await get().fetchScreens();
        throw err;
      }
    },

    deleteButtonsBySize: async (screenId, width, height) => {
      const w = Math.round(Number(width));
      const h = Math.round(Number(height));
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
        throw new Error('width and height must be positive numbers');
      }

      markUndoAvailable(set, get);
      cancelAllButtonSaves();

      const sizeMatches = (btn) => {
        const n = normalizeButton(btn);
        return n.width === w && n.height === h;
      };

      const selectedId = get().selectedButtonId;
      let selectedRemoved = false;

      set({
        screens: get().screens.map((s) => {
          const nextButtons = (s.buttons || []).filter((b) => {
            const keep = !sizeMatches(b);
            if (!keep && b.id === selectedId) selectedRemoved = true;
            return keep;
          });
          const scrollButtons = s.scrollArea?.buttons;
          if (!scrollButtons?.length) {
            return { ...s, buttons: nextButtons };
          }
          const nextScroll = scrollButtons.filter((b) => {
            const keep = !sizeMatches(b);
            if (!keep && b.id === selectedId) selectedRemoved = true;
            return keep;
          });
          return {
            ...s,
            buttons: nextButtons,
            scrollArea: { ...s.scrollArea, buttons: nextScroll },
          };
        }),
        selectedButtonId: selectedRemoved ? null : selectedId,
      });

      try {
        return await api.deleteButtonsBySizeApi(screenId, w, h);
      } catch (err) {
        console.error('Delete buttons by size failed:', err);
        await get().fetchScreens();
        throw err;
      }
    },

    updateScreenGraphPosition: async (screenId, graphX, graphY) => {
      return get().updateScreenGraphPositions([{ screenId, graphX, graphY }]);
    },

    updateScreenGraphPositions: async (updates) => {
      if (!updates?.length) return;
      markUndoAvailableKeyed(set, get, 'graph:positions');
      const rounded = updates.map(({ screenId, graphX, graphY }) => ({
        screenId,
        graphX: Math.round(graphX),
        graphY: Math.round(graphY),
      }));
      const byId = new Map(rounded.map((u) => [u.screenId, u]));
      set({
        screens: get().screens.map((s) => {
          const patch = byId.get(s.id);
          return patch ? { ...s, graphX: patch.graphX, graphY: patch.graphY } : s;
        }),
      });
      try {
        await Promise.all(
          rounded.map(({ screenId, graphX, graphY }) =>
            api.updateScreen(screenId, { graphX, graphY })
          )
        );
      } catch (err) {
        console.error('Update graph positions failed:', err);
        await get().fetchScreens();
        throw err;
      }
    },

    /** Save screen coords and (in All screens) each section's canvas band position. */
    persistGraphLayoutFromNodes: async (nodes) => {
      if (!nodes?.length) return;

      const screenNodes = nodes.filter((n) => n.type === 'screenNode');
      const screenUpdates = buildGraphPositionUpdates(screenNodes);
      if (screenUpdates.length) {
        await get().updateScreenGraphPositions(screenUpdates);
      }

      if (isRealSectionView(get().activeSectionId)) return;

      const bandUpdates = buildSectionBandUpdates(nodes);
      if (!bandUpdates.length) return;

      markUndoAvailableKeyed(set, get, 'graph:sections');

      set({
        sections: get().sections.map((sec) => {
          const patch = bandUpdates.find((b) => b.sectionId === sec.id);
          return patch
            ? { ...sec, bandX: patch.bandX, bandY: patch.bandY }
            : sec;
        }),
      });

      try {
        await Promise.all(
          bandUpdates.map(({ sectionId, bandX, bandY }) =>
            api.updateSection(sectionId, { bandX, bandY })
          )
        );
      } catch (err) {
        console.error('Update section band positions failed:', err);
        await get().fetchScreens();
        throw err;
      }
    },

    updateScreenName: async (oldId, newId) => {
      markUndoAvailable(set, get);
      try {
        const updated = await api.updateScreen(oldId, { id: newId });
        // Server renamed the screen and rewrote all button.target references.
        // Mirror that locally so we don't need to refetch.
        set({
          screens: get().screens.map((s) => {
            let next = s;
            if (s.id === oldId) {
              next = { ...next, ...updated };
            }
            if (next.buttons.some((b) => b.target === oldId)) {
              next = {
                ...next,
                buttons: next.buttons.map((b) =>
                  b.target === oldId ? { ...b, target: newId } : b
                ),
              };
            }
            if (next.backButtonTarget === oldId) {
              next = { ...next, backButtonTarget: newId };
            }
            if (next.scrollArea?.buttons?.some((b) => b.target === oldId)) {
              next = {
                ...next,
                scrollArea: {
                  ...next.scrollArea,
                  buttons: next.scrollArea.buttons.map((b) =>
                    b.target === oldId ? { ...b, target: newId } : b
                  ),
                },
              };
            }
            return next;
          }),
          sections: get().sections.map((sec) =>
            sec.rootScreenId === oldId ? { ...sec, rootScreenId: newId } : sec
          ),
          selectedScreenId:
            get().selectedScreenId === oldId ? newId : get().selectedScreenId,
          selectedScreenIds: get().selectedScreenIds.map((id) =>
            id === oldId ? newId : id
          ),
        });
        if (updated.image) get().bumpImageVersions(newId);
        if (updated.scrollArea?.image) {
          get().bumpImageVersions(`${newId}:scroll`);
        }
        return updated;
      } catch (err) {
        console.error('Rename screen failed:', err);
        throw err;
      }
    },

    updateScreenBackButton: async (screenId, backButtonTarget) => {
      markUndoAvailable(set, get);
      try {
        const updated = await api.updateScreen(screenId, {
          backButtonTarget: backButtonTarget || '',
        });
        set({
          screens: get().screens.map((s) =>
            s.id === screenId ? { ...s, ...updated } : s
          ),
        });
        return updated;
      } catch (err) {
        console.error('Update back button failed:', err);
        throw err;
      }
    },

    deleteScreen: async (screenId, options) => {
      return get().deleteScreens([screenId], options);
    },

    deleteScreens: async (screenIds, { removeParentButtons = false } = {}) => {
      const ids = [...new Set(screenIds)].filter(Boolean);
      if (!ids.length) return;
      markUndoAvailable(set, get);
      try {
        for (const id of ids) {
          await api.deleteScreen(id, { removeParentButtons });
        }
        const removed = new Set(ids);
        // Mirror the server-side cascade: drop deleted screens, optionally
        // strip parent buttons that pointed at them, and clear root refs.
        set({
          screens: get()
            .screens.filter((s) => !removed.has(s.id))
            .map((s) => {
              let next = s;
              if (next.backButtonTarget && removed.has(next.backButtonTarget)) {
                next = { ...next, backButtonTarget: '' };
              }
              if (!removeParentButtons) return next;
              const baseHit = next.buttons.some(
                (b) => b.target && removed.has(b.target)
              );
              const scrollHit = next.scrollArea?.buttons?.some(
                (b) => b.target && removed.has(b.target)
              );
              if (!baseHit && !scrollHit) return next;
              next = {
                ...next,
                buttons: next.buttons.filter(
                  (b) => !b.target || !removed.has(b.target)
                ),
              };
              if (scrollHit && next.scrollArea) {
                next = {
                  ...next,
                  scrollArea: {
                    ...next.scrollArea,
                    buttons: next.scrollArea.buttons.filter(
                      (b) => !b.target || !removed.has(b.target)
                    ),
                  },
                };
              }
              return next;
            }),
          sections: get().sections.map((sec) =>
            sec.rootScreenId && removed.has(sec.rootScreenId)
              ? { ...sec, rootScreenId: null }
              : sec
          ),
        });
        const remaining = get().selectedScreenIds.filter((id) => !removed.has(id));
        set({
          selectedScreenIds: remaining,
          selectedScreenId: remaining.length
            ? remaining[remaining.length - 1]
            : null,
          selectedButtonId: remaining.length ? get().selectedButtonId : null,
        });
      } catch (err) {
        console.error('Delete screens failed:', err);
        await get().fetchScreens();
        throw err;
      }
    },

    selectScreen: (screenId, options = {}) => {
      const { additive = false } = options;
      if (!screenId) {
        set({
          selectedScreenId: null,
          selectedScreenIds: [],
          selectedButtonId: null,
          isAddingHotspot: false,
          importCompareScreenId: null,
          importSourceButtonIds: [],
        });
        return;
      }

      let selectedScreenIds;
      if (additive) {
        const current = get().selectedScreenIds;
        selectedScreenIds = current.includes(screenId)
          ? current.filter((id) => id !== screenId)
          : [...current, screenId];
      } else {
        selectedScreenIds = [screenId];
      }

      set({
        selectedScreenId: screenId,
        selectedScreenIds,
        selectedButtonId: null,
        isAddingHotspot: false,
        importCompareScreenId: null,
        importSourceButtonIds: [],
        editLayer: 'base',
      });
    },

    setSelectedScreenIds: (screenIds) => {
      const ids = Array.isArray(screenIds) ? screenIds.filter(Boolean) : [];
      const prev = get().selectedScreenIds;
      if (
        prev.length === ids.length &&
        prev.every((id, i) => id === ids[i])
      ) {
        return;
      }
      set({
        selectedScreenIds: ids,
        selectedScreenId: ids.length ? ids[ids.length - 1] : null,
        selectedButtonId: null,
        isAddingHotspot: false,
        importCompareScreenId: null,
        importSourceButtonIds: [],
        editLayer: 'base',
      });
    },

    setImportCompareScreenId: (screenId) => {
      set({ importCompareScreenId: screenId || null, importSourceButtonIds: [] });
    },

    setImportSourceButtonIds: (buttonIds) => {
      set({
        importSourceButtonIds: Array.isArray(buttonIds) ? buttonIds : [],
      });
    },

    toggleImportSourceButtonId: (buttonId) => {
      if (!buttonId) return;
      const ids = get().importSourceButtonIds;
      set({
        importSourceButtonIds: ids.includes(buttonId)
          ? ids.filter((id) => id !== buttonId)
          : [...ids, buttonId],
      });
    },

    selectImportSourceButton: (buttonId, { additive = false } = {}) => {
      if (!buttonId) {
        set({ importSourceButtonIds: [] });
        return;
      }
      if (additive) {
        get().toggleImportSourceButtonId(buttonId);
        return;
      }
      set({ importSourceButtonIds: [buttonId] });
    },

    selectButton: (buttonId) => {
      const prevId = get().selectedButtonId;
      const nextId = buttonId ?? null;
      const screenId = get().selectedScreenId;
      if (prevId && prevId !== nextId && screenId) {
        void flushButtonSaveNow(get, set, screenId, prevId);
      }
      set({ selectedButtonId: nextId });
    },

    setAddingHotspot: (val) => {
      set({ isAddingHotspot: val });
    },

    copyButtonRect: ({ top, left, width, height }) => {
      const clip = {
        top: Math.round(top),
        left: Math.round(left),
        width: Math.round(width),
        height: Math.round(height),
      };
      persistButtonRectClipboard(clip);
      set({ buttonRectClipboard: clip });
    },

    clearButtonRectClipboard: () => {
      persistButtonRectClipboard(null);
      set({ buttonRectClipboard: null });
    },

    // Serial (LG)
    fetchSerialStatus: async () => {
      try {
        const data = await api.getSerialStatus();
        set({ serialStatus: data.status });
      } catch {
        set({ serialStatus: 'disconnected' });
      }
    },

    connectSerial: async () => {
      set({ serialStatus: 'connecting' });
      try {
        const data = await api.connectSerial();
        set({ serialStatus: data.status });
      } catch (err) {
        set({ serialStatus: 'disconnected' });
        console.error('Serial connect failed:', err);
        throw err;
      }
    },

    disconnectSerial: async () => {
      try {
        await api.disconnectSerial();
        set({ serialStatus: 'disconnected' });
      } catch (err) {
        console.error('Serial disconnect failed:', err);
      }
    },

    // Samsung RMUS
    setProjectPlatform: (platform) => {
      set({ projectPlatform: platform === 'samsung' ? 'samsung' : 'lg' });
    },

    fetchRmusStatus: async () => {
      try {
        const data = await api.getRmusStatus();
        set({ rmusStatus: data.status });
      } catch {
        set({ rmusStatus: 'disconnected' });
      }
    },

    connectRmus: async ({ fresh = false } = {}) => {
      set({ rmusStatus: 'connecting' });
      const poll = setInterval(() => {
        api.getRmusStatus()
          .then((data) => set({ rmusStatus: data.status }))
          .catch(() => {});
      }, 1500);
      try {
        const data = await api.connectRmus({ fresh });
        set({ rmusStatus: data.status });
        return data;
      } catch (err) {
        // connect() may leave browser open in awaiting-pin — sync status
        try {
          const data = await api.getRmusStatus();
          set({ rmusStatus: data.status });
        } catch {
          set({ rmusStatus: 'error' });
        }
        console.error('RMUS connect failed:', err);
        throw err;
      } finally {
        clearInterval(poll);
      }
    },

    confirmRmusPin: async () => {
      set({ rmusStatus: 'awaiting-pin' });
      const poll = setInterval(() => {
        api.getRmusStatus()
          .then((data) => set({ rmusStatus: data.status }))
          .catch(() => {});
      }, 1500);
      try {
        const data = await api.confirmRmusPin();
        set({ rmusStatus: data.status });
        return data;
      } catch (err) {
        console.error('RMUS confirm PIN failed:', err);
        throw err;
      } finally {
        clearInterval(poll);
      }
    },

    disconnectRmus: async () => {
      try {
        await api.disconnectRmus();
        set({ rmusStatus: 'disconnected' });
      } catch (err) {
        console.error('RMUS disconnect failed:', err);
      }
    },
  };
});

export default useStore;
