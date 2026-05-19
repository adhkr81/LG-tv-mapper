import fs from 'fs';
import path from 'path';
import { execute, executeStreamUntilIdle } from './serial.js';
import { getScreenshotsDir } from './screens.js';

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

/** Smaller capture for serial transfer (4K hex/base64 over 115200 baud is impractical). */
const STREAM_CAPTURE_WIDTH = 1920;
const STREAM_CAPTURE_HEIGHT = 1080;
const CHUNK_BYTES = 4096;

/**
 * Capture a screenshot from the TV via serial command.
 * The image is saved to the USB drive on the TV.
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
 * @param {string} tvPath
 * @returns {Promise<number>}
 */
async function waitForTvFile(tvPath) {
  const cmd = `i=0; while [ ! -s "${tvPath}" ] && [ $i -lt 40 ]; do i=$((i+1)); sleep 0.2; done; wc -c < "${tvPath}" 2>/dev/null | tr -d ' '`;
  const out = await execute(cmd, 15000);
  const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
  // Use the last line that is only digits (wc output), not shell prompts with stray numbers
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^(\d+)$/);
    if (m) {
      const size = parseInt(m[1], 10);
      if (Number.isFinite(size) && size > 0 && size < 50 * 1024 * 1024) {
        return size;
      }
    }
  }
  return 0;
}

function stripShellNoise(raw, tvPath) {
  let text = raw;
  const basename = path.basename(tvPath);

  const lines = text.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (t.includes(tvPath) || t.includes(basename)) return false;
    if (/^(xxd|base64|cat|luna-send|wc|dd|printf)\b/.test(t)) return false;
    if (/^#/.test(t) || /^root@/.test(t) || /^>\s/.test(t)) return false;
    return true;
  });

  text = filtered.join('\n');
  const junkIdx = text.search(/["']\s*;\s*echo\s*$/m);
  if (junkIdx !== -1) text = text.slice(0, junkIdx);

  return text;
}

function tryDecodeBase64Candidates(input) {
  const re = /([A-Za-z0-9+/=\r\n]{100,})/g;
  const candidates = [];
  let m;
  while ((m = re.exec(input)) !== null) candidates.push(m[1]);

  if (candidates.length === 0) candidates.push(input);
  candidates.sort((a, b) => b.length - a.length);

  for (const cand of candidates) {
    try {
      const normalized = cand.replace(/\s+/g, '');
      const buf = Buffer.from(normalized, 'base64');
      const jpeg = extractJpeg(buf);
      if (jpeg) return jpeg;
    } catch {
      // try next
    }
  }

  try {
    const filtered = input.replace(/[^A-Za-z0-9+/=]/g, '');
    if (filtered.length < 100) return null;
    const buf = Buffer.from(filtered, 'base64');
    return extractJpeg(buf);
  } catch {
    return null;
  }
}

function extractJpeg(buf) {
  const soi = buf.indexOf(JPEG_SOI);
  if (soi === -1) return null;
  const eoi = buf.indexOf(JPEG_EOI, soi + 2);
  if (eoi !== -1) return buf.slice(soi, eoi + 2);
  return buf.slice(soi);
}

function decodeJpegFromStream(raw, tvPath, expectedBytes = 0) {
  if (!raw || (Buffer.isBuffer(raw) && raw.length === 0)) return null;

  const rawStr = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  const cleaned = stripShellNoise(rawStr, tvPath);

  const fromB64 = tryDecodeBase64Candidates(cleaned);
  if (fromB64 && isAcceptableJpeg(fromB64, expectedBytes)) return fromB64;

  const hexOnly = cleaned.replace(/[^0-9a-fA-F]/g, '');
  if (hexOnly.length >= 500 && hexOnly.length % 2 === 0) {
    try {
      const buf = Buffer.from(hexOnly, 'hex');
      const jpeg = extractJpeg(buf);
      if (jpeg && isAcceptableJpeg(jpeg, expectedBytes)) return jpeg;
    } catch {
      // ignore
    }
  }

  const binary = Buffer.isBuffer(raw) ? raw : Buffer.from(rawStr, 'binary');
  const fromBinary = extractJpeg(binary);
  if (fromBinary && isAcceptableJpeg(fromBinary, expectedBytes)) return fromBinary;

  // Last resort: any decodable JPEG with SOI
  if (fromB64 && fromB64.length >= 200) return fromB64;
  if (hexOnly.length >= 500) {
    try {
      const buf = Buffer.from(hexOnly, 'hex');
      const jpeg = extractJpeg(buf);
      if (jpeg && jpeg.length >= 200) return jpeg;
    } catch {
      // ignore
    }
  }

  return null;
}

function isAcceptableJpeg(jpeg, expectedBytes) {
  if (!jpeg || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return false;
  if (jpeg.length < 200) return false;
  if (expectedBytes > 0) {
    const minOk = Math.min(expectedBytes * 0.85, expectedBytes - 512);
    if (jpeg.length < minOk && jpeg.indexOf(JPEG_EOI) === -1) return false;
  }
  return true;
}

/**
 * Transfer file in small base64 chunks (reliable on slow serial; each chunk uses execute()).
 * @param {string} tvPath
 * @param {number} fileBytes
 * @returns {Promise<Buffer | null>}
 */
async function transferChunkedBase64(tvPath, fileBytes) {
  const chunks = Math.ceil(fileBytes / CHUNK_BYTES);
  const b64Parts = [];
  let decodedLen = 0;

  console.log(`[Capture] Chunked transfer: ${fileBytes} bytes in ${chunks} chunks`);

  for (let i = 0; i < chunks; i++) {
    const skip = i * CHUNK_BYTES + 1;
    const cmd = `tail -c +${skip} "${tvPath}" | head -c ${CHUNK_BYTES} | base64`;
    const timeoutMs = Math.max(15000, Math.ceil((CHUNK_BYTES * 4) / 300) * 1000);
    const out = await execute(cmd, timeoutMs);
    const piece = String(out).replace(/[^A-Za-z0-9+/=]/g, '');
    if (!piece) {
      console.warn(`[Capture] Empty chunk ${i + 1}/${chunks}`);
      break;
    }
    b64Parts.push(piece);
    try {
      decodedLen = Buffer.from(b64Parts.join(''), 'base64').length;
    } catch {
      // keep going
    }
    console.log(`[Capture] Chunk ${i + 1}/${chunks} (${decodedLen}/${fileBytes} bytes)`);
    if (decodedLen >= fileBytes * 0.98) break;
  }

  if (b64Parts.length === 0) return null;
  try {
    return Buffer.from(b64Parts.join(''), 'base64');
  } catch {
    return null;
  }
}

/**
 * Capture and stream the screenshot file from the TV over serial.
 */
export async function captureFromTVStream(screenId) {
  const filename = `${screenId}.jpg`;
  const tvPath = `/tmp/usb/sda/sda1/${filename}`;

  const captureCmd = `luna-send -n 1 luna://com.webos.service.capture/executeOneShot '{"path":"${tvPath}", "method":"DISPLAY", "width":${STREAM_CAPTURE_WIDTH}, "height":${STREAM_CAPTURE_HEIGHT}, "format":"JPEG"}'`;
  console.log(`[Capture] Requesting ${STREAM_CAPTURE_WIDTH}x${STREAM_CAPTURE_HEIGHT} screenshot on TV`);
  await execute(captureCmd, 10000);

  const expectedBytes = await waitForTvFile(tvPath);
  if (expectedBytes <= 0) {
    throw new Error(`Screenshot file not found on TV at ${tvPath}`);
  }
  console.log(`[Capture] TV file ready: ${expectedBytes} bytes`);

  const whichBase64 = await execute('command -v base64', 2000).catch(() => '');
  const hasBase64 = Boolean(whichBase64 && whichBase64.trim());

  // 1) Chunked base64 — most reliable over 115200 serial
  if (hasBase64) {
    try {
      const fileBuf = await transferChunkedBase64(tvPath, expectedBytes);
      const jpeg = fileBuf ? extractJpeg(fileBuf) : null;
      if (jpeg && jpeg.length >= 200) {
        const destPath = path.join(getScreenshotsDir(), filename);
        fs.writeFileSync(destPath, jpeg);
        console.log(`[Capture] Saved ${jpeg.length} bytes (chunked base64)`);
        return filename;
      }
    } catch (err) {
      console.warn('[Capture] Chunked base64 failed:', err.message);
    }
  }

  // 2) Single-shot base64 stream with byte-count completion
  const attempts = [];
  if (hasBase64) {
    const targetB64 = Math.ceil(expectedBytes / 3) * 4 + 256;
    attempts.push({
      name: 'base64',
      cmd: `base64 "${tvPath}"`,
      targetChars: targetB64,
    });
  }
  const whichXxd = await execute('command -v xxd', 2000).catch(() => '');
  if (whichXxd && whichXxd.trim()) {
    attempts.push({
      name: 'xxd',
      cmd: `xxd -p "${tvPath}"`,
      targetChars: expectedBytes * 2 + 256,
    });
  }

  for (const at of attempts) {
    console.log(`[Capture] Trying ${at.name} stream...`);
    let raw = null;
    try {
      raw = await executeStreamUntilIdle(at.cmd, {
        targetChars: at.targetChars,
        idleMs: 3000,
        graceMs: 25000,
        timeoutMs: 120000,
      });
    } catch (err) {
      console.warn(`[Capture] ${at.name} stream failed:`, err.message);
      raw = Buffer.alloc(0);
    }

    try {
      const dbgPath = path.join(getScreenshotsDir(), `${screenId}.${at.name}.stream.log`);
      if (Buffer.isBuffer(raw) && raw.length > 0) {
        fs.writeFileSync(dbgPath + '.bin', raw);
        fs.writeFileSync(dbgPath, raw.toString('utf8'));
      }
    } catch {
      // ignore debug write errors
    }

    const buffer = decodeJpegFromStream(raw, tvPath, expectedBytes);
    if (buffer) {
      const destPath = path.join(getScreenshotsDir(), filename);
      fs.writeFileSync(destPath, buffer);
      console.log(`[Capture] Saved ${buffer.length} bytes (${at.name} stream)`);
      return filename;
    }
  }

  throw new Error(
    `Failed to decode screenshot stream (expected ~${expectedBytes} bytes from TV). ` +
      'Try Import instead, or capture at 4K to USB only without "Save to laptop".'
  );
}

export function importScreenshot(screenId, sourcePath) {
  const filename = `${screenId}.jpg`;
  const destPath = path.join(getScreenshotsDir(), filename);

  fs.copyFileSync(sourcePath, destPath);

  if (fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }

  return filename;
}
