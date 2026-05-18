import fs from 'fs';
import path from 'path';
import { execute } from './serial.js';
import { getScreenshotsDir } from './screens.js';

/**
 * Capture a screenshot from the TV via serial command.
 * The image is saved to the USB drive on the TV.
 *
 * @param {string} screenId - Screen identifier used as filename
 * @returns {Promise<string>} the filename of the captured image
 */
export async function captureFromTV(screenId) {
  const filename = `${screenId}.jpg`;
  const tvPath = `/tmp/usb/sda/sda1/${filename}`;

  const command = `luna-send -n 1 luna://com.webos.service.capture/executeOneShot '{"path":"${tvPath}", "method":"DISPLAY", "width":3840, "height":2160, "format":"JPEG"}'`;

  const output = await execute(command, 8000);
  console.log('[Capture] TV response:', output);

  return filename;
}

/**
 * Import a screenshot from a local file (uploaded via multer).
 *
 * @param {string} screenId
 * @param {string} sourcePath - path to the uploaded temp file
 * @returns {string} the filename
 */
export function importScreenshot(screenId, sourcePath) {
  const filename = `${screenId}.jpg`;
  const destPath = path.join(getScreenshotsDir(), filename);

  fs.copyFileSync(sourcePath, destPath);

  // Clean up the temp file
  if (fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }

  return filename;
}
