import { create } from 'zustand';
import * as api from '../api/client.js';
import { DEFAULT_IMAGE_CONFIG, normalizeImageConfig } from '../utils/coords.js';
import {
  buildGraphPositionUpdates,
  buildSectionBandUpdates,
} from '../utils/graphFlow.js';

const SECTION_STORAGE_KEY = 'lg-mapper-active-section';
const BUTTON_RECT_CLIPBOARD_KEY = 'lg-mapper-button-rect-clipboard';

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
  activeSectionId: (() => {
    try {
      return localStorage.getItem(SECTION_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  })(),
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

  // ---- Actions ----

  bumpImageVersions: (screenIds) => {
    const ids = (Array.isArray(screenIds) ? screenIds : [screenIds]).filter(Boolean);
    if (!ids.length) return;
    const imageVersions = { ...get().imageVersions };
    for (const id of ids) {
      imageVersions[id] = (imageVersions[id] ?? 0) + 1;
    }
    set({ imageVersions });
  },

  fetchScreens: async () => {
    try {
      const [screens, sections] = await Promise.all([
        api.getScreens(),
        api.getSections(),
      ]);
      set({ screens, sections });
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
    try {
      if (sectionId) localStorage.setItem(SECTION_STORAGE_KEY, sectionId);
      else localStorage.removeItem(SECTION_STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ activeSectionId: sectionId });
  },

  createSection: async (data) => {
    const section = await api.createSection(data);
    set({ sections: [...get().sections, section] });
    return section;
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
    const sectionId = get().activeSectionId;
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

  importScreens: async (entries) => {
    if (!entries?.length) return;
    const sectionId = get().activeSectionId;
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
    try {
      await api.addButton(screenId, buttonData);
      await get().fetchScreens();
    } catch (err) {
      console.error('Add button failed:', err);
      throw err;
    }
  },

  importButtonsFromScreen: async (targetScreenId, sourceScreenId, options = {}) => {
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

    applyButtonPatch(set, get, screenId, buttonId, updates);

    if (updates && Object.keys(updates).length > 0) {
      const prev = buttonPendingPatches.get(chainKey) || {};
      buttonPendingPatches.set(chainKey, { ...prev, ...updates });
    }

    return scheduleButtonSave(get, set, screenId, buttonId);
  },

  deleteButton: async (screenId, buttonId) => {
    try {
      await api.deleteButtonApi(screenId, buttonId);
      if (get().selectedButtonId === buttonId) {
        set({ selectedButtonId: null });
      }
      await get().fetchScreens();
    } catch (err) {
      console.error('Delete button failed:', err);
      throw err;
    }
  },

  updateScreenGraphPosition: async (screenId, graphX, graphY) => {
    return get().updateScreenGraphPositions([{ screenId, graphX, graphY }]);
  },

  updateScreenGraphPositions: async (updates) => {
    if (!updates?.length) return;
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

    const screenUpdates = buildGraphPositionUpdates(nodes);
    if (screenUpdates.length) {
      await get().updateScreenGraphPositions(screenUpdates);
    }

    if (get().activeSectionId != null) return;

    const bandUpdates = buildSectionBandUpdates(nodes);
    if (!bandUpdates.length) return;

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

  deleteScreen: async (screenId) => {
    return get().deleteScreens([screenId]);
  },

  deleteScreens: async (screenIds) => {
    const ids = [...new Set(screenIds)].filter(Boolean);
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await api.deleteScreen(id);
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
    set({ selectedButtonId: buttonId ?? null });
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
