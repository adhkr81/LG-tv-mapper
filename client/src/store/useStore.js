import { create } from 'zustand';
import * as api from '../api/client.js';

const useStore = create((set, get) => ({
  // Data
  screens: [],

  // UI state
  selectedScreenId: null,
  isCapturing: false,
  isAddingHotspot: false,
  serialStatus: 'disconnected',

  // ---- Actions ----

  fetchScreens: async () => {
    try {
      const screens = await api.getScreens();
      set({ screens });
    } catch (err) {
      console.error('Failed to fetch screens:', err);
    }
  },

  captureScreen: async (screenId) => {
    set({ isCapturing: true });
    try {
      await api.captureScreen(screenId);
      await get().fetchScreens();
    } catch (err) {
      console.error('Capture failed:', err);
      throw err;
    } finally {
      set({ isCapturing: false });
    }
  },

  importScreen: async (screenId, file) => {
    set({ isCapturing: true });
    try {
      await api.importScreen(screenId, file);
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

  updateButton: async (screenId, buttonId, updates) => {
    try {
      await api.updateButton(screenId, buttonId, updates);
      await get().fetchScreens();
    } catch (err) {
      console.error('Update button failed:', err);
      throw err;
    }
  },

  deleteButton: async (screenId, buttonId) => {
    try {
      await api.deleteButtonApi(screenId, buttonId);
      await get().fetchScreens();
    } catch (err) {
      console.error('Delete button failed:', err);
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
    set({ selectedScreenId: screenId, isAddingHotspot: false });
  },

  setAddingHotspot: (val) => {
    set({ isAddingHotspot: val });
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
