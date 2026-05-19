import fs from 'fs';
import path from 'path';
import { execute, executeStream } from './serial.js';
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
 * Capture and stream the screenshot file from the TV over serial.
 * The TV file is base64-encoded and streamed; the server decodes and saves it.
 * @param {string} screenId
 * @returns {Promise<string>} filename saved on the server
 */
export async function captureFromTVStream(screenId) {
  const filename = `${screenId}.jpg`;
  const tvPath = `/tmp/usb/sda/sda1/${filename}`;

  // First request the TV to capture the screenshot to its USB path
  const captureCmd = `luna-send -n 1 luna://com.webos.service.capture/executeOneShot '{"path":"${tvPath}", "method":"DISPLAY", "width":3840, "height":2160, "format":"JPEG"}'`;
  await execute(captureCmd, 8000);

  // Use sh -c with printf markers to make markers explicit, and capture everything until __END__.
  // Detect available tools on TV
  let base64Available = false;
  let xxdAvailable = false;
  try {
    const whichBase64 = await execute('command -v base64', 2000).catch(() => '');
    if (whichBase64 && whichBase64.trim()) base64Available = true;
  } catch {}
  try {
    const whichXxd = await execute('command -v xxd', 2000).catch(() => '');
    if (whichXxd && whichXxd.trim()) xxdAvailable = true;
  } catch {}

  const attempts = [];
  // Prioritize xxd first—it's more reliable over serial with fewer quote issues
  if (xxdAvailable) {
    attempts.push({ name: 'xxd', cmd: `xxd -p "${tvPath}"; echo __END__`, timeout: 300000 });
  }
  if (base64Available) {
    // Direct base64 command without sh -c wrapper to avoid nested quote issues
    attempts.push({ name: 'base64', cmd: `base64 "${tvPath}"; echo __END__`, timeout: 300000 });
  }
  // Last-resort attempt: try plain cat (may be binary-mangled)
  attempts.push({ name: 'cat', cmd: `cat "${tvPath}"; echo __END__`, timeout: 300000 });

  let raw = null; // may be string or Buffer
  let attemptName = null;
  for (const at of attempts) {
    attemptName = at.name;
    try {
      const timeout = at.timeout || 300000;
      raw = await executeStream(at.cmd, '__END__', timeout, null);
    } catch (err) {
      raw = (err && err.message) || '';
    }

    // save attempt log
    try {
      const dbgPath = path.join(getScreenshotsDir(), `${screenId}.${attemptName}.stream.log`);
      if (Buffer.isBuffer(raw)) {
        // write binary for raw buffers
        fs.writeFileSync(dbgPath + '.bin', raw);
        // also save a utf8 view for easier inspection
        fs.writeFileSync(dbgPath, raw.toString('utf8'));
      } else {
        fs.writeFileSync(dbgPath, raw || '', 'utf8');
      }
    } catch (err) {
      console.warn('[Capture] failed to write attempt stream log:', err.message);
    }

    // try to decode what we got
    // normalize input for base64 heuristics
    const rawStr = Buffer.isBuffer(raw) ? raw.toString('utf8') : (raw || '');
    let buffer = tryDecodeBase64Candidates(rawStr);
    if (buffer) {
      const destPath = path.join(getScreenshotsDir(), filename);
      fs.writeFileSync(destPath, buffer);
      return filename;
    }
    // if xxd attempt, try hex decode
    if (at.name === 'xxd' || at.name === 'cat') {
      try {
        const rawForHex = Buffer.isBuffer(raw) ? raw.toString('utf8') : (raw || '');
        const hexOnly = rawForHex.replace(/[^0-9a-fA-F]/g, '');
        if (hexOnly.length > 1000) {
          const buf = Buffer.from(hexOnly, 'hex');
          const soi = buf.indexOf(Buffer.from([0xff, 0xd8]));
          if (soi !== -1) {
            const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
            const out = eoi !== -1 ? buf.slice(soi, eoi + 2) : buf.slice(soi);
            const destPath = path.join(getScreenshotsDir(), filename);
            fs.writeFileSync(destPath, out);
            return filename;
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }

  throw new Error('Failed to decode screenshot stream (no valid JPEG found)');

  // Save raw stream for debugging
  try {
    const dbgPath = path.join(getScreenshotsDir(), `${screenId}.stream.log`);
    fs.writeFileSync(dbgPath, raw, 'utf8');
  } catch (err) {
    console.warn('[Capture] failed to write debug stream log:', err.message);
  }
  // Helper: try decode base64-like candidates from raw and validate JPEG signature
  function tryDecodeBase64Candidates(input) {
    const re = /([A-Za-z0-9+/=\r\n]{200,})/g;
    const candidates = [];
    let m;
    while ((m = re.exec(input)) !== null) candidates.push(m[1]);

    // also try the whole input as a last resort
    if (candidates.length === 0) candidates.push(input);

    // Try longest candidates first
    candidates.sort((a, b) => b.length - a.length);

    // Try each candidate individually
    for (const cand of candidates) {
      try {
        const normalized = cand.replace(/\s+/g, '');
        const buf = Buffer.from(normalized, 'base64');
        // locate JPEG SOI/EOI inside buffer
        const soi = buf.indexOf(Buffer.from([0xff, 0xd8]));
        if (soi !== -1) {
          const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
          if (eoi !== -1) return buf.slice(soi, eoi + 2);
          return buf.slice(soi);
        }
      } catch (err) {
        // ignore and try next
      }
    }

    // Try concatenating top candidates (in case stream was split)
    if (candidates.length > 1) {
      try {
        const concat = candidates.join('').replace(/\s+/g, '');
        const buf = Buffer.from(concat, 'base64');
        const soi = buf.indexOf(Buffer.from([0xff, 0xd8]));
        if (soi !== -1) {
          const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
          if (eoi !== -1) return buf.slice(soi, eoi + 2);
          return buf.slice(soi);
        }
      } catch (err) {
        // ignore
      }
    }

    // Last resort: strip all non-base64 chars from input and try decode
    try {
      const filtered = input.replace(/[^A-Za-z0-9+/=]/g, '');
      const buf = Buffer.from(filtered, 'base64');
      const soi = buf.indexOf(Buffer.from([0xff, 0xd8]));
      if (soi !== -1) {
        const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (eoi !== -1) return buf.slice(soi, eoi + 2);
        return buf.slice(soi);
      }
    } catch (err) {
      // ignore
    }

    return null;
  }

  // First attempt: base64
  let buffer = tryDecodeBase64Candidates(raw);

  // Fallback: try hex dump via xxd (some TVs lack base64)
  if (!buffer) {
    try {
      const hexCmd = `xxd -p ${tvPath} ; echo __END__`;
      const rawHex = await executeStream(hexCmd, '__END__', 120000);
      const rawHexStr = Buffer.isBuffer(rawHex) ? rawHex.toString('utf8') : (rawHex || '');
      const hexOnly = rawHexStr.replace(/[^0-9a-fA-F]/g, '');
      if (hexOnly.length >= 2000) {
        const buf = Buffer.from(hexOnly, 'hex');
        if (buf[0] === 0xff && buf[1] === 0xd8) {
          buffer = buf;
        }
      }
    } catch (err) {
      console.warn('[Capture] hex fallback failed:', err.message);
    }
  }

  if (!buffer) {
    throw new Error('Failed to decode screenshot stream (no valid JPEG found)');
  }

  const destPath = path.join(getScreenshotsDir(), filename);
  fs.writeFileSync(destPath, buffer);

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
