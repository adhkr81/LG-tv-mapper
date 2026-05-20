import { create } from 'zustand';
import * as api from '../api/client.js';
import { DEFAULT_IMAGE_CONFIG, normalizeImageConfig } from '../utils/coords.js';

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

/** One in-flight save per button so rapid drags do not overlap PUTs. */
const buttonUpdateChains = new Map();

const useStore = create((set, get) => ({
  // Data
  screens: [],
  sections: [],
  imageConfig: { ...DEFAULT_IMAGE_CONFIG },

  // UI state
  activeSectionId: (() => {
    try {
      return localStorage.getItem(SECTION_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  })(),
  selectedScreenId: null,
  selectedButtonId: null,
  importCompareScreenId: null,
  importSourceButtonIds: [],
  buttonRectClipboard: loadButtonRectClipboard(),
  isCapturing: false,
  captureProgress: null,
  isAddingHotspot: false,
  serialStatus: 'disconnected',

  // ---- Actions ----

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
    } catch (err) {
      console.error('Capture failed:', err);
      await get().fetchSerialStatus();
      throw err;
    } finally {
      set({ isCapturing: false, captureProgress: null });
    }
  },

  importScreen: async (screenId, file) => {
    const sectionId = get().activeSectionId;
    set({ isCapturing: true });
    try {
      await api.importScreen(screenId, file, sectionId);
      await get().fetchScreens();
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
    const previous = buttonUpdateChains.get(chainKey) || Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        const prevScreens = get().screens;
        set({
          screens: prevScreens.map((s) =>
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
        try {
          const updated = await api.updateButton(screenId, buttonId, updates);
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
        } catch (err) {
          set({ screens: prevScreens });
          console.error('Update button failed:', err);
          throw err;
        }
      });

    buttonUpdateChains.set(chainKey, task);
    try {
      await task;
    } finally {
      if (buttonUpdateChains.get(chainKey) === task) {
        buttonUpdateChains.delete(chainKey);
      }
    }
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
    const rounded = { graphX: Math.round(graphX), graphY: Math.round(graphY) };
    set({
      screens: get().screens.map((s) =>
        s.id === screenId ? { ...s, ...rounded } : s
      ),
    });
    try {
      await api.updateScreen(screenId, rounded);
    } catch (err) {
      console.error('Update graph position failed:', err);
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
        set({ selectedScreenId: newId });
      }
    } catch (err) {
      console.error('Rename screen failed:', err);
      throw err;
    }
  },

  deleteScreen: async (screenId) => {
    try {
      await api.deleteScreen(screenId);
      if (get().selectedScreenId === screenId) {
        set({ selectedScreenId: null });
      }
      await get().fetchScreens();
    } catch (err) {
      console.error('Delete screen failed:', err);
      throw err;
    }
  },

  selectScreen: (screenId) => {
    set({
      selectedScreenId: screenId,
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
