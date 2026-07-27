import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { SAMSUNG_PRESET2 } from './samsung-preset2.js';

/**
 * Scale a capture into Samsung preset2 screen space (658×370).
 * Full-frame scale (no crop) so the entire TV UI remains visible.
 */
export async function normalizeCaptureToPreset2(sourcePath, destPath) {
  const outW = SAMSUNG_PRESET2.width;
  const outH = SAMSUNG_PRESET2.height;
  const meta = await sharp(sourcePath).metadata();

  if (meta.width === outW && meta.height === outH) {
    if (path.resolve(sourcePath) === path.resolve(destPath)) {
      return path.basename(destPath);
    }
    fs.copyFileSync(sourcePath, destPath);
    return path.basename(destPath);
  }

  const tmp = `${destPath}.${process.pid}.tmp.jpg`;
  await sharp(sourcePath)
    .resize(outW, outH, { fit: 'fill' })
    .jpeg({ quality: 90 })
    .toFile(tmp);

  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  fs.renameSync(tmp, destPath);

  if (
    path.resolve(sourcePath) !== path.resolve(destPath) &&
    fs.existsSync(sourcePath)
  ) {
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      /* ignore */
    }
  }

  return path.basename(destPath);
}
