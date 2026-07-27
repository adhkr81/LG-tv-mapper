/**
 * Re-normalize Samsung project images with full-frame scale (no crop)
 * and remap buttons from the previous crop-based coords back through 1920→658.
 *
 * Usage: node scripts/normalize-samsung-preset2.js [projectId]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  SAMSUNG_PRESET2,
  mapSamsungButtonToPreset2,
  invertLegacyCropToSource,
} from '../src/services/samsung-preset2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = process.argv[2] || 'b74c4eacea8d';
const projectDir = path.join(__dirname, '..', 'src', 'data', 'projects', projectId);
const shotsDir = path.join(projectDir, 'screenshots');
const origDir = path.join(shotsDir, 'original-1920');
const emuPath = path.join(projectDir, 'emulator.json');
const metaPath = path.join(projectDir, 'mapper-meta.json');

const OUT_W = SAMSUNG_PRESET2.width;
const OUT_H = SAMSUNG_PRESET2.height;

const emu = JSON.parse(fs.readFileSync(emuPath, 'utf8'));
fs.mkdirSync(origDir, { recursive: true });

async function rewriteImage(stem) {
  const origCandidates = ['.png', '.jpg', '.jpeg', '.webp'].map((ext) =>
    path.join(origDir, stem + ext)
  );
  const liveCandidates = ['.png', '.jpg', '.jpeg', '.webp'].map((ext) =>
    path.join(shotsDir, stem + ext)
  );
  let srcPath = origCandidates.find((p) => fs.existsSync(p));
  if (!srcPath) {
    srcPath = liveCandidates.find((p) => fs.existsSync(p));
    if (srcPath) {
      const backupPath = path.join(origDir, path.basename(srcPath));
      if (!fs.existsSync(backupPath)) fs.copyFileSync(srcPath, backupPath);
      srcPath = backupPath;
    }
  }
  if (!srcPath) {
    console.warn(`[skip] no image for ${stem}`);
    return;
  }

  const outPath = path.join(shotsDir, `${stem}.jpg`);
  const tmp = `${outPath}.${process.pid}.tmp`;
  await sharp(srcPath)
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .jpeg({ quality: 90 })
    .toFile(tmp);

  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const p = path.join(shotsDir, stem + ext);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.renameSync(tmp, outPath);
  console.log(`[image] ${stem} → ${OUT_W}x${OUT_H} (full-frame)`);
}

for (const stem of Object.keys(emu)) {
  await rewriteImage(stem);
}

for (const entry of Object.values(emu)) {
  entry.preset = 'preset2';
  entry.model = entry.model || 'smart-tv';
  entry.buttons = (entry.buttons || []).map((btn) => {
    const sourceBtn = invertLegacyCropToSource(btn);
    return mapSamsungButtonToPreset2(sourceBtn, {
      width: SAMSUNG_PRESET2.sourceWidth,
      height: SAMSUNG_PRESET2.sourceHeight,
    });
  });
  entry.back_button = entry.back_button || { target: '' };
}

fs.writeFileSync(emuPath, JSON.stringify(emu, null, 2) + '\n');
console.log(
  '[emu] homescreen_apps →',
  JSON.stringify(emu.homescreen?.buttons?.find((b) => b.target === 'homescreen_apps'))
);

if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.config = meta.config || {};
  meta.config.imageSize = {
    intrinsicWidth: OUT_W,
    intrinsicHeight: OUT_H,
  };
  for (const screenMeta of Object.values(meta.screens || {})) {
    screenMeta.sourceWidth = OUT_W;
    screenMeta.sourceHeight = OUT_H;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`[meta] ${OUT_W}x${OUT_H}`);
}

console.log('Done.');
