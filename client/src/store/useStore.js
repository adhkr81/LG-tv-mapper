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

const SECTION_STORAGE_KEY = 'lg-mapper-active-section';
const BUTTON_RECT_CLIPBOARD_KEY = 'lg-mapper-button-rect-clipboard';

function loadActiveSectionId() {
  try {
    const stored = localStorage.getItem(SECTION_STORAGE_KEY);
    if (!stored || stored === LEGACY_ALL_SCREENS_COLLAPSED_ID) return null;
    return stored;
  } catch {
    return null;
  }
}

async function migrateLegacyCollapsedView(sections) {
  try {
    if (localStorage.getItem(SECTION_STORAGE_KEY) !== LEGACY_ALL_SCREENS_COLLAPSED_ID) {
      return sections;
    }
    localStorage.removeItem(SECTION_STORAGE_KEY);
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

/** Debounced persistence per button — UI updates immediately, disk writes are batched. */
const BUTTON_SAVE_DEBOUNCE_MS = 400;
const buttonPendingPatches = new Map();
const buttonSaveEntries = new Map();

function applyButtonPatch(set, get, screenId, buttonId, updates) {
  set({
    screens: get().screens.map((s) =>
      s.id !== screenId
        ? s
        : {
            ...s,
            buttons: s.buttons.map((b) =>
              b.id === buttonId ? { ...b, ...updates } : b
            ),
          }
    ),
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
      screens: get().screens.map((s) =>
        s.id !== screenId
          ? s
          : {
              ...s,
              buttons: s.buttons.map((b) =>
                b.id === buttonId ? { ...b, ...updated } : b
              ),
            }
      ),
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

const useStore = create((set, get) => ({
  // Data
  screens: [],
  sections: [],
  imageConfig: { ...DEFAULT_IMAGE_CONFIG },
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
  canUndo: historyCanUndo(),

  // ---- Actions ----

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
    for (const id of ids) {
      imageVersions[id] = (imageVersions[id] ?? 0) + 1;
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
      set({ imageConfig: normalizeImageConfig(data.imageSize) });
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  },

  updateImageConfig: async (imageSize) => {
    const data = await api.updateConfig(imageSize);
    set({ imageConfig: normalizeImageConfig(data.imageSize) });
    return data.imageSize;
  },

  reportScreenSourceSize: async (screenId, sourceWidth, sourceHeight) => {
    const screen = get().screens.find((s) => s.id === screenId);
    if (
      screen?.sourceWidth === sourceWidth &&
      screen?.sourceHeight === sourceHeight
    ) {
      return;
    }
    await api.updateScreen(screenId, { sourceWidth, sourceHeight });
    set({
      screens: get().screens.map((s) =>
        s.id === screenId ? { ...s, sourceWidth, sourceHeight } : s
      ),
    });
    await get().fetchScreens();
  },

  setActiveSection: (sectionId) => {
    const id =
      sectionId && sectionId !== LEGACY_ALL_SCREENS_COLLAPSED_ID
        ? sectionId
        : null;
    try {
      if (id) localStorage.setItem(SECTION_STORAGE_KEY, id);
      else localStorage.removeItem(SECTION_STORAGE_KEY);
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
    for (const screenId of ids) {
      await api.updateScreen(screenId, { sectionId: id });
    }
    await get().fetchScreens();
    get().setActiveSection(id);
    return section;
  },

  deleteSection: async (id) => {
    await api.deleteSection(id);
    if (get().activeSectionId === id) {
      get().setActiveSection(null);
    }
    set({ sections: get().sections.filter((s) => s.id !== id) });
    await get().fetchScreens();
  },

  updateSection: async (id, updates) => {
    const section = await api.updateSection(id, updates);
    set({
      sections: get().sections.map((s) => (s.id === id ? section : s)),
    });
    if (updates.id && get().activeSectionId === id) {
      get().setActiveSection(updates.id);
    }
    return section;
  },

  assignScreenToSection: async (screenId, sectionId) => {
    await api.updateScreen(screenId, { sectionId: sectionId || null });
    await get().fetchScreens();
  },

  captureScreen: async (screenId) => {
    const sectionId = effectiveSectionId(get().activeSectionId);
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
        (progress) => set({ captureProgress: progress })
      );
      if (result?.serialStatus) {
        set({ serialStatus: result.serialStatus });
      }
      set({
        captureProgress: { phase: 'complete', percent: 100, label: 'Done' },
      });
      await get().fetchScreens();
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

  clearScreenImage: async (screenId) => {
    try {
      await api.updateScreen(screenId, { image: null });
      await get().fetchScreens();
      get().bumpImageVersions(screenId);
    } catch (err) {
      console.error('Clear screen image failed:', err);
      throw err;
    }
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
    await get().fetchScreens();
    get().selectScreen(id);
    return screen;
  },

  importScreens: async (entries) => {
    if (!entries?.length) return;
    const sectionId = effectiveSectionId(get().activeSectionId);
    set({ isCapturing: true });
    try {
      for (const { screenId, file } of entries) {
        await api.importScreen(screenId, file, sectionId);
      }
      await get().fetchScreens();
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
      const button = await api.addButton(screenId, buttonData);
      await get().fetchScreens();
      return button;
    } catch (err) {
      console.error('Add button failed:', err);
      throw err;
    }
  },

  importButtonsFromScreen: async (targetScreenId, sourceScreenId, options = {}) => {
    markUndoAvailable(set, get);
    try {
      await api.importButtons(targetScreenId, sourceScreenId, options);
      await get().fetchScreens();
    } catch (err) {
      console.error('Import buttons failed:', err);
      throw err;
    }
  },

  updateButton: async (screenId, buttonId, updates) => {
    const chainKey = `${screenId}:${buttonId}`;
    markUndoAvailableKeyed(set, get, `btn:${screenId}:${buttonId}`);

    applyButtonPatch(set, get, screenId, buttonId, updates);

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
      screens: get().screens.map((s) =>
        s.id !== screenId
          ? s
          : { ...s, buttons: s.buttons.filter((b) => b.id !== buttonId) }
      ),
      selectedButtonId:
        get().selectedButtonId === buttonId ? null : get().selectedButtonId,
    });
    try {
      await api.deleteButtonApi(screenId, buttonId);
      await get().fetchScreens();
    } catch (err) {
      console.error('Delete button failed:', err);
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
      await api.updateScreen(oldId, { id: newId });
      await get().fetchScreens();
      // Update selection if we renamed the selected screen
      if (get().selectedScreenId === oldId) {
        set({
          selectedScreenId: newId,
          selectedScreenIds: get().selectedScreenIds.map((id) =>
            id === oldId ? newId : id
          ),
        });
      }
    } catch (err) {
      console.error('Rename screen failed:', err);
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
      const remaining = get().selectedScreenIds.filter((id) => !removed.has(id));
      set({
        selectedScreenIds: remaining,
        selectedScreenId: remaining.length ? remaining[remaining.length - 1] : null,
        selectedButtonId: remaining.length ? get().selectedButtonId : null,
      });
      await get().fetchScreens();
    } catch (err) {
      console.error('Delete screens failed:', err);
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

  // Serial
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
}));

export default useStore;
