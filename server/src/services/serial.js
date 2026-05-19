import { SerialPort } from 'serialport';
import { ReadlineParser } from 'serialport';
import config from '../config.js';

/** @type {SerialPort | null} */
let port = null;
/** @type {ReadlineParser | null} */
let parser = null;
/** @type {'disconnected' | 'connecting' | 'connected' | 'shell-ready'} */
let status = 'disconnected';
/** Stored reference to the parser's data handler so we can remove/re-add it */
let parserDataHandler = null;
/** True while reading raw bytes directly from the port (file transfer). */
let rawMode = false;
/** Serialize serial commands so overlapping execute/stream calls cannot corrupt state. */
let commandChain = Promise.resolve();

function enqueueSerial(fn) {
  const run = commandChain.then(fn, fn);
  commandChain = run.catch(() => {});
  return run;
}

/**
 * Restore line-based parser mode after a raw byte transfer.
 */
function leaveRawMode() {
  if (!port || !parser) return;
  try {
    if (port.isPaused) port.resume();
    try {
      port.unpipe(parser);
    } catch {
      // not piped
    }
    port.pipe(parser);
    if (parserDataHandler) {
      parser.removeListener('data', parserDataHandler);
      parser.on('data', parserDataHandler);
    }
    rawMode = false;
  } catch (e) {
    console.error('[Serial] Failed to restore parser:', e.message);
  }
}

function enterRawMode() {
  if (!port || !parser || rawMode) return;
  if (parserDataHandler) parser.removeListener('data', parserDataHandler);
  try {
    port.unpipe(parser);
  } catch {
    // ignore
  }
  if (port.isPaused) port.resume();
  rawMode = true;
}

/**
 * Re-open the serial port if it was closed (e.g. after a server restart or stream error).
 */
export async function ensureConnected() {
  if (port && port.isOpen) {
    leaveRawMode();
    return getStatus();
  }
  return connect();
}

/**
 * Get current serial connection status.
 */
export function getStatus() {
  return { status, port: config.serial.port, baudRate: config.serial.baudRate };
}

/**
 * Connect to the serial port and initialize the TV shell.
 */
export function connect() {
  return new Promise((resolve, reject) => {
    if (port && port.isOpen) {
      resolve({ status });
      return;
    }

    status = 'connecting';

    try {
      port = new SerialPort({
        path: config.serial.port,
        baudRate: config.serial.baudRate,
        autoOpen: false,
        // Enable RTS/CTS hardware flow control to help with large transfers
        rtscts: true,
        // Increase read buffer
        highWaterMark: 64 * 1024,
      });

      parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      port.on('error', (err) => {
        console.error('[Serial] Error:', err.message);
        status = 'disconnected';
      });

      port.on('close', () => {
        console.log('[Serial] Port closed');
        port = null;
        parser = null;
        rawMode = false;
        status = 'disconnected';
      });

      // Store and attach the parser's data handler
      parserDataHandler = (line) => {
        console.log('[Serial RX]', line);
      };
      parser.on('data', parserDataHandler);

      port.open((err) => {
        if (err) {
          status = 'disconnected';
          reject(new Error(`Failed to open ${config.serial.port}: ${err.message}`));
          return;
        }

        console.log(`[Serial] Opened ${config.serial.port} at ${config.serial.baudRate}`);
        status = 'connected';

        // Initialize: send debug -> s to get to shell
        initShell()
          .then(() => {
            status = 'shell-ready';
            resolve({ status });
          })
          .catch((initErr) => {
            console.error('[Serial] Shell init failed:', initErr.message);
            // Still connected, just not in shell mode
            resolve({ status });
          });
      });
    } catch (err) {
      status = 'disconnected';
      reject(err);
    }
  });
}

/**
 * Send initialization commands to enter TV shell mode.
 */
function initShell() {
  return new Promise((resolve, reject) => {
    if (!port || !port.isOpen) {
      reject(new Error('Port not open'));
      return;
    }

    // Send "debug" to enter debug mode
    setTimeout(() => {
      port.write('debug\r\n', (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('[Serial TX] debug');

        // Wait, then send "s" to enter shell
        setTimeout(() => {
          port.write('s\r\n', (err2) => {
            if (err2) {
              reject(err2);
              return;
            }
            console.log('[Serial TX] s');

            // Give the TV a moment to enter shell mode
            setTimeout(() => {
              resolve();
            }, 2000);
          });
        }, 2000);
      });
    }, 500);
  });
}

/**
 * Disconnect the serial port.
 */
export function disconnect() {
  return new Promise((resolve) => {
    if (!port || !port.isOpen) {
      status = 'disconnected';
      resolve({ status });
      return;
    }

    port.close((err) => {
      if (err) console.error('[Serial] Close error:', err.message);
      port = null;
      parser = null;
      rawMode = false;
      status = 'disconnected';
      resolve({ status });
    });
  });
}

/**
 * Execute a command over serial and return after a timeout.
 * @param {string} command
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<string>} collected output
 */
export function execute(command, timeoutMs = 5000) {
  return enqueueSerial(async () => {
    await ensureConnected();

    if (!port || !port.isOpen) {
      throw new Error('Serial port not connected');
    }

    if (status !== 'shell-ready' && status !== 'connected') {
      throw new Error(`Serial not ready (status: ${status})`);
    }

    leaveRawMode();

    const lines = [];
    const onData = (line) => {
      lines.push(line);
    };

    parser.on('data', onData);

    return new Promise((resolve, reject) => {
      port.write(command + '\r\n', (err) => {
        if (err) {
          parser.removeListener('data', onData);
          reject(err);
          return;
        }

        console.log('[Serial TX]', command);

        setTimeout(() => {
          parser.removeListener('data', onData);
          resolve(lines.join('\n'));
        }, timeoutMs);
      });
    });
  });
}

/**
 * Execute a command and stream raw data until a terminator marker is seen.
 * Useful for receiving base64-encoded file contents over the shell.
 * @param {string} command
 * @param {string} terminator
 * @param {number} [timeoutMs=60000]
 * @returns {Promise<Buffer>} collected raw data (as Buffer) up to the terminator
 */
export function executeStream(command, terminator = '__END__', timeoutMs = 60000, beginMarker = null) {
  return enqueueSerial(async () => {
    await ensureConnected();

    if (!port || !port.isOpen) {
      throw new Error('Serial port not connected');
    }

    if (status !== 'shell-ready' && status !== 'connected') {
      throw new Error(`Serial not ready (status: ${status})`);
    }

    enterRawMode();

    return new Promise((resolve, reject) => {
      let buffers = [];
      let totalLen = 0;
      const termBuf = Buffer.from(terminator, 'utf8');
      const beginBuf = beginMarker ? Buffer.from(beginMarker, 'utf8') : null;
      let started = !beginBuf;

      const cleanup = () => {
        port.removeListener('data', onData);
        clearTimeout(timer);
        leaveRawMode();
      };

      const onData = (chunk) => {
        try {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
          buffers.push(buf);
          totalLen += buf.length;

          const collected = Buffer.concat(buffers, totalLen);

          if (!started && beginBuf) {
            const bi = collected.indexOf(beginBuf);
            if (bi !== -1) {
              const rest = collected.slice(bi + beginBuf.length);
              buffers = [rest];
              totalLen = rest.length;
              started = true;
            }
          }

          if (started) {
            const ti = collected.indexOf(termBuf);
            if (ti !== -1) {
              cleanup();
              resolve(collected.slice(0, ti));
            }
          }
        } catch {
          // ignore
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Stream timed out'));
      }, timeoutMs);

      port.on('data', onData);

      port.write(command + '\r\n', (err) => {
        if (err) {
          cleanup();
          reject(err);
          return;
        }
        console.log('[Serial TX]', command);
      });
    });
  });
}

/**
 * Execute a command and collect raw output until enough payload is received or the stream idles.
 * Does not start the idle timer until the first byte arrives (avoids empty early completion).
 * @param {string} command
 * @param {object} [opts]
 * @param {number} [opts.targetChars=0] - encoded payload length to wait for (base64/hex chars)
 * @param {number} [opts.idleMs=2500]
 * @param {number} [opts.graceMs=20000] - max wait for first byte before failing
 * @param {number} [opts.timeoutMs=180000]
 * @returns {Promise<Buffer>}
 */
export function executeStreamUntilIdle(command, opts = {}) {
  const targetChars = opts.targetChars || 0;
  const idleMs = opts.idleMs ?? 2500;
  const graceMs = opts.graceMs ?? 20000;
  const timeoutMs = opts.timeoutMs ?? 180000;

  return enqueueSerial(async () => {
    await ensureConnected();

    if (!port || !port.isOpen) {
      throw new Error('Serial port not connected');
    }

    if (status !== 'shell-ready' && status !== 'connected') {
      throw new Error(`Serial not ready (status: ${status})`);
    }

    enterRawMode();

    return new Promise((resolve, reject) => {
      let buffers = [];
      let totalLen = 0;
      let idleTimer = null;
      let graceTimer = null;
      let sawData = false;

      const resultBuffer = () => (totalLen > 0 ? Buffer.concat(buffers, totalLen) : Buffer.alloc(0));

      const finish = (err, result) => {
        port.removeListener('data', onData);
        clearTimeout(maxTimer);
        if (idleTimer) clearTimeout(idleTimer);
        if (graceTimer) clearTimeout(graceTimer);
        leaveRawMode();
        if (err) reject(err);
        else resolve(result);
      };

      const payloadCharCount = () => {
        const s = resultBuffer().toString('utf8');
        const b64 = (s.match(/[A-Za-z0-9+/=]/g) || []).length;
        const hex = (s.match(/[0-9a-fA-F]/g) || []).length;
        return Math.max(b64, hex);
      };

      const hasEnoughPayload = () => {
        if (targetChars <= 0) return false;
        return payloadCharCount() >= Math.floor(targetChars * 0.98);
      };

      const scheduleIdle = () => {
        if (!sawData) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          finish(null, resultBuffer());
        }, idleMs);
      };

      const onData = (chunk) => {
        try {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
          if (!sawData) {
            sawData = true;
            if (graceTimer) clearTimeout(graceTimer);
          }
          buffers.push(buf);
          totalLen += buf.length;

          if (hasEnoughPayload()) {
            finish(null, resultBuffer());
            return;
          }
          scheduleIdle();
        } catch {
          // ignore
        }
      };

      graceTimer = setTimeout(() => {
        if (!sawData) {
          finish(new Error('No data received from TV (is the screenshot file readable?)'));
        }
      }, graceMs);

      const maxTimer = setTimeout(() => {
        if (totalLen > 0) {
          finish(null, resultBuffer());
        } else {
          finish(new Error('Stream timed out'));
        }
      }, timeoutMs);

      port.on('data', onData);

      port.write(command + '\r\n', (err) => {
        if (err) {
          finish(err);
          return;
        }
        console.log('[Serial TX]', command);
      });
    });
  });
}
