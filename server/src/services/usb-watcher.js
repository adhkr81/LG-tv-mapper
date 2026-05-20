import fs from 'fs';
import path from 'path';
import { registerScreenshotImport } from './capture.js';
import config from '../config.js';

let watcher = null;
const processedFiles = new Set();

/**
 * Watch USB_WATCH_PATH for new screenshots and auto-import them
 */
export function startUSBWatcher() {
  const watchPath = config.usbWatchPath;

  if (!watchPath) {
    console.log('[USBWatcher] USB_WATCH_PATH not configured, skipping watcher');
    return;
  }

  // Create watch directory if it doesn't exist
  if (!fs.existsSync(watchPath)) {
    fs.mkdirSync(watchPath, { recursive: true });
    console.log(`[USBWatcher] Created watch directory: ${watchPath}`);
  }

  watcher = fs.watch(watchPath, (eventType, filename) => {
    if (!filename) return;

    const filePath = path.join(watchPath, filename);

    // Skip if already processed or not an image
    if (processedFiles.has(filename)) return;
    if (!/\.(jpg|jpeg|png)$/i.test(filename)) return;

    // Skip if file doesn't exist or is still being written
    if (!fs.existsSync(filePath)) return;

    // Check file size hasn't changed in 500ms (file write complete)
    const stat1 = fs.statSync(filePath);
    setTimeout(() => {
      try {
        const stat2 = fs.statSync(filePath);
        if (stat1.size === stat2.size) {
          importFromUSB(filePath, filename);
        }
      } catch (err) {
        console.error(`[USBWatcher] Error checking file ${filename}:`, err.message);
      }
    }, 500);
  });

  console.log(`[USBWatcher] Watching ${watchPath} for new screenshots`);
}

/**
 * Stop the USB watcher
 */
export function stopUSBWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('[USBWatcher] Stopped');
  }
}

/**
 * Import a file from the USB watch folder
 */
function importFromUSB(filePath, filename) {
  try {
    processedFiles.add(filename);

    // Generate screen ID from filename (without extension)
    const screenId = path.parse(filename).name;

    registerScreenshotImport(screenId, filePath);
    console.log(`[USBWatcher] ✓ Imported screenshot for: ${screenId}`);

    // Optional: delete from watch folder
    try {
      fs.unlinkSync(filePath);
      console.log(`[USBWatcher] Deleted from watch folder: ${filename}`);
    } catch (err) {
      console.log(`[USBWatcher] Could not delete ${filename}: ${err.message}`);
    }
  } catch (err) {
    console.error(`[USBWatcher] Failed to import ${filename}:`, err.message);
    processedFiles.delete(filename);
  }
}
